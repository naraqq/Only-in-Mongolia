<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\Report;
use App\Models\User;
use App\Moderation\Scanner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ModerationTest extends TestCase
{
    use RefreshDatabase;

    private function creator(): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => true,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    /** A scanner that flags everything as a possible minor. */
    private function flagEverything(): void
    {
        $this->app->bind(Scanner::class, fn () => new class implements Scanner
        {
            public function scan(string $path, string $mime, bool $adult): array
            {
                return ['verdict' => 'flag', 'reason' => 'minor', 'labels' => ['test' => true]];
            }
        });
    }

    private function photo(string $name = 'a.jpg'): UploadedFile
    {
        return UploadedFile::fake()->image($name, 300, 200);
    }

    public function test_clean_uploads_are_fingerprinted_scanned_and_published(): void
    {
        Storage::fake();
        $creator = $this->creator();
        $this->actingAs($creator->user)->post('/studio/posts', ['body' => 'Hi', 'visibility' => Post::PUBLIC, 'media' => [$this->photo()]])->assertSessionHasNoErrors();

        $media = Post::sole()->media()->sole();
        $this->assertSame(64, strlen($media->sha256));
        $this->assertSame('ok', $media->scan_status); // the queue runs at once in tests
        $this->get('/@artist')->assertInertia(fn ($p) => $p->has('posts', 1));
    }

    public function test_flagged_posts_are_held_reported_and_hidden_but_released_on_dismiss(): void
    {
        Storage::fake();
        $this->flagEverything();
        $creator = $this->creator();
        $this->actingAs($creator->user)->post('/studio/posts', ['body' => 'Hi', 'visibility' => Post::PUBLIC, 'media' => [$this->photo()]]);
        $post = Post::sole();
        $media = $post->media()->sole();

        $this->assertNotNull($post->held_at);
        $this->assertSame('flagged', $media->scan_status);
        $report = Report::sole();
        $this->assertSame(['minor', null, true], [$report->reason, $report->reporter_id, $report->isUrgent()]);

        // Hidden from fans (page, file), still there for the creator.
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->actingAs($fan)->get('/@artist')->assertInertia(fn ($p) => $p->has('posts', 0));
        $this->get("/media/{$media->id}")->assertForbidden();

        // An admin decides it's fine: released.
        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin)->post("/admin/reports/{$report->id}/act", ['action' => 'dismiss'])->assertSessionHasNoErrors();
        $this->assertNull($post->fresh()->held_at);
        $this->actingAs($fan)->get('/@artist')->assertInertia(fn ($p) => $p->has('posts', 1));
    }

    public function test_removed_files_can_never_be_uploaded_again_by_anyone(): void
    {
        Storage::fake();
        $creator = $this->creator();
        $file = $this->photo('same.jpg');
        $bytes = file_get_contents($file->getRealPath());
        $this->actingAs($creator->user)->post('/studio/posts', ['body' => 'Hi', 'visibility' => Post::PUBLIC, 'media' => [$file]]);
        $post = Post::sole();

        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $report = Report::create(['reporter_id' => $fan->id, 'reportable_type' => Post::class, 'reportable_id' => $post->id, 'reason' => 'nonconsensual', 'status' => 'open']);
        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin)->post("/admin/reports/{$report->id}/act", ['action' => 'remove']);
        $this->assertSame(1, DB::table('media_blocklist')->count());
        $this->assertSame(0, Post::count());

        // The exact same file, renamed: refused, without saying why.
        $again = UploadedFile::fake()->createWithContent('renamed.jpg', $bytes);
        $this->actingAs($creator->user)->post('/studio/posts', ['body' => 'Again', 'visibility' => Post::PUBLIC, 'media' => [$again]])
            ->assertSessionHasErrors('media.0');
        $this->assertSame(0, Post::count());
    }
}
