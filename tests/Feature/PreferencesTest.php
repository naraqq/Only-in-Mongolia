<?php

namespace Tests\Feature;

use App\Models\SearchHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PreferencesTest extends TestCase
{
    use RefreshDatabase;

    public function test_recent_searches_live_on_the_account(): void
    {
        $user = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->actingAs($user);

        foreach (['gobi', 'cooking', 'gobi'] as $q) {
            $this->travel(1)->seconds(); // searches a moment apart, as in real use
            $this->get('/search?q='.$q)->assertOk();
        }
        $this->get('/search?q=travel&tab=posts&page=2'); // later pages don't count as new searches

        $this->get('/search')->assertInertia(fn ($p) => $p->where('recent', ['gobi', 'cooking'])); // newest first, no duplicates

        $this->delete('/search/recent/one', ['q' => 'gobi'])->assertRedirect();
        $this->get('/search')->assertInertia(fn ($p) => $p->where('recent', ['cooking']));
        $this->delete('/search/recent')->assertRedirect();
        $this->get('/search')->assertInertia(fn ($p) => $p->where('recent', []));

        // Only the newest are kept.
        foreach (range(1, SearchHistory::KEEP + 5) as $i) {
            SearchHistory::record($user, "q{$i}");
        }
        $this->assertSame(SearchHistory::KEEP, $user->searchHistories()->count());

        // Someone else sees none of it; visitors have no history.
        $this->actingAs(User::factory()->create(['birthdate' => '1990-01-01']))->get('/search')->assertInertia(fn ($p) => $p->where('recent', []));
        auth()->logout();
        $this->get('/search?q=gobi')->assertOk();
        $this->assertSame(SearchHistory::KEEP, SearchHistory::count());
    }

    public function test_theme_is_saved_on_the_account_and_rendered_by_the_server(): void
    {
        $user = User::factory()->create(['birthdate' => '1990-01-01']);

        $this->actingAs($user)->post('/appearance/dark')->assertRedirect()->assertCookie('appearance', 'dark');
        $this->assertSame('dark', $user->fresh()->appearance);
        $this->get('/settings')->assertInertia(fn ($p) => $p->where('appearance', 'dark'))
            ->assertSee('data-appearance="dark"', false)->assertSee('class="dark"', false);

        $this->post('/appearance/system');
        $this->assertNull($user->fresh()->appearance);
        $this->post('/appearance/purple')->assertNotFound();

        // Visitors: remembered in the cookie.
        auth()->logout();
        $this->withCookie('appearance', 'light')->get('/login')->assertSee('data-appearance="light"', false);
    }
}
