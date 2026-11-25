<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Models\Purchase;
use App\Models\Report;
use App\Models\User;
use App\Payments\Earnings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminUsersTest extends TestCase
{
    use RefreshDatabase;

    private function creator(): CreatorProfile
    {
        return User::factory()->create(['name' => 'Artist Person', 'birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    private function paid(User $fan, CreatorProfile $creator, string $purpose, int $amount, array $extra = []): Payment
    {
        return Payment::create(['user_id' => $fan->id, 'creator_profile_id' => $creator->id, 'purpose' => $purpose, 'amount' => $amount,
            'platform_fee' => intdiv($amount * 20, 100), 'status' => Payment::PAID, 'provider' => 'fake', 'invoice_id' => 'x', 'paid_at' => now(), ...$extra]);
    }

    public function test_admins_search_users_and_see_one_in_full(): void
    {
        $creator = $this->creator();
        $fan = User::factory()->create(['name' => 'Bold Fan', 'phone' => '99112233']);
        $this->paid($fan, $creator, Payment::TIP, 5000);
        Report::create(['reporter_id' => $fan->id, 'reportable_type' => CreatorProfile::class, 'reportable_id' => $creator->id, 'reason' => 'spam']);
        $admin = User::factory()->create(['is_admin' => true]);

        $this->actingAs($fan)->get('/admin/users')->assertForbidden();
        $this->actingAs($admin)->get('/admin/users?q=@artist')->assertInertia(fn ($p) => $p
            ->component('admin/users')->has('users.data', 1)->where('users.data.0.creator.handle', 'artist'));
        $this->get('/admin/users?q=9911')->assertInertia(fn ($p) => $p->has('users.data', 1)->where('users.data.0.spent', 5000));
        $this->get('/admin/users?filter=admins')->assertInertia(fn ($p) => $p->has('users.data', 1)->where('users.data.0.id', $admin->id));

        $this->get("/admin/users/{$creator->user_id}")->assertInertia(fn ($p) => $p
            ->component('admin/user')
            ->where('creator.earned', 4000)
            ->has('paymentsReceived', 1)
            ->has('reportsAgainst', 1));
        $this->get("/admin/users/{$fan->id}")->assertInertia(fn ($p) => $p
            ->where('spent', 5000)->where('creator', null)->has('paymentsMade', 1)->has('reportsFiled', 1));
    }

    public function test_banned_people_are_signed_out_cannot_sign_in_and_their_page_is_suspended(): void
    {
        $creator = $this->creator();
        $admin = User::factory()->create(['is_admin' => true]);
        $other = User::factory()->create(['is_admin' => true]);

        $this->actingAs($admin)->post("/admin/users/{$other->id}/ban", ['reason' => 'x'])->assertStatus(422); // admins can't be banned
        $this->post("/admin/users/{$creator->user_id}/ban", ['reason' => ''])->assertSessionHasErrors('reason');
        $this->post("/admin/users/{$creator->user_id}/ban", ['reason' => 'Fake ID'])->assertSessionHasNoErrors();
        $this->assertNotNull($creator->user->fresh()->banned_at);
        $this->assertSame(CreatorProfile::SUSPENDED, $creator->fresh()->status);

        // Their next request signs them out.
        $this->actingAs($creator->user->fresh())->get('/')->assertRedirect(route('login'));
        $this->assertGuest();

        // Lifting the ban lets them back in; the page stays suspended until reinstated.
        $this->actingAs($admin)->post("/admin/users/{$creator->user_id}/unban");
        $this->assertNull($creator->user->fresh()->banned_at);
        $this->assertSame(CreatorProfile::SUSPENDED, $creator->fresh()->status);
    }

    public function test_admin_rights_can_be_given_and_taken_but_not_by_yourself(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $user = User::factory()->create();

        $this->actingAs($admin)->post("/admin/users/{$user->id}/admin");
        $this->assertTrue($user->fresh()->is_admin);
        $this->post("/admin/users/{$user->id}/admin");
        $this->assertFalse($user->fresh()->is_admin);
        $this->post("/admin/users/{$admin->id}/admin")->assertStatus(422);
        $this->assertTrue($admin->fresh()->is_admin);
    }

    public function test_refunds_take_back_what_was_bought_and_leave_earnings(): void
    {
        $creator = $this->creator();
        $fan = User::factory()->create();
        $admin = User::factory()->create(['is_admin' => true]);

        // Two months bought: refunding one takes 30 days off.
        $sub = $creator->subscriptions()->create(['user_id' => $fan->id, 'expires_at' => now()->addDays(50)]);
        $subPay = $this->paid($fan, $creator, Payment::SUBSCRIPTION, 10000);
        $post = $creator->posts()->create(['body' => 'Paid', 'visibility' => Post::SUBSCRIBERS, 'price' => 8000]);
        $ppvPay = $this->paid($fan, $creator, Payment::PPV, 8000, ['post_id' => $post->id]);
        Purchase::create(['user_id' => $fan->id, 'post_id' => $post->id, 'payment_id' => $ppvPay->id]);
        $this->assertSame(14400, (new Earnings($creator))->earned());

        $this->actingAs($admin)->post("/admin/payments/{$subPay->id}/refund", ['reason' => 'Charged twice'])->assertSessionHasNoErrors();
        $this->post("/admin/payments/{$ppvPay->id}/refund", ['reason' => 'Broken video']);
        $this->post("/admin/payments/{$ppvPay->id}/refund", ['reason' => 'Again'])->assertStatus(409);

        $this->assertSame(Payment::REFUNDED, $subPay->fresh()->status);
        $this->assertEqualsWithDelta(20, now()->diffInDays($sub->fresh()->expires_at), 0.1);
        $this->assertFalse(Purchase::hasPost($fan, $post));
        $this->assertSame(0, (new Earnings($creator))->earned());
        $this->assertSame(2, $fan->notifications()->where('type', 'refunded')->count());
        $this->assertSame(2, $creator->user->notifications()->where('type', 'charge_refunded')->count());
        $this->get('/notifications')->assertOk();
    }
}
