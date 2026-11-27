<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Block / unblock someone (from a chat, a creator page, or Settings → Blocked). */
class BlockController extends Controller
{
    public function toggle(Request $request, User $user): JsonResponse
    {
        $me = $request->user();
        abort_if($user->id === $me->id, 422, 'You can’t block yourself.');

        $key = ['blocker_id' => $me->id, 'blocked_id' => $user->id];
        $blocked = ! DB::table('blocks')->where($key)->exists();
        $blocked ? DB::table('blocks')->insert([...$key, 'created_at' => now(), 'updated_at' => now()]) : DB::table('blocks')->where($key)->delete();

        // Blocking a creator also stops following them.
        if ($blocked && ($creator = $user->creatorProfile)) {
            $me->following()->detach($creator->id);
        }
        // A creator blocking a fan also takes them off the page's followers.
        if ($blocked && ($mine = $me->creatorProfile)) {
            DB::table('follows')->where('creator_profile_id', $mine->id)->where('user_id', $user->id)->delete();
        }

        return response()->json(['blocked' => $blocked]);
    }
}
