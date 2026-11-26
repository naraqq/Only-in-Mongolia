<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\Payment;
use App\Models\Post;
use App\Models\User;
use App\Payments\FakeGateway;
use App\Payments\Payments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TipTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    private function creator(string $handle, string $policy = 'subscribers'): CreatorProfile
    {
        $this->n++;

        return User::factory()->create(['birthdate' => '1995-01-01'])->creatorProfile()->create([
            'handle' => $handle, 'display_name' => ucfirst($handle), 'bio' => null, 'price_monthly' => 10000, 'adult_content' => false,
            'legal_name' => 'X', 'register_number' => 'УБ950101'.str_pad((string) $this->n, 2, '0', STR_PAD_LEFT), 'id_front_path' => 'x', 'id_back_path' => 'x', 'selfie_path' => 'x',
            'bank_name' => 'Хаан банк', 'bank_account' => '50000000'.$this->n, 'account_holder' => 'X', 'consented_at' => now(),
            'status' => CreatorProfile::APPROVED, 'reviewed_at' => now(), 'dm_policy' => $policy,
        ]);
    }

    public function test_a_paid_tip_lands_in_the_chat_and_counts_as_earnings_but_is_not_a_subscription(): void
    {
        $creator = $this->creator('artist'); // subscribers-only messages: a tip still gets through
        $post = $creator->posts()->create(['body' => 'Art', 'visibility' => Post::PUBLIC]);
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);

        $this->actingAs($fan)->post('/@artist/tip', ['amount' => 5000, 'note' => 'Гоё зураг!', 'post_id' => $post->id])->assertRedirect();
        $payment = Payment::sole();
        $this->assertSame(['tip', 5000, 1000, $post->id, 'Гоё зураг!'], [$payment->purpose, $payment->amount, $payment->platform_fee, $payment->post_id, $payment->note]);
        $this->get("/payments/{$payment->id}")->assertInertia(fn ($p) => $p->where('payment.purpose', 'tip')->where('payment.note', 'Гоё зураг!'));
        $this->assertSame(0, Message::count()); // nothing until it's paid

        $this->post("/payments/{$payment->id}/fake-pay")->assertRedirect("/payments/{$payment->id}")->assertSessionHas('status', 'tipped');
        $this->post("/payments/{$payment->id}/callback"); // settling again changes nothing

        $message = Message::sole();
        $this->assertSame([$fan->id, 5000, 'Гоё зураг!'], [$message->sender_id, $message->tip_amount, $message->body]);
        $this->assertFalse($creator->hasActiveSubscriber($fan));

        $conversation = Conversation::findBetween($fan, $creator->user);
        $this->actingAs($creator->user)->get("/messages/{$conversation->id}")->assertInertia(fn ($p) => $p->where('thread.messages.0.tip_amount', 5000));
        $this->get('/studio')->assertInertia(fn ($p) => $p->where('stats.earnedThisMonth', 4000));
    }

    public function test_tip_limits_and_who_can_be_tipped(): void
    {
        $creator = $this->creator('artist');
        $other = $this->creator('other');
        $othersPost = $other->posts()->create(['body' => 'x', 'visibility' => Post::PUBLIC]);
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);

        $this->actingAs($fan)->post('/@artist/tip', ['amount' => 500])->assertSessionHasErrors('amount');
        $this->post('/@artist/tip', ['amount' => 2_000_000])->assertSessionHasErrors('amount');
        $this->post('/@artist/tip', ['amount' => 5000, 'note' => str_repeat('a', 201)])->assertSessionHasErrors('note');
        $this->post('/@artist/tip', ['amount' => 5000, 'post_id' => $othersPost->id])->assertNotFound(); // not their post
        $this->actingAs($creator->user)->post('/@artist/tip', ['amount' => 5000])->assertStatus(422);
        $this->assertSame(0, Payment::count());

        auth()->logout();
        $this->post('/@artist/tip', ['amount' => 5000])->assertRedirect('/login');
    }

    public function test_settling_a_tip_twice_delivers_one_message(): void
    {
        $creator = $this->creator('artist');
        $fan = User::factory()->create(['birthdate' => '1990-01-01']);
        $payments = app(Payments::class);

        $payment = $payments->startTip($fan, $creator, 3000);
        FakeGateway::markPaid($payment);
        $payments->settle($payment);
        $payments->settle($payment->fresh());
        $payments->settle($payment);

        $this->assertSame(1, Message::count());
        $this->assertNull(Message::sole()->body);
    }
}
