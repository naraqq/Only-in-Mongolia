<?php

namespace Tests\Feature;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FansPageTest extends TestCase
{
    use RefreshDatabase;

    private function creator(): CreatorProfile
    {
        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => 'artist', 'display_name' => 'Artist', 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ95010101', 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '5000000001', 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(),
        ]);
    }

    public function test_the_page_lists_followers_sorted_by_spend(): void
    {
        $creator = $this->creator();
        [$a, $b] = [User::factory()->create(['name' => 'Anu']), User::factory()->create(['name' => 'Bold'])];
        $creator->followers()->attach([$a->id, $b->id]);
        Payment::create(['user_id' => $b->id, 'creator_profile_id' => $creator->id, 'purpose' => Payment::TIP, 'amount' => 5000,
            'platform_fee' => 1000, 'status' => Payment::PAID, 'provider' => 'fake', 'paid_at' => now()]);

        $this->actingAs($creator->user)->get('/studio/fans?sort=spent')->assertInertia(fn ($p) => $p
            ->component('studio/fans')
            ->where('total', 2)
            ->where('fans.0.name', 'Bold')
            ->where('fans.0.spent', 5000)
            ->where('fans.1.following', true));
        $this->get('/studio/fans?q=An')->assertInertia(fn ($p) => $p->where('total', 1)->where('fans.0.name', 'Anu'));
    }

    public function test_remove_a_follower_message_one_and_blocking_unfollows(): void
    {
        $creator = $this->creator();
        [$a, $b] = [User::factory()->create(), User::factory()->create()];
        $creator->followers()->attach([$a->id, $b->id]);
        $this->actingAs($creator->user);

        $this->delete("/studio/fans/{$a->id}/follow")->assertRedirect();
        $this->assertFalse($creator->followers()->whereKey($a->id)->exists());

        $this->post("/studio/fans/{$b->id}/message")->assertRedirectContains('/studio/messages/');

        $this->postJson("/users/{$b->id}/block")->assertJson(['blocked' => true]);
        $this->assertFalse($creator->followers()->whereKey($b->id)->exists());
        $this->assertSame(1, DB::table('blocks')->count());
    }
}
