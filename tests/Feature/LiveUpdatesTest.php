<?php

namespace Tests\Feature;

use App\Events\LivePing;
use App\Models\Conversation;
use App\Models\User;
use App\Notifications\Activity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class LiveUpdatesTest extends TestCase
{
    use RefreshDatabase;

    /** A real (Pusher-protocol) broadcaster, so channel authorisation actually runs. */
    private function useReverb(): void
    {
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => '1',
        ]);
        // Channel rules were registered on the default (null) broadcaster at boot; register them on this one too.
        require base_path('routes/channels.php');
    }

    private function auth(string $channel)
    {
        return $this->post('/broadcasting/auth', ['socket_id' => '1234.5678', 'channel_name' => $channel]);
    }

    public function test_private_channels_only_open_for_the_people_they_are_about(): void
    {
        $this->useReverb();
        [$a, $b, $stranger] = User::factory()->count(3)->create();
        $chat = Conversation::between($a, $b);

        $this->actingAs($a);
        $this->auth("private-user.{$a->id}")->assertOk();
        $this->auth("private-user.{$b->id}")->assertForbidden();
        $this->auth("private-conversation.{$chat->id}")->assertOk();

        $this->actingAs($stranger);
        $this->auth("private-conversation.{$chat->id}")->assertForbidden();
    }

    public function test_sending_a_message_pings_the_chat_and_both_inboxes_without_its_text(): void
    {
        $this->useReverb();
        Event::fake([LivePing::class]);
        [$a, $b] = User::factory()->count(2)->create();
        $chat = Conversation::between($a, $b);
        $chat->messages()->create(['sender_id' => $b->id, 'body' => 'hi']); // so $a may answer

        $this->actingAs($a)->post("/messages/{$chat->id}", ['body' => 'Secret words'])->assertRedirect();

        Event::assertDispatched(LivePing::class, fn (LivePing $e) => $e->name === 'message'
            && $e->channels[0]->name === "private-conversation.{$chat->id}"
            && ! str_contains(json_encode($e->broadcastWith()), 'Secret'));
        Event::assertDispatched(LivePing::class, fn (LivePing $e) => $e->name === 'inbox'
            && collect($e->channels)->pluck('name')->sort()->values()->all() === collect(["private-user.{$a->id}", "private-user.{$b->id}"])->sort()->values()->all());
    }

    public function test_notifications_ping_the_bell(): void
    {
        $this->useReverb();
        Event::fake([LivePing::class]);
        [$fan, $other] = User::factory()->count(2)->create();

        $fan->notify(new Activity('followed', $other->id));

        Event::assertDispatched(LivePing::class, fn (LivePing $e) => $e->name === 'notification' && $e->channels[0]->name === "private-user.{$fan->id}");
    }
}
