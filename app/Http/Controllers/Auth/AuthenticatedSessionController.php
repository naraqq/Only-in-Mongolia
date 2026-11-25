<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/** Logging out. (Logging in is by phone; see PhoneLoginController.) */
class AuthenticatedSessionController extends Controller
{
    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();

        // Logging out clears the session, but the visitor's language choice should survive it.
        $locale = $request->session()->get('locale');
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        if ($locale) {
            $request->session()->put('locale', $locale);
        }

        return redirect('/');
    }
}
