<?php

namespace Tests\Feature;

use App\Jobs\ScanMedia;
use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\PostMedia;
use App\Models\User;
use App\Models\VaultItem;
use App\Moderation\Scanner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Creators post music and podcasts: audio is a third kind of media next to photos and videos. */
class AudioUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function creator(): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'dm_policy' => 'everyone',
        ]);
    }

    public function test_a_podcast_episode_is_posted_as_audio_and_shown_to_fans(): void
    {
        $creator = $this->creator();
        $this->actingAs($creator->user)->post('/studio/posts', [
            'body' => "Episode 1: Life in the steppe\nShow notes…", 'visibility' => Post::PUBLIC,
            'media' => [UploadedFile::fake()->create('episode-1.mp3', 60 * 1024, 'audio/mpeg')], // 60 MB: fine for audio
        ])->assertSessionHasNoErrors();

        $media = PostMedia::sole();
        $this->assertSame(['audio', 'audio/mpeg'], [$media->type, $media->mime]);
        $this->assertSame('audio', $creator->vaultItems()->sole()->type); // joins the library too

        $this->actingAs(User::factory()->create(['birthdate' => '1990-01-01']))->get('/@artist')->assertInertia(fn ($p) => $p
            ->where('posts.0.media.0.type', 'audio')
            ->where('posts.0.counts.audio', 1));
        $this->get("/media/{$media->id}")->assertOk()->assertHeader('Content-Type', 'audio/mpeg');
    }

    public function test_each_kind_has_its_own_size_limit(): void
    {
        $this->actingAs($this->creator()->user);

        $this->post('/studio/posts', ['body' => 'x', 'visibility' => 'public', 'media' => [UploadedFile::fake()->create('long.mp3', 101 * 1024, 'audio/mpeg')]])
            ->assertSessionHasErrors('media.0');
        $this->post('/studio/posts', ['body' => 'x', 'visibility' => 'public', 'media' => [UploadedFile::fake()->create('clip.mp4', 41 * 1024, 'video/mp4')]])
            ->assertSessionHasErrors('media.0'); // videos stay at 40 MB
        $this->post('/studio/posts', ['body' => 'x', 'visibility' => 'public', 'media' => [UploadedFile::fake()->create('notes.pdf', 100, 'application/pdf')]])
            ->assertSessionHasErrors('media.0');
        $this->assertSame(0, Post::count());
    }

    public function test_an_m4a_detected_as_video_is_stored_as_audio_and_skips_the_picture_scan(): void
    {
        $this->actingAs($this->creator()->user)->post(route('studio.library.store'), [
            'media' => [UploadedFile::fake()->create('song.m4a', 4000, 'video/mp4')],
        ])->assertSessionHasNoErrors();
        $this->assertSame(['audio', 'audio/mp4'], [VaultItem::sole()->type, VaultItem::sole()->mime]);

        $this->post('/studio/posts', ['body' => 'New song', 'visibility' => 'public', 'vault' => [VaultItem::sole()->id]]);
        $media = PostMedia::sole();
        $media->forceFill(['scan_status' => 'pending'])->save();
        (new ScanMedia(PostMedia::class, $media->id))->handle(app(Scanner::class));
        $this->assertSame('ok', $media->fresh()->scan_status);
    }

    public function test_audio_in_a_message(): void
    {
        $creator = $this->creator();
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $creator->followers()->attach($fan->id);
        $chat = Conversation::between($creator->user, $fan);

        $this->actingAs($creator->user)->post("/messages/{$chat->id}", [
            'media' => [UploadedFile::fake()->create('voice.ogg', 500, 'audio/ogg')],
        ])->assertSessionHasNoErrors();

        $this->assertSame('audio', $chat->messages()->sole()->media()->sole()->type);
    }
}
