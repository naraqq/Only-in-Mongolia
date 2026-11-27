<?php

namespace Tests\Feature;

use App\Jobs\ProcessAdVideo;
use App\Media\Ffmpeg;
use App\Models\Ad;
use App\Models\Company;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Companies buy sponsored banners themselves: pay up front, an admin approves (it runs) or rejects (refunded). */
class BusinessAdsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['ads.daily_price' => 20000, 'ads.max_days' => 90, 'ads.video_max_seconds' => 60]);
    }

    private function owner(): User
    {
        $user = User::factory()->create(['birthdate' => '1990-01-01']);
        Company::create(['user_id' => $user->id, 'name' => 'Нүүдэл Кофе', 'register_number' => '6123402', 'email' => 'hi@example.com']);

        return $user;
    }

    private function topUp(User $user, int $amount): void
    {
        $this->actingAs($user)->post('/wallet/topup', ['amount' => $amount]);
        $this->post('/payments/'.Payment::where('purpose', Payment::TOPUP)->latest('id')->value('id').'/fake-pay');
    }

    /** Submit a campaign from today for $days days. */
    private function submit(User $user, string $pay = 'qpay', int $days = 7, ?UploadedFile $media = null)
    {
        return $this->actingAs($user)->post('/business/campaigns', [
            'title' => 'Шинэ латте', 'body' => '2 дахь аяга үнэгүй', 'url' => 'https://example.com/latte',
            'starts_on' => now()->toDateString(), 'ends_on' => now()->addDays($days - 1)->toDateString(),
            'media' => $media ?? UploadedFile::fake()->image('banner.jpg', 1200, 1000), 'pay' => $pay,
        ]);
    }

    private function liveIds(): array
    {
        return collect($this->getJson('/ads/slot')->json('ads'))->pluck('id')->all();
    }

    public function test_a_company_is_added_with_a_7_digit_register_number(): void
    {
        $user = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->actingAs($user)->get('/business')->assertRedirect('/business/company');

        $this->post('/business/company', ['name' => 'X', 'register_number' => '12345', 'email' => 'a@b.mn'])->assertSessionHasErrors('register_number');
        $this->post('/business/company', ['name' => 'Нүүдэл Кофе', 'register_number' => '6123402', 'email' => 'hi@example.com', 'logo' => UploadedFile::fake()->image('l.png', 500, 500)])
            ->assertRedirect('/business/campaigns/new');
        $company = $user->fresh()->company;
        $this->assertSame('Нүүдэл Кофе', $company->name);
        Storage::disk('public')->assertExists($company->logo_path);
    }

    public function test_a_campaign_paid_with_qpay_waits_for_review_then_runs_once_approved(): void
    {
        $user = $this->owner();
        $this->submit($user, 'qpay', 7)->assertRedirect();
        $ad = Ad::sole();
        $payment = Payment::where('purpose', Payment::AD)->sole();
        $this->assertSame([Ad::UNPAID, 140000, 140000, null, $ad->id], [$ad->review_status, $payment->amount, $payment->platform_fee, $payment->creator_profile_id, $payment->ad_id]);
        $this->get("/payments/{$payment->id}")->assertInertia(fn ($p) => $p->component('payments/ad')->where('campaign.id', $ad->id));
        $this->assertSame([], $this->liveIds());

        $this->post("/payments/{$payment->id}/fake-pay")->assertSessionHas('status', 'ad-paid');
        $this->assertSame(Ad::PENDING, $ad->fresh()->review_status);
        $this->assertSame([], $this->liveIds()); // paid is not enough

        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin)->get('/admin/ads')->assertInertia(fn ($p) => $p->has('review', 1)->where('review.0.company.register_number', '6123402')->where('adminCounts.ads', 1));
        $this->post("/admin/ads/{$ad->id}/approve")->assertSessionHas('status', 'ad-approved');
        $this->assertSame([$ad->id], $this->liveIds());
        $this->assertSame('ad_approved', $user->notifications()->value('type'));

        // Not a sale for anyone's earnings.
        $this->assertNotContains(Payment::AD, Payment::SALES);
    }

    public function test_rejecting_a_wallet_paid_campaign_refunds_the_wallet_and_tells_the_company_why(): void
    {
        $user = $this->owner();
        $this->topUp($user, 200000);
        $this->submit($user, 'wallet', 5)->assertRedirect();
        $ad = Ad::sole();
        $this->assertSame(Ad::PENDING, $ad->review_status); // paid on the spot
        $this->assertSame(100000, $user->fresh()->wallet_balance);

        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin)->post("/admin/ads/{$ad->id}/reject", ['reason' => 'Misleading offer'])->assertSessionHas('status', 'ad-rejected');

        $this->assertSame([Ad::REJECTED, 'Misleading offer'], [$ad->fresh()->review_status, $ad->fresh()->reject_reason]);
        $this->assertSame(200000, $user->fresh()->wallet_balance);
        $this->assertSame(Payment::REFUNDED, Payment::where('purpose', Payment::AD)->value('status'));
        $notice = $user->notifications()->sole();
        $this->assertSame(['ad_rejected', 'Misleading offer', true], [$notice->type, $notice->data['reason'], $notice->data['wallet']]);
        $this->post("/admin/ads/{$ad->id}/approve")->assertStatus(409); // already decided
    }

    public function test_a_campaign_approved_after_its_first_day_still_gets_every_paid_day(): void
    {
        $user = $this->owner();
        $this->topUp($user, 200000);
        $this->submit($user, 'wallet', 5);
        $ad = Ad::sole();
        $this->travel(2)->days();

        $this->actingAs(User::factory()->create(['is_admin' => true]))->post("/admin/ads/{$ad->id}/approve");
        $ad->refresh();
        $this->assertSame([now()->toDateString(), now()->addDays(4)->toDateString()], [$ad->starts_on->toDateString(), $ad->ends_on->toDateString()]);
    }

    public function test_limits_and_ownership(): void
    {
        $user = $this->owner();
        $this->submit($user, 'qpay', 91)->assertSessionHasErrors('ends_on');
        $this->topUp($user, 10000);
        $this->submit($user, 'wallet', 7)->assertRedirect('/business')->assertSessionHasErrors('payment'); // wallet too short
        $ad = Ad::sole();
        $this->assertSame(Ad::UNPAID, $ad->review_status); // saved; can be paid later

        $other = $this->owner();
        $this->actingAs($other)->post("/business/campaigns/{$ad->id}/pay", ['pay' => 'qpay'])->assertNotFound();
        $this->get("/business/campaigns/{$ad->id}/report.csv")->assertNotFound();
        $this->delete("/business/campaigns/{$ad->id}")->assertNotFound();

        $this->actingAs($user)->delete("/business/campaigns/{$ad->id}")->assertRedirect();
        $this->assertSame(0, Ad::count());
        $this->actingAs(User::factory()->create(['birthdate' => '1990-01-01']))->post('/business/campaigns', [])->assertForbidden(); // no company
    }

    public function test_a_video_banner_is_kept_for_conversion_and_too_long_videos_are_refused(): void
    {
        Queue::fake();
        $this->app->instance(Ffmpeg::class, new class extends Ffmpeg
        {
            public float $seconds = 30;

            public function available(): bool
            {
                return true;
            }

            public function probe(string $file): array
            {
                return ['duration' => $this->seconds, 'width' => 1280, 'height' => 720, 'vcodec' => 'h264', 'acodec' => 'aac', 'pix_fmt' => 'yuv420p', 'transfer' => null, 'kbps' => 2000, 'format' => 'mp4'];
            }
        });
        $user = $this->owner();
        $video = fn () => UploadedFile::fake()->createWithContent('ad.mp4', "\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom".str_repeat("\x00", 2000))->mimeType('video/mp4');

        $this->submit($user, 'qpay', 3, $video())->assertRedirect()->assertSessionHasNoErrors();
        $ad = Ad::sole();
        $this->assertNull($ad->image_path);
        Storage::disk('public')->assertExists($ad->video_path);
        Queue::assertPushed(ProcessAdVideo::class, fn ($job) => $job->adId === $ad->id);

        app(Ffmpeg::class)->seconds = 75;
        $this->submit($user, 'qpay', 3, $video())->assertSessionHasErrors('media');
    }

    public function test_the_business_pages_open(): void
    {
        $user = $this->owner();
        $this->actingAs($user)->get('/business')->assertInertia(fn ($p) => $p->component('business/index')->where('company.name', 'Нүүдэл Кофе')->where('auth.company.name', 'Нүүдэл Кофе'));
        $this->get('/business/campaigns/new')->assertInertia(fn ($p) => $p->component('business/new')->where('dailyPrice', 20000)->where('maxDays', 90));
        $this->get('/business/company')->assertInertia(fn ($p) => $p->component('business/company')->where('company.register_number', '6123402'));
    }

    public function test_the_banner_column_sends_video_banners_and_the_advertise_link(): void
    {
        Ad::create([
            'advertiser' => 'Талын Салхи', 'title' => 'Говьд аялал', 'video_path' => 'ads/videos/a.web.mp4', 'poster_path' => 'ads/videos/a.web.poster.jpg',
            'url' => 'https://example.com', 'starts_on' => now()->toDateString(), 'active' => true, 'weight' => 1, 'allow_adult' => false,
        ]);
        $this->getJson('/ads/slot')
            ->assertJsonPath('ads.0.video', Storage::disk('public')->url('ads/videos/a.web.mp4'))
            ->assertJsonPath('ads.0.image', Storage::disk('public')->url('ads/videos/a.web.poster.jpg'))
            ->assertJsonPath('advertise', route('business'));
    }
}
