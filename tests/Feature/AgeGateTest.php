<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureAgeConfirmed;
use App\Models\PhoneVerification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AgeGateTest extends TestCase
{
    use RefreshDatabase;

    protected bool $ageConfirmed = false; // a brand-new visitor

    public function test_visitors_must_confirm_they_are_adults_first(): void
    {
        $this->get('/')->assertRedirect('/age-gate');
        $this->get('/login')->assertRedirect('/age-gate');
        $this->get('/age-gate')->assertOk()->assertInertia(fn ($p) => $p->component('age-gate'));
    }

    public function test_confirming_remembers_the_answer_and_returns_to_the_page(): void
    {
        $this->get('/login'); // remembered as the intended page
        $this->post('/age-gate', ['adult' => true])
            ->assertRedirect('/login')
            ->assertCookie(EnsureAgeConfirmed::COOKIE, '1');

        $this->withCookie(EnsureAgeConfirmed::COOKIE, '1')->get('/login')->assertOk();
    }

    public function test_confirmation_must_be_explicit(): void
    {
        $this->post('/age-gate', [])->assertSessionHasErrors('adult');
    }

    public function test_signed_in_users_pass_and_the_phone_callback_is_never_blocked(): void
    {
        $this->actingAs(User::factory()->create(['birthdate' => '1990-01-01']))->get('/dashboard')->assertOk();

        $v = PhoneVerification::create(['phone' => '99112233', 'code' => '123456', 'status' => 'VERIFIED', 'expires_at' => now()->addMinutes(5)]);
        $this->get("/verify-mn/callback/{$v->id}")->assertOk();
    }
}
