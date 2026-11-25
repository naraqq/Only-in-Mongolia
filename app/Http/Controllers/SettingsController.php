<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/** Settings: the signed-in number, language, appearance, and deleting the account. */
class SettingsController extends Controller
{
    /** Typing this confirms deleting the account (there's no password to ask for). */
    public const DELETE_WORD = 'DELETE';

    public function index(Request $request): Response
    {
        $user = $request->user();

        return Inertia::render('settings/index', [
            'phone' => $user->phone,
            'isCreator' => $user->creatorProfile()->exists(),
            'deleteWord' => self::DELETE_WORD,
            'blocked' => \App\Models\User::whereIn('id', \Illuminate\Support\Facades\DB::table('blocks')->where('blocker_id', $user->id)->select('blocked_id'))
                ->with('creatorProfile:id,user_id,handle,display_name,status')->get()
                ->map(fn ($u) => ['id' => $u->id, 'name' => $u->creatorProfile?->display_name ?? $u->name, 'handle' => $u->creatorProfile?->handle, 'avatar_url' => $u->avatar_url]),
        ]);
    }

    public function destroy(Request $request): RedirectResponse
    {
        $request->validate(['confirm' => ['required', 'in:'.self::DELETE_WORD]]);
        $user = $request->user();

        Auth::logout();
        $user->delete(); // posts, messages, subscriptions and the creator page go with it (foreign keys cascade)
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
