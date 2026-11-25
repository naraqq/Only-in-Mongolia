<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MessagingTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function creator(string $handle, string $policy = 'followers'): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => ucfirst($handle), 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '50000000'.$this->n, 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'dm_policy' => $policy,
        ]);
    }

    private function fan(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    public function test_a_follower_messages_a_creator_and_unread_counts_follow_along(): void
    {
        $creator = $this->creator('artist');
        $fan = $this->fan();
        $fan->following()->attach($creator->id);

        $this->actingAs($fan)->get('/@artist')->assertInertia(fn ($p) => $p->where('messageBlock', null));
        $this->post('/@artist/message')->assertRedirect();
        $conversation = Conversation::sole();
        $this->post("/messages/{$conversation->id}", ['body' => 'Сайн уу!'])->assertSessionHasNoErrors();

        $this->actingAs($creator->user)->get('/@artist')->assertInertia(fn ($p) => $p->where('unreadMessages', 1));
        $this->get('/messages')->assertInertia(fn ($p) => $p
            ->component('messages/index')
            ->where('conversations.0.unread', 1)
            ->where('conversations.0.last.body', 'Сайн уу!')
            ->where('conversations.0.other.id', $fan->id));
        $this->get("/messages/{$conversation->id}")->assertInertia(fn ($p) => $p
            ->where('thread.messages.0.body', 'Сайн уу!')
            ->where('thread.cannotSend', null)
            ->where('unreadMessages', 0)); // opening it marks it read
        $this->post("/messages/{$conversation->id}", ['body' => 'Баярлалаа']);

        $this->actingAs($fan)->get('/messages')->assertInertia(fn ($p) => $p->where('conversations.0.unread', 1)->where('conversations.0.other.handle', 'artist'));
    }

    public function test_creator_settings_decide_who_can_start_a_conversation(): void
    {
        $this->creator('subsonly', 'subscribers');
        $this->creator('open', 'everyone');
        $this->creator('fans', 'followers');
        $fan = $this->fan();

        $this->actingAs($fan)->get('/@subsonly')->assertInertia(fn ($p) => $p->where('messageBlock', 'subscribe'));
        $this->post('/@subsonly/message')->assertSessionHasErrors(['message' => 'cannot.subscribe']);
        $this->post('/@fans/message')->assertSessionHasErrors(['message' => 'cannot.follow']);
        $this->post('/@open/message')->assertSessionHasNoErrors();
        $this->assertSame(1, Conversation::count());

        // Subscribing opens it up.
        CreatorProfile::where('handle', 'subsonly')->first()->subscriptions()->create(['user_id' => $fan->id, 'expires_at' => now()->addDay()]);
        $this->post('/@subsonly/message')->assertSessionHasNoErrors();
        $this->assertSame(2, Conversation::count());
    }

    public function test_creators_can_write_to_their_fans_who_can_always_reply(): void
    {
        $creator = $this->creator('artist', 'subscribers');
        $fan = $this->fan();
        $stranger = $this->fan();
        $fan->following()->attach($creator->id);

        // Not a subscriber, so the fan can't start a conversation...
        $this->actingAs($fan)->post('/@artist/message')->assertSessionHasErrors('message');

        // ...but the creator can write to a follower, and then the fan can reply.
        $conversation = Conversation::between($creator->user, $fan);
        $this->actingAs($creator->user)->post("/messages/{$conversation->id}", ['body' => 'Thanks for following!'])->assertSessionHasNoErrors();
        $this->actingAs($fan)->post("/messages/{$conversation->id}", ['body' => 'Hi!'])->assertSessionHasNoErrors();
        $this->assertSame(2, $conversation->messages()->count());

        // Not with a stranger, and two fans can't message each other.
        $c2 = Conversation::between($creator->user, $stranger);
        $this->actingAs($creator->user)->post("/messages/{$c2->id}", ['body' => 'Hi'])->assertSessionHasErrors(['body' => 'cannot.closed']);
        $c3 = Conversation::between($fan, $stranger);
        $this->actingAs($fan)->post("/messages/{$c3->id}", ['body' => 'Hi'])->assertSessionHasErrors(['body' => 'cannot.closed']);
    }

    public function test_conversations_and_their_photos_are_private(): void
    {
        Storage::fake();
        $creator = $this->creator('artist', 'everyone');
        $fan = $this->fan();
        $conversation = Conversation::between($fan, $creator->user);

        $this->actingAs($fan)->post("/messages/{$conversation->id}", ['media' => [UploadedFile::fake()->image('a.jpg')]])->assertSessionHasNoErrors();
        $media = Message::sole()->media()->sole();
        $this->get("/message-media/{$media->id}")->assertOk();
        $this->actingAs($creator->user)->get("/message-media/{$media->id}")->assertOk();

        $outsider = $this->fan();
        $this->actingAs($outsider)->get("/messages/{$conversation->id}")->assertNotFound();
        $this->post("/messages/{$conversation->id}", ['body' => 'x'])->assertNotFound();
        $this->get("/message-media/{$media->id}")->assertNotFound();

        $this->actingAs($fan)->post("/messages/{$conversation->id}", [])->assertSessionHasErrors('body');
    }

    public function test_mass_message_reaches_each_subscriber_in_their_own_conversation(): void
    {
        $creator = $this->creator('artist');
        [$a, $b, $follower] = [$this->fan(), $this->fan(), $this->fan()];
        foreach ([$a, $b] as $f) {
            $creator->subscriptions()->create(['user_id' => $f->id, 'expires_at' => now()->addDay()]);
        }
        $creator->subscriptions()->create(['user_id' => $follower->id, 'expires_at' => now()->subDay()]); // expired
        $follower->following()->attach($creator->id);

        $this->actingAs($creator->user)->post('/studio/mass-message', ['audience' => 'subscribers', 'body' => 'New set is up!'])
            ->assertSessionHas('status', 'mass-sent:2');
        $this->assertSame(2, Message::where('is_mass', true)->count());
        $this->assertNull(Conversation::findBetween($creator->user, $follower));
        $this->actingAs($a)->get('/@artist')->assertInertia(fn ($p) => $p->where('unreadMessages', 1));
        $this->actingAs($creator->user)->get('/@artist')->assertInertia(fn ($p) => $p->where('unreadMessages', 0));

        $this->post('/studio/mass-message', ['audience' => 'followers', 'body' => 'Hello followers'])->assertSessionHas('status', 'mass-sent:1');
        $this->actingAs($a)->post('/studio/mass-message', ['audience' => 'subscribers', 'body' => 'x'])->assertNotFound();
    }
}
