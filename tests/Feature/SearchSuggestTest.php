<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\SearchHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SearchSuggestTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function creator(string $handle, string $name, string $status = CreatorProfile::APPROVED): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => $name, 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => $status, 'reviewed_at' => now(),
        ]);
    }

    public function test_dropdown_shows_recent_when_empty_and_matches_while_typing(): void
    {
        $saraa = $this->creator('saraa.art', 'Сараа');
        $this->creator('sarnai', 'Сарнай');
        $this->creator('hidden', 'Saraa Hidden', CreatorProfile::SUSPENDED);
        $me = User::factory()->create(['birthdate' => '1990-01-01']);
        SearchHistory::record($me, 'гоё зураг');
        $this->travel(1)->seconds();
        SearchHistory::record($me, 'saraa');

        $this->actingAs($me)->getJson('/search/suggest')->assertJson(['recent' => ['saraa', 'гоё зураг'], 'creators' => []]);

        // Exact handle first; suspended creators never appear; matching recent searches come along.
        $r = $this->getJson('/search/suggest?q=saraa')->assertOk()->json();
        $this->assertSame(['saraa.art'], array_column($r['creators'], 'handle'));
        $this->assertSame(['saraa'], $r['recent']);
        $both = array_column($this->getJson('/search/suggest?q=@sar')->json('creators'), 'handle');
        sort($both);
        $this->assertSame(['saraa.art', 'sarnai'], $both);
        // Mongolian names match whatever the capitalisation.
        $this->assertSame('saraa.art', $this->getJson('/search/suggest?q=сараа')->json('creators.0.handle'));

        // Blocked creators are hidden.
        DB::table('blocks')->insert(['blocker_id' => $me->id, 'blocked_id' => $saraa->user_id, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame([], $this->getJson('/search/suggest?q=saraa')->json('creators'));

        // Removing from the dropdown answers JSON, without a redirect.
        $this->deleteJson('/search/recent/one?q=saraa')->assertNoContent();
        $this->getJson('/search/suggest')->assertJson(['recent' => ['гоё зураг']]);
        $this->deleteJson('/search/recent')->assertNoContent();
        $this->getJson('/search/suggest')->assertJson(['recent' => []]);
    }

    public function test_visitors_get_creators_but_no_history(): void
    {
        $this->creator('saraa.art', 'Сараа');
        $this->getJson('/search/suggest?q=сар')->assertJson(['recent' => []])->assertJsonPath('creators.0.handle', 'saraa.art');
    }
}
