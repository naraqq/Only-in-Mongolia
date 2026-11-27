<?php

namespace App\Http\Controllers;

use App\Fans\Audience;
use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\FanList;
use App\Models\Payment;
use App\Models\User;
use App\Support\Messaging;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Studio → Fans: everyone connected to the page (subscribers, past subscribers, followers) with what they've spent,
 * and the creator's own lists for aiming mass messages.
 */
class FansController extends Controller
{
    private const PAGE = 50;

    private function creator(Request $request): CreatorProfile
    {
        return $request->user()->creatorProfile()->where('status', CreatorProfile::APPROVED)->firstOrFail();
    }

    public function index(Request $request): Response
    {
        $creator = $this->creator($request);
        $show = (string) $request->query('show', 'all');
        $show = $show === 'all' || Audience::valid($creator, $show) ? $show : 'all';
        $q = trim((string) $request->query('q', ''));
        $sort = $request->query('sort') === 'spent' ? 'spent' : 'recent';
        $limit = min(500, self::PAGE * max(1, $request->integer('page', 1)));

        $people = ($show === 'all'
            ? User::where(fn ($w) => $w
                ->whereIn('id', DB::table('subscriptions')->where('creator_profile_id', $creator->id)->select('user_id'))
                ->orWhereIn('id', DB::table('follows')->where('creator_profile_id', $creator->id)->select('user_id')))
                ->where('id', '!=', $creator->user_id)
            : Audience::query($creator, $show))
            ->when($q !== '', fn ($w) => $w->where('name', 'like', '%'.$q.'%'))
            ->with('creatorProfile:id,user_id,handle,display_name,status');

        $total = (clone $people)->count();
        // Newest connection first (subscribed or followed), or biggest spenders first.
        $users = $people->select('users.*')
            ->addSelect(['connected_at' => fn ($s) => $s->from('follows')->whereColumn('follows.user_id', 'users.id')
                ->where('follows.creator_profile_id', $creator->id)->select('created_at')->limit(1)])
            ->addSelect(['subscribed_since' => fn ($s) => $s->from('subscriptions')->whereColumn('subscriptions.user_id', 'users.id')
                ->where('subscriptions.creator_profile_id', $creator->id)->select('created_at')->limit(1)])
            ->addSelect(['spent_total' => fn ($s) => $s->from('payments')->whereColumn('payments.user_id', 'users.id')
                ->where('payments.creator_profile_id', $creator->id)->where('payments.status', Payment::PAID)
                ->whereIn('payments.purpose', Payment::SALES)->selectRaw('coalesce(sum(amount), 0)')])
            ->when($sort === 'spent', fn ($w) => $w->orderByDesc('spent_total'))
            ->orderByRaw('coalesce(subscribed_since, connected_at) desc')->orderByDesc('users.id')
            ->take($limit)->get();
        $ids = $users->pluck('id')->all();
        $spent = Audience::spentBy($creator, $ids);
        $subs = DB::table('subscriptions')->where('creator_profile_id', $creator->id)->whereIn('user_id', $ids)->get()->keyBy('user_id');
        $following = DB::table('follows')->where('creator_profile_id', $creator->id)->whereIn('user_id', $ids)->get()->keyBy('user_id');
        $blocked = DB::table('blocks')->where('blocker_id', $creator->user_id)->whereIn('blocked_id', $ids)->pluck('blocked_id')->flip();
        $memberships = DB::table('fan_list_members')->join('fan_lists', 'fan_lists.id', '=', 'fan_list_members.fan_list_id')
            ->where('fan_lists.creator_profile_id', $creator->id)->whereIn('fan_list_members.user_id', $ids)
            ->get(['fan_list_members.user_id', 'fan_lists.id'])->groupBy('user_id');

        return Inertia::render('studio/fans', [
            'fans' => $users->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->creatorProfile?->status === CreatorProfile::APPROVED ? $u->creatorProfile->display_name : $u->name,
                'handle' => $u->creatorProfile?->status === CreatorProfile::APPROVED ? $u->creatorProfile->handle : null,
                'avatar_url' => $u->avatar_url,
                'spent' => $spent[$u->id] ?? 0,
                'subscribed_at' => isset($subs[$u->id]) ? (string) $subs[$u->id]->created_at : null,
                'expires_at' => isset($subs[$u->id]) ? (string) $subs[$u->id]->expires_at : null,
                'active' => isset($subs[$u->id]) && now()->lt($subs[$u->id]->expires_at),
                'following' => isset($following[$u->id]),
                'followed_at' => isset($following[$u->id]) ? (string) $following[$u->id]->created_at : null,
                'referrer' => $following[$u->id]->referrer ?? null,
                'blocked' => isset($blocked[$u->id]),
                'lists' => ($memberships[$u->id] ?? collect())->pluck('id')->all(),
            ]),
            'total' => $total,
            'show' => $show,
            'q' => $q,
            'sort' => $sort,
            'hasMore' => $total > $users->count(),
            'lists' => FanList::where('creator_profile_id', $creator->id)->orderBy('name')->get(['id', 'name']),
            'counts' => Audience::counts($creator),
        ]);
    }

    /** Groups and lists with their sizes, for the mass message's "To" picker. */
    public function audiences(Request $request): JsonResponse
    {
        $creator = $this->creator($request);

        return response()->json([
            'counts' => Audience::counts($creator),
            'lists' => FanList::where('creator_profile_id', $creator->id)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function storeList(Request $request): RedirectResponse
    {
        $creator = $this->creator($request);
        $data = $request->validate(['name' => ['required', 'string', 'max:40']]);
        abort_if(FanList::where('creator_profile_id', $creator->id)->count() >= 50, 422);
        FanList::create(['creator_profile_id' => $creator->id, 'name' => trim($data['name'])]);

        return back();
    }

    public function updateList(Request $request, FanList $list): RedirectResponse
    {
        abort_unless($list->creator_profile_id === $this->creator($request)->id, 404);
        $list->update($request->validate(['name' => ['required', 'string', 'max:40']]));

        return back();
    }

    public function destroyList(Request $request, FanList $list): RedirectResponse
    {
        abort_unless($list->creator_profile_id === $this->creator($request)->id, 404);
        $list->delete();

        return to_route('studio.fans');
    }

    /** Open (or start) a conversation with someone connected to the page. */
    public function message(Request $request, User $user): RedirectResponse
    {
        $me = $request->user();
        $this->creator($request);
        if ($reason = Messaging::whyNot($me, $user)) {
            return back()->withErrors(['message' => "cannot.$reason"]);
        }

        return to_route('studio.messages.show', Conversation::between($me, $user));
    }

    /** Take someone off the page's followers (they can follow again unless blocked). */
    public function removeFollower(Request $request, User $user): RedirectResponse
    {
        DB::table('follows')->where('creator_profile_id', $this->creator($request)->id)->where('user_id', $user->id)->delete();

        return back();
    }

    /** Put a fan on a list, or take them off. Only people connected to the page can be added. */
    public function toggle(Request $request, FanList $list, User $user): RedirectResponse
    {
        $creator = $this->creator($request);
        abort_unless($list->creator_profile_id === $creator->id, 404);
        $connected = DB::table('subscriptions')->where('creator_profile_id', $creator->id)->where('user_id', $user->id)->exists()
            || DB::table('follows')->where('creator_profile_id', $creator->id)->where('user_id', $user->id)->exists();
        abort_unless($connected, 404);

        $list->members()->toggle([$user->id => ['created_at' => now()]]);

        return back();
    }
}
