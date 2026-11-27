<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Models\User;
use App\Models\VaultItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class LibraryTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function creator(string $handle): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => ucfirst($handle), 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '500000000'.$this->n, 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'dm_policy' => 'everyone',
        ]);
    }

    public function test_uploads_join_the_library_and_can_be_reused_without_uploading_again(): void
    {
        $creator = $this->creator('artist');
        $this->actingAs($creator->user)->post(route('studio.posts.store'), [
            'body' => 'First', 'visibility' => Post::SUBSCRIBERS, 'media' => [UploadedFile::fake()->image('a.jpg')],
        ])->assertSessionHasNoErrors();
        $item = $creator->vaultItems()->sole();
        $first = Post::where('body', 'First')->sole();
        $first->media()->update(['scan_status' => 'ok']);

        // Reused: the new post points at the same stored file, and the scan result carries over.
        $this->post(route('studio.posts.store'), ['body' => 'Again', 'visibility' => Post::PUBLIC, 'vault' => [$item->id]])->assertSessionHasNoErrors();
        $again = Post::where('body', 'Again')->sole()->media()->sole();
        $this->assertSame($item->path, $again->path);
        $this->assertSame('ok', $again->scan_status);
        $this->assertSame(1, $creator->vaultItems()->count());

        // The library lists it with how often it's used; only its creator can open the file.
        $this->getJson(route('studio.library.items'))->assertJsonPath('items.0.uses', 2);
        $this->get(route('studio.library.file', $item))->assertOk();
        $other = $this->creator('other');
        $this->actingAs($other->user)->get(route('studio.library.file', $item))->assertNotFound();
        // ...and nobody else can attach it.
        $this->post(route('studio.posts.store'), ['body' => 'Steal', 'visibility' => Post::PUBLIC, 'vault' => [$item->id]])->assertSessionHasErrors('vault.0');

        // Deleting posts never breaks the other uses: the file goes only when nothing uses it.
        $this->actingAs($creator->user)->delete(route('studio.posts.destroy', $first));
        $this->assertTrue(Storage::exists($item->path));
        $this->delete(route('studio.posts.destroy', Post::where('body', 'Again')->sole()));
        $this->assertTrue(Storage::exists($item->path)); // still in the library
        $this->delete(route('studio.library.destroy', $item));
        $this->assertFalse(Storage::exists($item->path));
    }

    public function test_library_shows_how_each_file_did_and_hands_files_to_the_composer(): void
    {
        $creator = $this->creator('artist');
        $this->actingAs($creator->user)->post(route('studio.library.store'), [
            'media' => [UploadedFile::fake()->image('a.jpg'), UploadedFile::fake()->image('b.jpg')],
        ])->assertSessionHasNoErrors();
        [$a, $b] = $creator->vaultItems()->orderBy('id')->get()->all();
        $this->post(route('studio.posts.store'), ['body' => 'Paid', 'visibility' => Post::PUBLIC, 'price' => 5000, 'vault' => [$a->id]]);
        $post = Post::where('body', 'Paid')->sole();
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        DB::table('post_views')->insert(['post_id' => $post->id, 'viewer' => (string) $fan->id, 'day' => now()->toDateString()]);
        Payment::create(['user_id' => $fan->id, 'creator_profile_id' => $creator->id, 'purpose' => 'ppv', 'post_id' => $post->id,
            'amount' => 5000, 'platform_fee' => 1000, 'status' => 'paid', 'provider' => 'fake', 'paid_at' => now()]);

        $this->get(route('studio.library', ['sort' => 'earned']))->assertInertia(fn ($p) => $p
            ->where('items.0.id', $a->id)->where('items.0.earned', 4000)->where('items.0.views', 1)
            ->where('unusedCount', 1));
        $this->get(route('studio.library', ['unused' => 1]))->assertInertia(fn ($p) => $p->has('items', 1)->where('items.0.id', $b->id));
        $this->getJson(route('studio.library.usage', $a))->assertJsonPath('posts.0.id', $post->id)->assertJsonPath('posts.0.earned', 4000);

        // "Post" / "Message fans" from the library: the studio opens with those files attached (only the creator's own).
        $theirs = $this->creator('other')->vaultItems()->create(['type' => 'image', 'path' => 'library/x.jpg', 'mime' => 'image/jpeg']);
        $this->get(route('studio', ['use' => "{$b->id},{$a->id},{$theirs->id}", 'to' => 'fans']))->assertInertia(fn ($p) => $p
            ->where('prefillFor', 'fans')->has('prefill', 2)->where('prefill.0.id', $b->id));

        // Several out at once; the file a post uses stays stored.
        $this->delete(route('studio.library.destroy-many'), ['ids' => [$a->id, $b->id, $theirs->id]])->assertSessionHas('status', 'library-removed:2');
        $this->assertSame(0, $creator->vaultItems()->count());
        $this->assertTrue(Storage::exists($a->path));
        $this->assertFalse(Storage::exists($b->path));
        $this->assertNotNull($theirs->fresh());
    }

    public function test_library_items_in_messages_and_direct_uploads(): void
    {
        $creator = $this->creator('artist');
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $creator->subscriptions()->create(['user_id' => $fan->id, 'expires_at' => now()->addMonth()]);
        $this->actingAs($creator->user)->post(route('studio.library.store'), ['media' => [UploadedFile::fake()->image('a.jpg'), UploadedFile::fake()->image('b.jpg')]])
            ->assertSessionHasNoErrors();
        [$a, $b] = $creator->vaultItems()->orderBy('id')->get()->all();

        $conversation = Conversation::between($creator->user, $fan);
        $this->post(route('messages.send', $conversation), ['vault' => [$b->id, $a->id], 'price' => 5000])->assertSessionHasNoErrors();
        $message = $conversation->messages()->sole();
        $this->assertSame([$b->path, $a->path], $message->media()->orderBy('position')->pluck('path')->all());
        $this->assertSame(5000, $message->price);

        // A fan has no library.
        $this->actingAs($fan)->post(route('messages.send', $conversation), ['body' => 'hi', 'vault' => [$a->id]])->assertSessionHasErrors('vault');

        // Blocked files can't be reused.
        DB::table('media_blocklist')->insert(['sha256' => $a->sha256, 'reason' => 'test', 'created_at' => now(), 'updated_at' => now()]);
        $this->actingAs($creator->user)->post(route('studio.posts.store'), ['visibility' => Post::PUBLIC, 'vault' => [$a->id]])->assertSessionHasErrors('vault.0');

        $this->get(route('studio.library'))->assertInertia(fn ($p) => $p->component('studio/library')->has('items', 2)->where('counts.image', 2));
        $this->assertSame(2, VaultItem::count());
    }
}
