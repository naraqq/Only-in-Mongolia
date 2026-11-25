<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_settings_shows_the_signed_in_number(): void
    {
        $user = User::factory()->create(['phone' => '99112233', 'birthdate' => '1990-01-01']);

        $this->get('/settings')->assertRedirect('/login');
        $this->actingAs($user)->get('/settings')->assertInertia(fn ($p) => $p
            ->component('settings/index')->where('phone', '99112233')->where('isCreator', false)->where('deleteWord', 'DELETE'));
    }

    public function test_deleting_the_account_needs_the_word_and_logs_out(): void
    {
        $user = User::factory()->create(['birthdate' => '1990-01-01']);

        $this->actingAs($user)->delete('/settings/account', ['confirm' => 'delete'])->assertSessionHasErrors('confirm');
        $this->assertNotNull($user->fresh());

        $this->delete('/settings/account', ['confirm' => 'DELETE'])->assertRedirect('/');
        $this->assertNull($user->fresh());
        $this->assertGuest();
    }

    public function test_logout_keeps_the_language_choice(): void
    {
        $user = User::factory()->create(['birthdate' => '1990-01-01']);

        $this->actingAs($user)->withSession(['locale' => 'en'])->post('/logout')->assertRedirect('/');
        $this->assertGuest();
        $this->assertSame('en', session('locale'));
    }

    public function test_the_old_email_and_password_screens_are_gone(): void
    {
        foreach (['/register', '/login/email', '/forgot-password', '/reset-password/x', '/settings/profile', '/settings/password', '/settings/appearance'] as $url) {
            $this->get($url)->assertNotFound();
        }
        $this->actingAs(User::factory()->create(['birthdate' => '1990-01-01']));
        foreach (['/verify-email', '/confirm-password'] as $url) {
            $this->get($url)->assertNotFound();
        }
    }
}
