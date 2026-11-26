<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use App\Push\Push;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** This browser/phone turning push notifications on or off (the browser makes the subscription, we keep it). */
class PushController extends Controller
{
    public function store(Request $request): Response
    {
        abort_unless(Push::enabled(), 404);
        $data = $request->validate([
            'endpoint' => ['required', 'url:https', 'max:500'],
            'keys.p256dh' => ['required', 'string', 'max:120'],
            'keys.auth' => ['required', 'string', 'max:60'],
            'contentEncoding' => ['nullable', 'in:aesgcm,aes128gcm'],
        ]);

        // The same device signing in as someone else moves to that account.
        PushSubscription::updateOrCreate(['endpoint' => $data['endpoint']], [
            'user_id' => $request->user()->id,
            'public_key' => $data['keys']['p256dh'],
            'auth_token' => $data['keys']['auth'],
            'content_encoding' => $data['contentEncoding'] ?? 'aes128gcm',
        ]);

        return response()->noContent();
    }

    public function destroy(Request $request): Response
    {
        $request->validate(['endpoint' => ['required', 'string', 'max:500']]);
        $request->user()->pushSubscriptions()->where('endpoint', $request->input('endpoint'))->delete();

        return response()->noContent();
    }
}
