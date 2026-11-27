<?php

namespace Tests\Feature;

use App\Billing\Receipts;
use App\Jobs\IssueEbarimt;
use App\Models\Ad;
use App\Models\Company;
use App\Models\Payment;
use App\Models\Receipt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Every paid campaign gets a numbered receipt with VAT inside the price; with e-barimt on, it's registered there too. */
class BillingReceiptsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config([
            'ads.daily_price' => 20000, 'billing.vat_percent' => 10, 'billing.number_prefix' => 'OIM',
            'billing.ebarimt.driver' => 'none', 'billing.ebarimt.url' => 'http://posapi.test',
            'billing.ebarimt.merchant_tin' => '37900846788', 'billing.ebarimt.pos_no' => '10012345', 'billing.ebarimt.district_code' => '3505',
            'billing.ebarimt.tin_lookup_url' => 'https://tin.test/check?regNo={reg}',
        ]);
    }

    private function owner(string $register = '6123402'): User
    {
        $user = User::factory()->create(['birthdate' => '1990-01-01']);
        Company::create(['user_id' => $user->id, 'name' => 'Нүүдэл Кофе', 'register_number' => $register, 'email' => 'hi@example.com']);

        return $user;
    }

    /** A 7-day campaign paid with (fake) QPay: ₮140,000. */
    private function paidCampaign(User $user): Payment
    {
        $this->actingAs($user)->post('/business/campaigns', [
            'title' => 'Шинэ латте', 'url' => 'https://example.com', 'starts_on' => now()->toDateString(), 'ends_on' => now()->addDays(6)->toDateString(),
            'media' => UploadedFile::fake()->image('b.jpg', 1200, 1000), 'pay' => 'qpay',
        ]);
        $payment = Payment::where('purpose', Payment::AD)->latest('created_at')->latest('id')->first();
        $this->post("/payments/{$payment->id}/fake-pay");

        return $payment->fresh();
    }

    public function test_a_paid_campaign_gets_one_numbered_receipt_with_the_vat_inside_the_price(): void
    {
        $user = $this->owner();
        $payment = $this->paidCampaign($user);
        $this->post("/payments/{$payment->id}/callback"); // settling again makes no second receipt

        $receipt = Receipt::sole();
        $year = now()->format('Y');
        $this->assertSame("OIM-{$year}-000001", $receipt->number);
        $this->assertSame([140000, 12727, 127273, 7, 'Нүүдэл Кофе', '6123402', Receipt::EB_NONE],
            [$receipt->total, $receipt->vat, $receipt->net(), $receipt->quantity, $receipt->buyer_name, $receipt->buyer_register, $receipt->ebarimt_status]);
        $this->assertSame(0, Receipts::vatIn(5000, 0));

        $this->paidCampaign($user);
        $this->assertSame("OIM-{$year}-000002", Receipt::latest('id')->value('number'));
    }

    public function test_the_receipt_pdf_is_for_its_company_and_admins_only(): void
    {
        $user = $this->owner();
        $this->paidCampaign($user);
        $receipt = Receipt::sole();

        $this->get('/business')->assertInertia(fn ($p) => $p->where('campaigns.0.receipt.number', $receipt->number));
        $pdf = $this->get("/business/receipts/{$receipt->id}.pdf")->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $pdf->getContent());

        $this->actingAs($this->owner('6123499'))->get("/business/receipts/{$receipt->id}.pdf")->assertNotFound();
        $this->actingAs(User::factory()->create(['is_admin' => true]))->get("/admin/receipts/{$receipt->id}.pdf")->assertOk();
    }

    public function test_with_e_barimt_on_the_receipt_is_registered_as_b2b_to_the_companys_tin_and_returned_on_refund(): void
    {
        config(['billing.ebarimt.driver' => 'posapi']);
        Http::fake([
            'tin.test/*' => Http::response(['status' => 200, 'data' => '23456789012']),
            'posapi.test/rest/receipt' => fn (Request $r) => $r->method() === 'DELETE'
                ? Http::response(null, 200)
                : Http::response(['id' => '037900846788001095320240613000030', 'status' => 'SUCCESS', 'qrData' => 'QRDATA123', 'lottery' => 'AB 12345678', 'date' => '2026-11-28 10:00:00']),
        ]);
        $user = $this->owner();
        $this->topUp($user, 200000);
        $this->actingAs($user)->post('/business/campaigns', [
            'title' => 'Шинэ латте', 'url' => 'https://example.com', 'starts_on' => now()->toDateString(), 'ends_on' => now()->addDays(4)->toDateString(),
            'media' => UploadedFile::fake()->image('b.jpg', 1200, 1000), 'pay' => 'wallet',
        ]);

        $receipt = Receipt::sole();
        $this->assertSame([Receipt::EB_ISSUED, '037900846788001095320240613000030', 'QRDATA123', 'AB 12345678'],
            [$receipt->ebarimt_status, $receipt->ebarimt_id, $receipt->ebarimt_qr, $receipt->ebarimt_lottery]);
        Http::assertSent(function (Request $r) {
            if ($r->method() !== 'POST' || ! str_ends_with($r->url(), '/rest/receipt')) {
                return false;
            }
            $d = $r->data();

            return $d['type'] === 'B2B_RECEIPT' && $d['customerTin'] === '23456789012' && $d['merchantTin'] === '37900846788'
                && $d['totalAmount'] == 100000 && $d['totalVAT'] == 9091 && $d['receipts'][0]['items'][0]['qty'] === 5
                && $d['receipts'][0]['taxType'] === 'VAT_ABLE' && $d['payments'][0]['paidAmount'] == 100000;
        });
        $this->assertStringStartsWith('%PDF', $this->get("/business/receipts/{$receipt->id}.pdf")->getContent()); // with its QR

        // Rejected → refunded → the receipt is returned at e-barimt.
        $ad = Ad::sole();
        $this->actingAs(User::factory()->create(['is_admin' => true]))->post("/admin/ads/{$ad->id}/reject", ['reason' => 'Not allowed']);
        $this->assertSame(Receipt::EB_RETURNED, $receipt->fresh()->ebarimt_status);
        Http::assertSent(fn (Request $r) => $r->method() === 'DELETE' && $r->data()['id'] === '037900846788001095320240613000030');
    }

    public function test_a_receipt_e_barimt_refused_is_marked_failed_with_the_reason(): void
    {
        $user = $this->owner();
        $this->paidCampaign($user); // made while e-barimt was off
        $receipt = Receipt::sole();
        $receipt->update(['ebarimt_status' => Receipt::EB_PENDING]);
        config(['billing.ebarimt.driver' => 'posapi']);
        Http::fake([
            'tin.test/*' => Http::response(['data' => '23456789012']),
            'posapi.test/*' => Http::response(['status' => 'ERROR', 'message' => 'District code is invalid'], 200),
        ]);

        try {
            (new IssueEbarimt($receipt->id))->handle();
            $this->fail('Expected the job to fail so it is tried again.');
        } catch (\RuntimeException) {
        }
        $this->assertSame(Receipt::EB_FAILED, $receipt->fresh()->ebarimt_status);
        $this->assertStringContainsString('District code is invalid', $receipt->fresh()->ebarimt_error);
        $this->artisan('billing:ebarimt')->expectsOutputToContain($receipt->number)->assertSuccessful();
    }

    public function test_backfill_gives_earlier_paid_campaigns_their_receipts(): void
    {
        $user = $this->owner();
        $this->paidCampaign($user);
        Receipt::query()->delete();

        $this->artisan('billing:ebarimt --backfill')->expectsOutputToContain('Made 1 receipt(s).')->assertSuccessful();
        $this->assertSame(1, Receipt::count());
    }

    private function topUp(User $user, int $amount): void
    {
        $this->actingAs($user)->post('/wallet/topup', ['amount' => $amount]);
        $this->post('/payments/'.Payment::where('purpose', Payment::TOPUP)->latest('id')->value('id').'/fake-pay');
    }
}
