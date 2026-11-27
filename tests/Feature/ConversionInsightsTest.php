<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Models\User;
use App\Payments\FakeGateway;
use App\Payments\Payments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ConversionInsightsTest extends TestCase
{
    use RefreshDatabase;

    private function creator(string $handle = 'artist'): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => ucfirst($handle), 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    private function fan(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    public function test_visits_record_how_the_visitor_found_the_page_once_per_day(): void
    {
        $creator = $this->creator();
        $fan = $this->fan();

        $this->actingAs($fan)->postJson('/visits', ['handle' => 'artist', 'page' => 'profile', 'from' => 'https://l.instagram.com/?u=x'])->assertOk();
        $this->postJson('/visits', ['handle' => 'artist', 'page' => 'profile', 'from' => 'https://l.instagram.com/']); // same day: one row
        $this->postJson('/visits', ['handle' => 'artist', 'page' => 'series', 'page_id' => 999, 'from' => null]); // not their series: ignored
        $this->actingAs($creator->user)->postJson('/visits', ['handle' => 'artist', 'page' => 'profile']); // own page: not counted

        $this->assertSame(1, DB::table('page_visits')->count());
        $this->assertSame('instagram.com', DB::table('page_visits')->value('referrer'));
    }

    public function test_a_ref_tag_wins_and_in_app_places_are_named(): void
    {
        $this->creator();
        $this->actingAs($a = $this->fan())->postJson('/visits', ['handle' => 'artist', 'page' => 'profile', 'ref' => 'Story', 'from' => 'https://facebook.com/']);
        $this->actingAs($this->fan())->postJson('/visits', ['handle' => 'artist', 'page' => 'profile', 'from' => url('/creators')]);

        $this->assertEqualsCanonicalizing(['ref:story', 'app:discover'], DB::table('page_visits')->pluck('referrer')->all());
    }

    public function test_follows_remember_the_page_the_free_post_and_the_referrer(): void
    {
        $creator = $this->creator();
        $free = $creator->posts()->create(['body' => 'Free', 'visibility' => Post::PUBLIC]);
        $subsOnly = $creator->posts()->create(['body' => 'Subs', 'visibility' => Post::SUBSCRIBERS]);
        $fan = $this->fan();

        $this->actingAs($fan)->postJson('/visits', ['handle' => 'artist', 'page' => 'profile', 'ref' => 'tiktok']);
        $this->postJson('/posts/views', ['ids' => [$free->id, $subsOnly->id]]);
        $this->from('/@artist')->post('/@artist/follow')->assertRedirect('/@artist');
        $this->from('/@artist')->post('/@artist/follow'); // again: still one follow

        $row = DB::table('follows')->where('user_id', $fan->id)->first();
        $this->assertSame(['profile', $free->id, 'ref:tiktok'], [$row->source, $row->source_post_id, $row->referrer]);
        $this->assertSame(1, DB::table('follows')->count());
    }

    public function test_subscriptions_remember_the_locked_post_they_came_from(): void
    {
        $creator = $this->creator();
        $locked = $creator->posts()->create(['body' => 'Subs', 'visibility' => Post::SUBSCRIBERS]);
        $fan = $this->fan();

        $this->actingAs($fan)->from('/feed')->get("/@artist/subscribe?post={$locked->id}")->assertOk();
        $this->from('/@artist/subscribe')->post('/@artist/subscribe')->assertRedirect();

        $payment = Payment::where('user_id', $fan->id)->firstOrFail();
        $this->assertSame(['post', $locked->id], [$payment->source, (int) $payment->source_id]);
    }

    public function test_subscriptions_from_a_series_page(): void
    {
        $creator = $this->creator();
        $series = $creator->series()->create(['title' => 'Behind the scenes']);
        $fan = $this->fan();

        $this->actingAs($fan)->from("/@artist/series/{$series->id}")->get('/@artist/subscribe')->assertOk();
        $this->get('/@artist/subscribe'); // reloading the checkout keeps the series
        $this->post('/@artist/subscribe');

        $this->assertSame(['series', $series->id], [Payment::first()->source, (int) Payment::first()->source_id]);
    }

    public function test_renewals_are_not_new_subscriptions(): void
    {
        $creator = $this->creator();
        $fan = $this->fan();
        $payments = app(Payments::class);
        foreach ([1, 2] as $_) { // subscribe, then extend while still active
            $this->actingAs($fan)->from('/@artist')->get('/@artist/subscribe');
            $this->post('/@artist/subscribe');
            $payment = Payment::where('status', Payment::PENDING)->firstOrFail();
            FakeGateway::markPaid($payment);
            $payments->settle($payment);
        }

        $this->assertSame([false, true], Payment::orderBy('created_at')->orderBy('id')->pluck('renewal')->all());
        $this->actingAs($creator->user)->get('/studio/insights')->assertInertia(fn ($p) => $p
            ->where('totals.newSubscriptions', 1)
            ->where('totals.earnings', 16000) // both payments still count as money
            ->where('conversions.places.0.subscriptions', 1));
    }

    public function test_insights_show_free_posts_places_and_referrers(): void
    {
        $creator = $this->creator();
        $free = $creator->posts()->create(['body' => 'Free hello', 'visibility' => Post::PUBLIC]);
        $fan = $this->fan();

        $this->actingAs($fan)->postJson('/visits', ['handle' => 'artist', 'page' => 'profile', 'from' => 'https://www.instagram.com/']);
        $this->postJson('/posts/views', ['ids' => [$free->id]]);
        $this->from('/@artist')->post('/@artist/follow');
        $this->from('/@artist')->get('/@artist/subscribe');
        $this->post('/@artist/subscribe');
        FakeGateway::markPaid(Payment::first());
        app(Payments::class)->settle(Payment::first());

        $this->actingAs($creator->user)->get('/studio/insights')->assertInertia(fn ($p) => $p
            ->component('studio/insights')
            ->where('conversions.freePosts.0.id', $free->id)
            ->where('conversions.freePosts.0.views', 1)
            ->where('conversions.freePosts.0.follows', 1)
            ->where('conversions.freePosts.0.subscribed', 1)
            ->where('conversions.places.0.source', 'profile')
            ->where('conversions.places.0.visitors', 1)
            ->where('conversions.places.0.follows', 1)
            ->where('conversions.places.0.subscriptions', 1)
            ->where('conversions.places.0.revenue', 8000)
            ->where('conversions.referrers.0.referrer', 'instagram.com')
            ->where('conversions.referrers.0.subscriptions', 1));
    }
}
