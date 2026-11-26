<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StudioScreensTest extends TestCase
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

    public function test_creators_get_messages_and_profile_inside_the_studio(): void
    {
        $creator = $this->creator();
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $conversation = Conversation::between($creator->user, $fan);
        $conversation->messages()->create(['sender_id' => $fan->id, 'body' => 'Hi']);
        $conversation->forceFill(['last_message_at' => now()])->save();

        $this->actingAs($creator->user)->get('/studio/messages')->assertInertia(fn ($p) => $p->component('messages/index')->where('area', 'studio')->has('conversations', 1));
        $this->get("/studio/messages/{$conversation->id}")->assertInertia(fn ($p) => $p->where('area', 'studio')->where('thread.id', $conversation->id));
        $this->get('/messages')->assertInertia(fn ($p) => $p->where('area', 'social'));

        $this->get('/studio/profile')->assertInertia(fn ($p) => $p->component('profile/edit')->where('area', 'studio')->where('editing', true)->where('creator.handle', 'artist'));
        $this->get('/profile')->assertInertia(fn ($p) => $p->where('area', 'social')->where('editing', false));
    }

    public function test_fans_cannot_open_the_studio_versions(): void
    {
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $this->actingAs($fan)->get('/studio/messages')->assertNotFound();
        $this->get('/studio/profile')->assertNotFound();
        $this->get('/messages')->assertOk();
    }
}
