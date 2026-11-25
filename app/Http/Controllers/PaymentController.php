<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\Payment;
use App\Models\Post;
use App\Models\Purchase;
use App\Payments\FakeGateway;
use App\Payments\PaymentException;
use App\Payments\Payments;
use App\Support\Blocking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Inertia\Inertia;
use Inertia\Response;

/** Subscribing to a creator: create a QPay invoice, show the checkout, and settle once QPay says it's paid. */
class PaymentController extends Controller
{
    public function __construct(private readonly Payments $payments) {}

    public function subscribe(Request $request, string $handle): RedirectResponse
    {
        $creator = CreatorProfile::listableFor($request->user())->where('handle', mb_strtolower($handle))->firstOrFail();
        abort_if($creator->user_id === $request->user()->id, 422, 'You can’t subscribe to yourself.');
        abort_if(Blocking::between($creator->user, $request->user()), 404);
        $months = (int) ($request->validate(['months' => ['nullable', 'integer', 'in:1,'.implode(',', config('creators.bundle_months'))]])['months'] ?? 1);
        abort_if($creator->priceFor($months) === null, 422, 'This bundle is not offered.');

        try {
            $payment = $this->payments->startSubscription($request->user(), $creator, $months);
        } catch (PaymentException $e) {
            report($e);

            return back()->withErrors(['payment' => __('Payment is unavailable right now. Please try again in a moment.')]);
        }

        return to_route('payments.show', $payment);
    }

    /** Tip a creator any amount within limits, optionally for one of their posts and with a short note. */
    public function tip(Request $request, string $handle): RedirectResponse
    {
        $creator = CreatorProfile::listableFor($request->user())->where('handle', mb_strtolower($handle))->firstOrFail();
        abort_if($creator->user_id === $request->user()->id, 422, 'You can’t tip yourself.');
        abort_if(Blocking::between($creator->user, $request->user()), 404);

        $data = $request->validate([
            'amount' => ['required', 'integer', 'min:'.config('creators.min_tip'), 'max:'.config('creators.max_tip')],
            'note' => ['nullable', 'string', 'max:200'],
            'post_id' => ['nullable', 'integer'],
        ]);
        $post = isset($data['post_id']) ? $creator->posts()->whereKey($data['post_id'])->firstOrFail() : null;

        try {
            $payment = $this->payments->startTip($request->user(), $creator, (int) $data['amount'], $post, trim((string) ($data['note'] ?? '')) ?: null);
        } catch (PaymentException $e) {
            report($e);

            return back()->withErrors(['payment' => __('Payment is unavailable right now. Please try again in a moment.')]);
        }

        return to_route('payments.show', $payment);
    }

    /** Unlock a pay-per-view post (you need to be able to see the creator's page). */
    public function buyPost(Request $request, Post $post): RedirectResponse
    {
        $me = $request->user();
        $post->load('creator');
        abort_unless($post->price && $post->creator->isApproved() && ! ($post->creator->adult_content && ! $me), 404);
        abort_if(Blocking::between($post->creator->user, $me), 404);
        if ($post->isVisibleTo($me)) {
            return to_route('creator.show', $post->creator->handle); // already unlocked (or it's yours)
        }

        return $this->checkout(fn () => $this->payments->startPostPurchase($me, $post));
    }

    /** Unlock a pay-per-view message someone sent you. */
    public function buyMessage(Request $request, Message $message): RedirectResponse
    {
        $me = $request->user();
        abort_unless($message->price && $message->conversation->includes($me), 404);
        if ($message->isUnlockedFor($me)) {
            return to_route('messages.show', $message->conversation_id);
        }
        $creator = $message->sender->creatorProfile()->where('status', 'approved')->firstOrFail();

        return $this->checkout(fn () => $this->payments->startMessagePurchase($me, $creator, $message));
    }

    /** @param  callable(): Payment  $start */
    private function checkout(callable $start): RedirectResponse
    {
        try {
            return to_route('payments.show', $start());
        } catch (PaymentException $e) {
            report($e);

            return back()->withErrors(['payment' => __('Payment is unavailable right now. Please try again in a moment.')]);
        }
    }

    /** Where to go once paid: the chat for a message, otherwise the creator's page. */
    private function returnUrl(Payment $payment): string
    {
        if ($payment->message_id && $payment->message) {
            return route('messages.show', $payment->message->conversation_id);
        }

        return route('creator.show', $payment->creator->handle);
    }

    public function show(Request $request, Payment $payment): Response|RedirectResponse
    {
        $this->authorizeOwner($request, $payment);
        $creator = $payment->creator;

        return Inertia::render('payments/show', [
            'payment' => [
                'id' => $payment->id,
                'amount' => $payment->amount,
                'status' => $payment->status,
                'qr_image' => $payment->qr_image,
                'bank_links' => $payment->bank_links ?? [],
                'fake' => $payment->provider === 'fake',
                'purpose' => $payment->purpose,
                'note' => $payment->note,
                'months' => $payment->months,
            ],
            'returnUrl' => $this->returnUrl($payment),
            'creator' => [...$creator->only('handle', 'display_name', 'bio', 'price_monthly'), 'avatar_url' => $creator->avatarUrl()],
            'days' => (int) config('creators.subscription_days') * max(1, $payment->months),
            'expiresAt' => $request->user()->subscriptions()->where('creator_profile_id', $creator->id)->value('expires_at'),
        ]);
    }

    /** Polled by the checkout page: asks the gateway and settles if paid. */
    public function status(Request $request, Payment $payment): JsonResponse
    {
        $this->authorizeOwner($request, $payment);

        try {
            $payment = $this->payments->settle($payment);
        } catch (PaymentException $e) {
            report($e); // keep polling; the next check may succeed
        }

        return response()->json(['status' => $payment->status]);
    }

    /** DEV ONLY: "pay" a fake invoice. Not available for real QPay payments. */
    public function fakePay(Request $request, Payment $payment): RedirectResponse
    {
        $this->authorizeOwner($request, $payment);
        abort_unless($payment->provider === 'fake' && $this->payments->gateway() instanceof FakeGateway, 404);

        FakeGateway::markPaid($payment);
        $this->payments->settle($payment);

        return redirect($this->returnUrl($payment))->with('status', match ($payment->purpose) {
            Payment::TIP => 'tipped',
            Payment::PPV => 'unlocked',
            default => 'subscribed',
        });
    }

    /** QPay's notification. We never trust it: it only makes us ask QPay for the real status. */
    public function callback(Payment $payment): HttpResponse
    {
        try {
            $this->payments->settle($payment);
        } catch (PaymentException $e) {
            report($e);
        }

        return response('SUCCESS');
    }

    private function authorizeOwner(Request $request, Payment $payment): void
    {
        abort_unless($payment->user_id === $request->user()->id, 404);
    }
}
