<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class InsightsTest extends TestCase
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

    public function test_views_count_once_per_viewer_per_day_and_only_where_allowed(): void
    {
        $creator = $this->creator();
        $public = $creator->posts()->create(['body' => 'Hi', 'visibility' => Post::PUBLIC]);
        $locked = $creator->posts()->create(['body' => 'Subs', 'visibility' => Post::SUBSCRIBERS]);
        [$a, $b] = [User::factory()->create(['birthdate' => '1990-01-01']), User::factory()->create(['birthdate' => '1990-01-01'])];

        $this->actingAs($a)->postJson('/posts/views', ['ids' => [$public->id, $locked->id, 999]])->assertOk();
        $this->postJson('/posts/views', ['ids' => [$public->id]]); // same viewer, same day: still one
        $this->actingAs($b)->postJson('/posts/views', ['ids' => [$public->id]]);
        $this->actingAs($creator->user)->postJson('/posts/views', ['ids' => [$public->id]]); // own post: not counted

        $this->assertSame(2, DB::table('post_views')->where('post_id', $public->id)->count());
        $this->assertSame(0, DB::table('post_views')->where('post_id', $locked->id)->count()); // couldn't see it
    }

    public function test_insights_add_up_views_growth_and_earnings(): void
    {
        $creator = $this->creator();
        $post = $creator->posts()->create(['body' => 'Paid', 'visibility' => Post::PUBLIC]);
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        DB::table('post_views')->insert([
            ['post_id' => $post->id, 'viewer' => '1', 'day' => now()->toDateString()],
            ['post_id' => $post->id, 'viewer' => '2', 'day' => now()->subDays(40)->toDateString()], // outside 30 days
        ]);
        $pay = fn (string $purpose, int $amount, $at, ?int $postId = null) => Payment::create([
            'user_id' => $fan->id, 'creator_profile_id' => $creator->id, 'purpose' => $purpose, 'amount' => $amount,
            'platform_fee' => intdiv($amount, 5), 'status' => Payment::PAID, 'provider' => 'fake', 'paid_at' => $at, 'post_id' => $postId,
        ]);
        $pay(Payment::SUBSCRIPTION, 10000, now());
        $pay(Payment::TIP, 5000, now()->subDay(), $post->id);
        $pay(Payment::SUBSCRIPTION, 10000, now()->subDays(45)); // too old
        $creator->followers()->attach($fan->id);

        $this->actingAs($creator->user)->get('/studio/insights')->assertInertia(fn ($p) => $p
            ->component('studio/insights')
            ->where('days', 30)
            ->where('totals.views', 1)
            ->where('totals.earnings', 12000) // (10000 + 5000) − 20%
            ->where('totals.newSubscriptions', 1)
            ->where('totals.newFollowers', 1)
            ->has('series.views', 30)
            ->where('posts.0.views', 1)
            ->where('posts.0.earned', 4000));
        $this->get('/studio/insights?days=90')->assertInertia(fn ($p) => $p->where('totals.views', 2)->where('totals.earnings', 20000));

        $this->actingAs($fan)->get('/studio/insights')->assertNotFound();
    }
}
