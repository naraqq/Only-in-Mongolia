<?php

namespace Tests\Feature;

use App\Models\AdminAction;
use App\Models\User;
use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SecurityTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true, 'birthdate' => '1990-01-01']);
    }

    public function test_admin_changes_are_logged_but_page_views_are_not(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create(['birthdate' => '1990-01-01']);

        $this->actingAs($admin)->get('/admin/users')->assertOk();
        $this->assertSame(0, AdminAction::count());

        $this->post("/admin/users/{$target->id}/ban", ['reason' => 'Spam'])->assertRedirect();
        $this->post("/admin/users/{$target->id}/ban", [])->assertSessionHasErrors(); // refused: still logged, as failed

        $log = AdminAction::orderBy('id')->get();
        $this->assertSame(['users.ban', 'users.ban'], $log->pluck('action')->all());
        $this->assertSame([true, false], $log->pluck('ok')->all());
        $this->assertSame(['User', (string) $target->id, $admin->id], [$log[0]->subject_type, $log[0]->subject_id, $log[0]->admin_id]);
        $this->assertSame('Spam', $log[0]->data['reason']);

        $this->get('/admin/audit')->assertInertia(fn ($p) => $p->component('admin/audit')->has('actions.data', 2));
    }

    public function test_two_factor_rate_limit_isolated_by_account_and_shows_an_inline_error(): void
    {
        $attributes = ['two_factor_secret' => Totp::secret(), 'two_factor_confirmed_at' => now()];
        $user = User::factory()->create($attributes);
        $other = User::factory()->create($attributes);
        $this->actingAs($user)->withSession(['two_factor_passed' => $user->id, 'locale' => 'en']);

        for ($i = 0; $i < 6; $i++) {
            $this->delete('/settings/two-factor', ['code' => 'invalid'])->assertSessionHasErrors('code');
        }

        $this->withSession(['two_factor_passed' => null]);

        for ($i = 0; $i < 6; $i++) {
            $this->post('/two-factor', ['code' => 'invalid'])->assertSessionHasErrors('code');
        }

        $this->post('/two-factor', ['code' => 'invalid'])->assertTooManyRequests()->assertHeader('Retry-After');
        $this->withHeader('X-Inertia', 'true')->post('/two-factor', ['code' => 'invalid'])
            ->assertRedirect('/two-factor')->assertSessionHasErrors(['code' => 'Too many verification attempts. Wait up to one minute and try again.']);

        $this->actingAs($other)->post('/two-factor', ['code' => Totp::code($other->two_factor_secret)])
            ->assertRedirect('/');
    }

    public function test_two_factor_setup_sign_in_check_and_recovery_codes(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class); // many attempts on purpose
        $user = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->actingAs($user)->post('/settings/two-factor')->assertRedirect();
        $secret = $user->fresh()->two_factor_secret;
        $this->assertNotNull($secret);
        $this->assertFalse($user->fresh()->hasTwoFactor()); // not until a code confirms it
        $this->assertStringNotContainsString($secret, (string) \DB::table('users')->where('id', $user->id)->value('two_factor_secret')); // stored encrypted

        $this->post('/settings/two-factor/confirm', ['code' => '000000'])->assertSessionHasErrors('code');
        $this->post('/settings/two-factor/confirm', ['code' => Totp::code($secret)])->assertSessionHas('recovery_codes');
        $user->refresh();
        $this->assertTrue($user->hasTwoFactor());
        $codes = $user->two_factor_recovery_codes;
        $this->assertCount(8, $codes);

        // A new session (fresh sign-in) has to pass the check before using the app.
        $this->flushSession();
        $this->actingAs($user)->get('/feed')->assertRedirect('/two-factor');
        $this->post('/wallet/topup', ['amount' => 5000])->assertForbidden(); // nothing changes until the code is in
        $this->post('/two-factor', ['code' => '111111'])->assertSessionHasErrors('code');
        $this->post('/two-factor', ['code' => $codes[0]])->assertRedirect('/feed'); // back where they were going
        $this->get('/feed')->assertOk();

        // Each recovery code works once.
        $this->flushSession();
        $this->actingAs($user)->post('/two-factor', ['code' => $codes[0]])->assertSessionHasErrors('code');
        $this->post('/two-factor', ['code' => Totp::code($secret)])->assertRedirect();
        $this->assertCount(7, $user->fresh()->two_factor_recovery_codes);

        // Turning it off needs a code.
        $this->delete('/settings/two-factor', ['code' => 'nope'])->assertSessionHasErrors('code');
        $this->delete('/settings/two-factor', ['code' => Totp::code($secret)]);
        $this->assertFalse($user->fresh()->hasTwoFactor());
    }

    public function test_admins_need_two_factor_when_required(): void
    {
        config(['security.admin_requires_two_factor' => true]);
        $admin = $this->admin();
        $this->actingAs($admin)->get('/admin')->assertRedirect('/settings/two-factor');

        $secret = Totp::secret();
        $admin->forceFill(['two_factor_secret' => $secret, 'two_factor_confirmed_at' => now(), 'two_factor_recovery_codes' => []])->save();
        $this->post('/two-factor', ['code' => Totp::code($secret)]);
        $this->get('/admin')->assertOk();
    }
}
