<?php

namespace Tests\Feature;

use App\Media\Paths;
use App\Media\Previews;
use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Library and message videos get their still and seek-bar frames too, behind the same checks as the video. */
class PreviewAccessTest extends TestCase
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
            'bank_name' => 'Хаан банк', 'bank_account' => '50000000'.$this->n, 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'dm_policy' => 'everyone',
        ]);
    }

    /** A video in $creator's library, with its frames. */
    private function libraryVideo(CreatorProfile $creator)
    {
        $path = "users/{$creator->user_id}/library/2026/11/clip.web.mp4";
        Storage::disk('local')->put($path, 'video');
        Previews::store($path, 'poster-jpeg', 'thumbs-jpeg', ['cols' => 2, 'count' => 2, 'interval' => 5.0, 'w' => 160, 'h' => 90], ['duration' => 10.0]);

        return $creator->vaultItems()->create(['type' => 'video', 'path' => $path, 'mime' => 'video/mp4']);
    }

    public function test_library_videos_show_their_frames_to_their_creator_only(): void
    {
        $creator = $this->creator('artist');
        $item = $this->libraryVideo($creator);

        $this->actingAs($creator->user)->get(route('studio.library'))->assertInertia(fn ($p) => $p
            ->where('items.0.poster', route('studio.library.preview', [$item, 'poster']))
            ->where('items.0.thumbs.cols', 2)->where('items.0.duration', 10));
        $this->assertSame('poster-jpeg', $this->get(route('studio.library.preview', [$item, 'poster']))->assertOk()->streamedContent() ?: Storage::disk('local')->get(Paths::poster($item->path)));

        $this->actingAs($this->creator('other')->user)->get(route('studio.library.preview', [$item, 'poster']))->assertNotFound();
    }

    public function test_message_videos_show_their_frames_to_the_conversation_and_only_once_unlocked(): void
    {
        $creator = $this->creator('artist');
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $creator->subscriptions()->create(['user_id' => $fan->id, 'expires_at' => now()->addMonth()]);
        $item = $this->libraryVideo($creator);
        $chat = Conversation::between($creator->user, $fan);

        $this->actingAs($creator->user)->post(route('messages.send', $chat), ['vault' => [$item->id]])->assertSessionHasNoErrors();
        $free = $chat->messages()->sole()->media()->sole();
        $this->actingAs($fan)->get(route('messages.show', $chat))->assertInertia(fn ($p) => $p
            ->where('thread.messages.0.media.0.poster', route('messages.media.preview', [$free, 'poster'])));
        $this->get(route('messages.media.preview', [$free, 'thumbs']))->assertOk();
        $this->actingAs(User::factory()->create(['birthdate' => '1990-01-01']))->get(route('messages.media.preview', [$free, 'poster']))->assertNotFound();

        // A paid message: no frames until it's bought (they'd show what's in it).
        $this->actingAs($creator->user)->post(route('messages.send', $chat), ['vault' => [$item->id], 'price' => 5000])->assertSessionHasNoErrors();
        $paid = $chat->messages()->latest('id')->first()->media()->sole();
        $this->actingAs($fan)->get(route('messages.media.preview', [$paid, 'poster']))->assertForbidden();
        $this->actingAs($creator->user)->get(route('messages.media.preview', [$paid, 'poster']))->assertOk();
    }
}
