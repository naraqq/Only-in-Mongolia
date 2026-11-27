<?php

namespace Tests\Feature;

use App\Models\Ad;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SponsoredAdsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function ad(array $over = []): Ad
    {
        return Ad::create([
            'advertiser' => 'Khan Bank', 'title' => 'Open an account', 'image_path' => 'ads/x.jpg', 'url' => 'https://example.mn/promo?utm_source=theirs',
            'starts_on' => now()->subDay()->toDateString(), 'ends_on' => null, 'active' => true, 'weight' => 1, 'allow_adult' => false, ...$over,
        ]);
    }

    public function test_only_running_banners_are_served_and_18_plus_pages_get_only_those_that_opted_in(): void
    {
        $running = $this->ad();
        $this->ad(['active' => false]);
        $this->ad(['starts_on' => now()->addDay()->toDateString()]);
        $this->ad(['ends_on' => now()->subDays(1)->toDateString(), 'starts_on' => now()->subDays(5)->toDateString()]);
        $adultOk = $this->ad(['advertiser' => 'Bar', 'allow_adult' => true]);

        $ids = collect($this->getJson('/ads/slot')->assertOk()->json('ads'))->pluck('id')->sort()->values()->all();
        $this->assertSame([$running->id, $adultOk->id], $ids);
        $this->assertSame([$adultOk->id], collect($this->getJson('/ads/slot?adult=1')->json('ads'))->pluck('id')->all());
    }

    public function test_views_count_once_per_visitor_per_day_and_clicks_go_on_with_our_tags(): void
    {
        $ad = $this->ad();
        $this->postJson('/ads/views', ['ids' => [$ad->id, 999]])->assertOk();
        $this->postJson('/ads/views', ['ids' => [$ad->id]]); // same visitor again: not counted
        $this->assertSame(1, (int) DB::table('ad_stats')->where('ad_id', $ad->id)->value('impressions'));

        $to = $this->get("/ads/{$ad->id}/go")->assertRedirect()->headers->get('Location');
        $this->assertStringContainsString('utm_source=theirs', $to); // the advertiser's own tag wins
        $this->assertStringContainsString('utm_medium=banner', $to);
        $this->assertStringContainsString("utm_campaign=ad-{$ad->id}", $to);
        $this->assertSame(1, (int) DB::table('ad_stats')->where('ad_id', $ad->id)->value('clicks'));
    }

    public function test_admins_create_pause_and_report_on_banners_and_others_cannot(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs(User::factory()->create())->get('/admin/ads')->assertForbidden();

        $this->actingAs($admin)->post('/admin/ads', [
            'advertiser' => 'Unitel', 'title' => '5G now', 'url' => 'https://unitel.mn', 'starts_on' => now()->toDateString(),
            'weight' => 2, 'allow_adult' => false, 'active' => true, 'image' => UploadedFile::fake()->image('banner.png', 1200, 1000),
        ])->assertSessionHasNoErrors();
        $ad = Ad::sole();
        Storage::disk('public')->assertExists($ad->image_path);
        [$w, $h] = getimagesizefromstring(Storage::disk('public')->get($ad->image_path));
        $this->assertSame([1200, 1000], [$w, $h]);

        $this->post("/admin/ads/{$ad->id}/toggle");
        $this->assertFalse($ad->fresh()->active);
        $this->get('/admin/ads')->assertInertia(fn ($p) => $p->component('admin/ads')->where('ads.0.status', 'paused'));

        Ad::tally([$ad->id], 'impressions');
        $csv = $this->get("/admin/ads/{$ad->id}/report.csv")->assertOk()->streamedContent();
        $this->assertStringContainsString('Unitel', $csv);
        $this->assertStringContainsString('Total,1,0,0', $csv);
    }
}
