<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** What creators see beyond the basics: change vs before, subscriber health, when fans respond, how videos are watched. */
class CreatorAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    private function creator(): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    private function fan(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    public function test_video_watching_is_counted_from_3_seconds_per_viewer_per_day(): void
    {
        $creator = $this->creator();
        $post = $creator->posts()->create(['body' => 'Clip', 'visibility' => Post::PUBLIC]);
        $video = $post->media()->create(['type' => 'video', 'path' => 'v.mp4', 'mime' => 'video/mp4', 'position' => 0]);
        $fan = $this->fan();

        $this->actingAs($fan)->postJson('/posts/watch', ['media_id' => $video->id, 'seconds' => 2, 'percent' => 5])->assertOk();
        $this->assertSame(0, DB::table('video_watches')->count()); // a glance isn't a play

        $this->postJson('/posts/watch', ['media_id' => $video->id, 'seconds' => 15, 'percent' => 40]);
        $this->postJson('/posts/watch', ['media_id' => $video->id, 'seconds' => 10, 'percent' => 30]); // went back: furthest stays 40
        $row = DB::table('video_watches')->sole();
        $this->assertSame([25, 40], [(int) $row->seconds, (int) $row->max_percent]);

        // Not counted: the creator's own plays, and videos the viewer can't see.
        $this->actingAs($creator->user)->postJson('/posts/watch', ['media_id' => $video->id, 'seconds' => 60, 'percent' => 100]);
        $locked = $creator->posts()->create(['body' => 'Subs', 'visibility' => Post::SUBSCRIBERS])
            ->media()->create(['type' => 'video', 'path' => 'w.mp4', 'mime' => 'video/mp4', 'position' => 0]);
        $this->actingAs($this->fan())->postJson('/posts/watch', ['media_id' => $locked->id, 'seconds' => 60, 'percent' => 100]);
        $this->assertSame(1, DB::table('video_watches')->count());
        $this->postJson('/posts/watch', ['media_id' => $video->id, 'seconds' => 99999, 'percent' => 50])->assertUnprocessable();
    }

    public function test_insights_show_change_subscriber_health_activity_and_videos(): void
    {
        $creator = $this->creator();
        $post = $creator->posts()->create(['body' => 'Clip', 'visibility' => Post::PUBLIC]);
        $video = $post->media()->create(['type' => 'video', 'path' => 'v.mp4', 'mime' => 'video/mp4', 'position' => 0]);
        [$a, $b, $c] = [$this->fan(), $this->fan(), $this->fan()];

        // Views: 1 in the previous 30 days, 2 in this period.
        DB::table('post_views')->insert([
            ['post_id' => $post->id, 'viewer' => 'x', 'day' => now()->subDays(40)->toDateString()],
            ['post_id' => $post->id, 'viewer' => 'a', 'day' => now()->toDateString()],
            ['post_id' => $post->id, 'viewer' => 'b', 'day' => now()->toDateString()],
        ]);
        // Subscribers: a active with auto-renew (renewed this period), b active ending in 3 days, c lapsed last week.
        $creator->subscriptions()->create(['user_id' => $a->id, 'expires_at' => now()->addDays(20), 'auto_renew' => true]);
        $creator->subscriptions()->create(['user_id' => $b->id, 'expires_at' => now()->addDays(3), 'auto_renew' => false]);
        $creator->subscriptions()->create(['user_id' => $c->id, 'expires_at' => now()->subDays(7)]);
        Payment::create(['user_id' => $a->id, 'creator_profile_id' => $creator->id, 'purpose' => 'subscription', 'amount' => 10000, 'platform_fee' => 2000,
            'status' => 'paid', 'provider' => 'fake', 'paid_at' => now()->subDays(2)])->forceFill(['renewal' => true])->save();
        // A like on Saturday at 20:30 Mongolian time.
        $saturday = now()->setTimezone('Asia/Ulaanbaatar')->previous('Saturday')->setTime(20, 30)->setTimezone(config('app.timezone'));
        DB::table('post_likes')->insert(['user_id' => $a->id, 'post_id' => $post->id, 'created_at' => $saturday, 'updated_at' => $saturday]);
        // Video: two viewers, one to the end.
        DB::table('video_watches')->insert([
            ['post_media_id' => $video->id, 'viewer' => 'a', 'day' => now()->toDateString(), 'seconds' => 60, 'max_percent' => 100],
            ['post_media_id' => $video->id, 'viewer' => 'b', 'day' => now()->toDateString(), 'seconds' => 20, 'max_percent' => 30],
        ]);

        $this->actingAs($creator->user)->get(route('studio.insights'))->assertInertia(fn ($p) => $p
            ->where('totals.views', 2)->where('previous.views', 1)
            ->where('health.active', 2)->where('health.autoRenew', 1)->where('health.renewed', 1)->where('health.lapsed', 1)
            ->where('health.endingSoon', 1)->where('health.monthly', 16000) // 2 × 10,000 after the 20% fee
            ->where('activity.5.20', 1)
            ->where('videos.0.id', $video->id)->where('videos.0.plays', 2)->where('videos.0.finished', 1)
            ->where('videos.0.avgPercent', 65)->where('videos.0.seconds', 80));
    }
}
