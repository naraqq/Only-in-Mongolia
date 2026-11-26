<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CsrfTokenTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The phone login finishes with a plain form post. It must use the token from the latest response:
     * logging out starts a new session with a new token, and the <meta> tag from the first page load goes stale (419).
     */
    public function test_every_page_hands_out_the_current_session_token_even_after_logout(): void
    {
        $user = User::factory()->create(['birthdate' => '1990-01-01']);

        $this->actingAs($user)->get('/settings');
        $before = session()->token();
        $this->post('/logout')->assertRedirect();

        $this->get('/login')->assertInertia(fn ($p) => $p->where('csrf', session()->token()));
        $this->assertNotSame($before, session()->token());
    }
}
