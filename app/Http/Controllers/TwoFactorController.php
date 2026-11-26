<?php

namespace App\Http\Controllers;

use App\Http\Middleware\EnsureTwoFactorPassed;
use App\Support\Totp;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Two-step sign-in with an authenticator app: turn it on (scan a QR, confirm a code, keep the recovery codes),
 * turn it off, and the code check after signing in.
 */
class TwoFactorController extends Controller
{
    public function show(Request $request): Response
    {
        $user = $request->user();
        $pending = $user->two_factor_secret && ! $user->two_factor_confirmed_at;

        return Inertia::render('settings/two-factor', [
            'enabled' => $user->hasTwoFactor(),
            'setup' => $pending ? [
                'secret' => $user->two_factor_secret,
                'url' => Totp::url(config('app.name'), $user->phone ?? $user->email ?? (string) $user->id, $user->two_factor_secret),
            ] : null,
            'recoveryCodes' => $request->session()->get('recovery_codes'),
            'required' => (bool) $user->is_admin && config('security.admin_requires_two_factor'),
            'recoveryLeft' => $user->hasTwoFactor() ? count($user->two_factor_recovery_codes ?? []) : 0,
        ]);
    }

    /** Step 1: make a secret for the app to scan. Nothing changes for sign-in until a code confirms it. */
    public function enable(Request $request): RedirectResponse
    {
        $user = $request->user();
        abort_if($user->hasTwoFactor(), 409);
        $user->forceFill(['two_factor_secret' => Totp::secret(), 'two_factor_confirmed_at' => null])->save();

        return back();
    }

    /** Step 2: the first code from the app proves it's set up; hand out recovery codes once. */
    public function confirm(Request $request): RedirectResponse
    {
        $user = $request->user();
        $data = $request->validate(['code' => ['required', 'string']]);
        abort_unless($user->two_factor_secret && ! $user->two_factor_confirmed_at, 409);
        if (! Totp::verify($user->two_factor_secret, $data['code'])) {
            return back()->withErrors(['code' => __('That code isn’t right. Try the newest one in your app.')]);
        }

        $codes = collect(range(1, 8))->map(fn () => Str::upper(Str::random(5).'-'.Str::random(5)))->all();
        $user->forceFill(['two_factor_confirmed_at' => now(), 'two_factor_recovery_codes' => $codes])->save();
        EnsureTwoFactorPassed::markPassed($request);

        return back()->with('recovery_codes', $codes);
    }

    public function disable(Request $request): RedirectResponse
    {
        $user = $request->user();
        $data = $request->validate(['code' => ['required', 'string']]);
        if ($user->hasTwoFactor() && ! $this->accepts($user, $data['code'])) {
            return back()->withErrors(['code' => __('That code isn’t right.')]);
        }
        $user->forceFill(['two_factor_secret' => null, 'two_factor_recovery_codes' => null, 'two_factor_confirmed_at' => null])->save();

        return back();
    }

    public function challenge(Request $request): Response|RedirectResponse
    {
        if (! $request->user()->hasTwoFactor() || EnsureTwoFactorPassed::passed($request)) {
            return redirect()->intended(route('home'));
        }

        return Inertia::render('auth/two-factor');
    }

    public function verify(Request $request): RedirectResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:20']]);
        if (! $this->accepts($request->user(), $data['code'])) {
            return back()->withErrors(['code' => __('That code isn’t right.')]);
        }
        EnsureTwoFactorPassed::markPassed($request);

        return redirect()->intended(route('home'));
    }

    /** A current app code, or one of the recovery codes (each works once). */
    private function accepts($user, string $code): bool
    {
        if (Totp::verify($user->two_factor_secret, $code)) {
            return true;
        }
        $codes = $user->two_factor_recovery_codes ?? [];
        $given = Str::upper(trim($code));
        if (in_array($given, $codes, true)) {
            $user->forceFill(['two_factor_recovery_codes' => array_values(array_diff($codes, [$given]))])->save();

            return true;
        }

        return false;
    }
}
