<?php

namespace App\Http\Controllers;

use App\Media\Library;
use App\Models\CreatorProfile;
use App\Models\PromoCode;
use App\Models\Subscription;
use App\Models\VaultItem;
use App\Support\Blocking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Promotions. Creators: a free trial for new subscribers and discount codes (studio → Promotions).
 * Fans: start a trial, and check a code at checkout.
 */
class PromotionController extends Controller
{
    public const TRIAL_DAYS = [3, 7, 14];

    private function creator(Request $request): CreatorProfile
    {
        return $request->user()->creatorProfile()->where('status', CreatorProfile::APPROVED)->firstOrFail();
    }

    public function index(Request $request): Response
    {
        $creator = $this->creator($request);

        return Inertia::render('studio/promotions', [
            'trialDays' => $creator->trial_days,
            'trialChoices' => self::TRIAL_DAYS,
            'trialsStarted' => DB::table('subscription_trials')->where('creator_profile_id', $creator->id)->count(),
            'price' => $creator->price_monthly,
            'codes' => $creator->promoCodes()->latest()->get()->map(fn (PromoCode $c) => [
                ...$c->only('id', 'code', 'percent_off', 'max_uses', 'uses', 'active'),
                'expires_at' => $c->expires_at?->toIso8601String(),
                'expired' => (bool) $c->expires_at?->isPast(),
            ]),
            'welcome' => $this->welcome($creator),
        ]);
    }

    /** The welcome DM as set up, and how it does: how many got it, and how many paid to unlock it. */
    private function welcome(CreatorProfile $creator): array
    {
        $ids = (array) $creator->welcome_vault;
        $items = VaultItem::where('creator_profile_id', $creator->id)->whereIn('id', $ids)->get()->keyBy('id');
        $unlocks = DB::table('purchases')->join('messages', 'messages.id', '=', 'purchases.message_id')
            ->leftJoin('payments', 'payments.id', '=', 'purchases.payment_id')
            ->where('messages.sender_id', $creator->user_id)->where('messages.kind', 'welcome')
            ->selectRaw('count(*) as n, coalesce(sum(payments.amount), 0) as total')->first();

        return [
            'enabled' => (bool) $creator->welcome_enabled,
            'body' => (string) $creator->welcome_body,
            'price' => $creator->welcome_price,
            // Still in the library, in the chosen order.
            'items' => collect($ids)->map(fn ($id) => $items[$id] ?? null)->filter()->map(fn (VaultItem $v) => [
                'id' => $v->id, 'type' => $v->type, 'url' => route('studio.library.file', $v),
            ])->values(),
            'sent' => DB::table('welcome_sends')->where('creator_profile_id', $creator->id)->whereNotNull('message_id')->count(),
            'unlocked' => (int) $unlocks->n,
            'earned' => (int) $unlocks->total,
        ];
    }

    public function updateWelcome(Request $request): RedirectResponse
    {
        $creator = $this->creator($request);
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'body' => ['nullable', 'string', 'max:2000'],
            'vault' => ['nullable', 'array', 'max:'.Library::MAX_PER_ITEM],
            'vault.*' => ['integer'],
            'price' => ['nullable', 'integer', 'min:'.config('creators.min_ppv'), 'max:'.config('creators.max_ppv')],
        ]);
        Library::pick($creator, $data['vault'] ?? []); // only the creator's own, usable files
        if ($data['enabled'] && ! filled($data['body'] ?? null) && empty($data['vault'])) {
            return back()->withErrors(['body' => __('Write something or add a photo or video.')]);
        }

        $creator->update([
            'welcome_enabled' => $data['enabled'],
            'welcome_body' => trim((string) ($data['body'] ?? '')) ?: null,
            'welcome_vault' => array_values(array_map('intval', $data['vault'] ?? [])),
            // A price locks the photos/videos, so it only applies when there are some.
            'welcome_price' => ! empty($data['vault']) ? ($data['price'] ?? null) : null,
        ]);

        return back()->with('status', 'saved');
    }

    public function updateTrial(Request $request): RedirectResponse
    {
        $data = $request->validate(['days' => ['nullable', 'integer', Rule::in(self::TRIAL_DAYS)]]);
        $this->creator($request)->update(['trial_days' => $data['days'] ?? null]);

        return back()->with('status', 'saved');
    }

    public function storeCode(Request $request): RedirectResponse
    {
        $creator = $this->creator($request);
        $request->merge(['code' => PromoCode::normalize((string) $request->input('code'))]);
        $data = $request->validate([
            'code' => ['required', 'string', 'min:3', 'max:24', Rule::unique('promo_codes')->where('creator_profile_id', $creator->id)],
            'percent_off' => ['required', 'integer', 'min:5', 'max:90'],
            'max_uses' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ]);
        $creator->promoCodes()->create($data);

        return back()->with('status', 'saved');
    }

    /** Codes are switched off rather than deleted, so past payments keep pointing at them. */
    public function toggleCode(Request $request, PromoCode $code): RedirectResponse
    {
        abort_unless($code->creator_profile_id === $this->creator($request)->id, 404);
        $code->update(['active' => ! $code->active]);

        return back();
    }

    /** Fans: start the creator's free trial (once, and only if never subscribed to them). */
    public function startTrial(Request $request, string $handle): RedirectResponse
    {
        $fan = $request->user();
        $creator = CreatorProfile::listableFor($fan)->where('handle', mb_strtolower($handle))->firstOrFail();
        abort_if($creator->user_id === $fan->id || Blocking::between($creator->user, $fan), 404);
        if (! $creator->trialFor($fan)) {
            return back()->withErrors(['trial' => __('The free trial is only for new subscribers.')]);
        }

        DB::transaction(function () use ($fan, $creator) {
            DB::table('subscription_trials')->insert([
                'user_id' => $fan->id, 'creator_profile_id' => $creator->id, 'days' => $creator->trial_days, 'created_at' => now(), 'updated_at' => now(),
            ]);
            Subscription::create(['user_id' => $fan->id, 'creator_profile_id' => $creator->id, 'expires_at' => now()->addDays($creator->trial_days)]);
            $creator->user->notify(new \App\Notifications\Activity('trial_started', $fan->id, ['days' => $creator->trial_days]));
            \App\Messaging\Welcome::send($creator, $fan);
        });

        return to_route('creator.show', $creator->handle)->with('status', 'trial-started');
    }

    /** Fans: is this code good for me, and what would it take off? (Checkout calls this as you type.) */
    public function checkCode(Request $request, string $handle): JsonResponse
    {
        $creator = CreatorProfile::where('handle', mb_strtolower($handle))->firstOrFail();
        $code = $creator->promoCodes()->where('code', PromoCode::normalize((string) $request->query('code')))->first();
        if (! $code) {
            return response()->json(['ok' => false, 'reason' => 'not_found']);
        }
        $why = $code->whyNot($request->user());

        return response()->json($why ? ['ok' => false, 'reason' => $why] : ['ok' => true, 'code' => $code->code, 'percent_off' => $code->percent_off]);
    }
}
