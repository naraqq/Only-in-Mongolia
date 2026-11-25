<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Payments\FakeGateway;
use App\Payments\PaymentException;
use App\Payments\Payments;
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

        try {
            $payment = $this->payments->startSubscription($request->user(), $creator);
        } catch (PaymentException $e) {
            report($e);

            return back()->withErrors(['payment' => __('Payment is unavailable right now. Please try again in a moment.')]);
        }

        return to_route('payments.show', $payment);
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
            ],
            'creator' => [...$creator->only('handle', 'display_name', 'bio', 'price_monthly'), 'avatar_url' => $creator->avatarUrl()],
            'days' => (int) config('creators.subscription_days'),
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

        return to_route('creator.show', $payment->creator->handle)->with('status', 'subscribed');
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
