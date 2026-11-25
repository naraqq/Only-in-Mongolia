<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\Payment;
use App\Models\Post;
use App\Models\Purchase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PayPerViewTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function creator(string $handle): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => ucfirst($handle), 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '50000000'.$this->n, 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'dm_policy' => 'everyone',
        ]);
    }

    private function fan(): User
    {
        return User::factory()->create(['birthdate' => '1990-01-01']);
    }

    public function test_creators_publish_a_paid_post_that_even_subscribers_unlock_once(): void
    {
        Storage::fake();
        $creator = $this->creator('artist');
        $this->actingAs($creator->user)->post('/studio/posts', [
            'body' => 'Full set', 'visibility' => 'subscribers', 'price' => 15000, 'media' => [UploadedFile::fake()->image('a.jpg')],
        ])->assertSessionHasNoErrors();
        $post = Post::sole();
        $this->assertSame(15000, $post->price);
        $media = $post->media()->sole();

        $fan = $this->fan();
        $creator->subscriptions()->create(['user_id' => $fan->id, 'expires_at' => now()->addDay()]); // subscribed, still has to buy
        $this->actingAs($fan)->get('/@artist')->assertInertia(fn ($p) => $p
            ->where('posts.0.locked', 'buy')->where('posts.0.price', 15000)->where('posts.0.body', null)->where('posts.0.counts.image', 1));
        $this->get("/media/{$media->id}")->assertForbidden();

        $this->post("/posts/{$post->id}/buy")->assertRedirect();
        $payment = Payment::sole();
        $this->assertSame(['ppv', 15000, $post->id], [$payment->purpose, $payment->amount, $payment->post_id]);
        $this->get("/payments/{$payment->id}")->assertInertia(fn ($p) => $p->where('payment.purpose', 'ppv')->where('returnUrl', route('creator.show', 'artist')));
        $this->post("/payments/{$payment->id}/fake-pay")->assertRedirect('/@artist')->assertSessionHas('status', 'unlocked');
        $this->post("/payments/{$payment->id}/callback");

        $this->assertSame(1, Purchase::count());
        $this->get('/@artist')->assertInertia(fn ($p) => $p->where('posts.0.locked', null)->where('posts.0.body', 'Full set'));
        $this->get("/media/{$media->id}")->assertOk();

        // Buying again just goes back to the page; the creator never pays for their own post.
        $this->post("/posts/{$post->id}/buy")->assertRedirect('/@artist');
        $this->actingAs($creator->user)->post("/posts/{$post->id}/buy")->assertRedirect('/@artist');
        $this->assertSame(1, Payment::count());
        $this->actingAs($creator->user)->get('/studio')->assertInertia(fn ($p) => $p->where('stats.earnedThisMonth', 12000));
    }

    public function test_price_limits_and_free_posts_cannot_be_bought(): void
    {
        $creator = $this->creator('artist');
        $this->actingAs($creator->user)->post('/studio/posts', ['body' => 'x', 'visibility' => 'public', 'price' => 100])->assertSessionHasErrors('price');
        $free = $creator->posts()->create(['body' => 'free', 'visibility' => Post::PUBLIC]);
        $this->actingAs($this->fan())->post("/posts/{$free->id}/buy")->assertNotFound();
    }

    public function test_paid_messages_lock_media_until_bought_and_only_creators_can_sell(): void
    {
        Storage::fake();
        $creator = $this->creator('artist');
        $fan = $this->fan();
        $conversation = Conversation::between($creator->user, $fan);
        $fan->following()->attach($creator->id);

        $this->actingAs($creator->user)->post("/messages/{$conversation->id}", [
            'body' => 'Special set for you', 'price' => 8000, 'media' => [UploadedFile::fake()->image('a.jpg'), UploadedFile::fake()->image('b.jpg')],
        ])->assertSessionHasNoErrors();
        $message = Message::sole();
        $media = $message->media()->first();

        // The creator sees their own media; the fan sees the text and a locked tile.
        $this->get("/messages/{$conversation->id}")->assertInertia(fn ($p) => $p->where('thread.messages.0.locked', false)->has('thread.messages.0.media', 2));
        $this->actingAs($fan)->get("/messages/{$conversation->id}")->assertInertia(fn ($p) => $p
            ->where('thread.messages.0.locked', true)->where('thread.messages.0.body', 'Special set for you')
            ->where('thread.messages.0.counts.image', 2)->has('thread.messages.0.media', 0));
        $this->get("/message-media/{$media->id}")->assertForbidden();

        $this->post("/message/{$message->id}/buy")->assertRedirect();
        $payment = Payment::sole();
        $this->assertSame([$message->id, $creator->id, 8000], [$payment->message_id, $payment->creator_profile_id, $payment->amount]);
        $this->post("/payments/{$payment->id}/fake-pay")->assertRedirect("/messages/{$conversation->id}");
        $this->get("/message-media/{$media->id}")->assertOk();

        // Fans can't sell messages, and nobody outside the chat can buy one.
        $this->post("/messages/{$conversation->id}", ['price' => 5000, 'media' => [UploadedFile::fake()->image('c.jpg')]])->assertSessionHasErrors('price');
        $this->actingAs($this->fan())->post("/message/{$message->id}/buy")->assertNotFound();
    }

    public function test_a_price_on_a_text_only_message_is_ignored(): void
    {
        $creator = $this->creator('artist');
        $fan = $this->fan();
        $fan->following()->attach($creator->id);
        $conversation = Conversation::between($creator->user, $fan);

        $this->actingAs($creator->user)->post("/messages/{$conversation->id}", ['body' => 'hi', 'price' => 5000])->assertSessionHasNoErrors();
        $this->assertNull(Message::sole()->price);
    }

    public function test_mass_messages_can_be_paid(): void
    {
        Storage::fake();
        $creator = $this->creator('artist');
        [$a, $b] = [$this->fan(), $this->fan()];
        foreach ([$a, $b] as $f) {
            $creator->subscriptions()->create(['user_id' => $f->id, 'expires_at' => now()->addDay()]);
        }

        $this->actingAs($creator->user)->post('/studio/mass-message', [
            'audience' => 'subscribers', 'body' => 'New video', 'price' => 20000, 'media' => [UploadedFile::fake()->image('v.jpg')],
        ])->assertSessionHas('status', 'mass-sent:2');

        $this->assertSame([20000, 20000], Message::pluck('price')->all());
        $this->actingAs($a)->get('/messages/'.Conversation::findBetween($creator->user, $a)->id)->assertInertia(fn ($p) => $p->where('thread.messages.0.locked', true));
    }
}
