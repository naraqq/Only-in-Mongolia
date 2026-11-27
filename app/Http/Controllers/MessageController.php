<?php

namespace App\Http\Controllers;

use App\Fans\Audience;
use App\Media\Files;
use App\Media\Library;
use App\Media\Stamp;
use App\Media\Uploads;
use App\Messaging\Outbox;
use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\MessageMedia;
use App\Models\User;
use App\Moderation\Moderation;
use App\Support\Blocking;
use App\Support\Live;
use App\Support\Messaging;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Direct messages: the inbox, one conversation, sending (text + photos/videos) and mass messages from creators. */
class MessageController extends Controller
{
    private const PAGE = 60;

    public function index(Request $request, ?Conversation $conversation = null): Response
    {
        $me = $request->user();
        abort_if($conversation && ! $conversation->includes($me), 404);
        // Opened from the studio: only for approved creators, shown in the studio layout.
        $studio = $request->routeIs('studio.*');
        abort_if($studio && ! $me->creatorProfile()->where('status', CreatorProfile::APPROVED)->exists(), 404);

        $thread = null;
        if ($conversation) {
            $other = User::with('creatorProfile:id,user_id,handle,display_name,status')->findOrFail($conversation->otherId($me));
            $conversation->markRead($me);
            $thread = [
                'id' => $conversation->id,
                'other' => $this->person($other),
                'messages' => $conversation->messages()->with('media')->latest('id')->take(self::PAGE)->get()->reverse()->values()->map(fn (Message $m) => $m->present($me)),
                'cannotSend' => Messaging::whyNot($me, $other),
                'iBlocked' => Blocking::hasBlocked($me, $other),
            ];
        }

        return Inertia::render('messages/index', [
            'conversations' => $this->inbox($me),
            'thread' => $thread,
            'me' => $me->id,
            'area' => $studio ? 'studio' : 'social',
        ]);
    }

    /** "Message" on a creator's page: open (or create) the conversation if allowed. */
    public function start(Request $request, string $handle): RedirectResponse
    {
        $creator = CreatorProfile::listableFor($request->user())->where('handle', mb_strtolower($handle))->firstOrFail();
        $reason = Messaging::whyNot($request->user(), $creator->user);
        if ($reason && ! Conversation::findBetween($request->user(), $creator->user)) {
            return back()->withErrors(['message' => "cannot.$reason"]); // translated in the browser
        }

        return to_route('messages.show', Conversation::between($request->user(), $creator->user));
    }

    public function send(Request $request, Conversation $conversation): RedirectResponse
    {
        $me = $request->user();
        abort_unless($conversation->includes($me), 404);
        $other = User::findOrFail($conversation->otherId($me));
        if ($reason = Messaging::whyNot($me, $other)) {
            return back()->withErrors(['body' => "cannot.$reason"]);
        }

        $data = $this->validateMessage($request);
        if (isset($data['price']) && ! $me->creatorProfile()->where('status', CreatorProfile::APPROVED)->exists()) {
            return back()->withErrors(['price' => 'Only creators can sell messages.']);
        }
        $message = Outbox::deliver($conversation, $me, ($data['body'] ?? null), $this->storeFiles($request, $me), price: $data['price'] ?? null);
        Moderation::queue(...$message->media()->get()->all());
        $conversation->markRead($me);
        Outbox::push($other, $me, $message, $conversation);

        return back();
    }

    /** Creators: one message to all active subscribers (or all followers). Each fan gets it in their own conversation. */
    public function mass(Request $request): RedirectResponse
    {
        $me = $request->user();
        $creator = $me->creatorProfile()->where('status', CreatorProfile::APPROVED)->firstOrFail();
        $request->validate([
            'audience' => ['required', 'string', fn ($attr, $value, $fail) => Audience::valid($creator, (string) $value) || $fail(__('Choose who gets it.'))],
            'skip_owners' => ['boolean'],
        ]);
        $data = $this->validateMessage($request);
        $files = $this->storeFiles($request, $me); // stored once, shared by every copy

        $recipients = Audience::query($creator, $request->input('audience'))
            // Never people who blocked the creator, or whom the creator blocked.
            ->whereNotIn('users.id', DB::table('blocks')->where('blocker_id', $me->id)->select('blocked_id'))
            ->whereNotIn('users.id', DB::table('blocks')->where('blocked_id', $me->id)->select('blocker_id'));
        // "Skip fans who already have these": anyone who unlocked a post or message with any of the same files.
        if ($request->boolean('skip_owners') && $files) {
            $paths = array_column($files, 'path');
            $recipients->whereNotIn('users.id', DB::table('purchases')->join('message_media', 'message_media.message_id', '=', 'purchases.message_id')
                ->whereIn('message_media.path', $paths)->select('purchases.user_id'))
                ->whereNotIn('users.id', DB::table('purchases')->join('post_media', 'post_media.post_id', '=', 'purchases.post_id')
                    ->whereIn('post_media.path', $paths)->select('purchases.user_id'));
        }

        $sent = 0;
        $first = null;
        $recipients->select('users.*')->chunkById(200, function ($users) use ($me, $data, $files, &$sent, &$first) {
            foreach ($users as $user) {
                $conversation = Conversation::between($me, $user);
                $message = Outbox::deliver($conversation, $me, ($data['body'] ?? null), $files, mass: true, price: $data['price'] ?? null);
                $first ??= $message;
                $conversation->markRead($me);
                $sent++;
            }
            Live::user($users->pluck('id')->all(), 'inbox'); // one batch of pings per 200 fans
        }, 'users.id', 'id');
        // The files are shared by every copy, so one scan covers them all.
        if ($first) {
            Moderation::queue(...$first->media()->get()->all());
        }

        return back()->with('status', "mass-sent:$sent");
    }

    /** A message photo or video, only for the two people in the conversation. */
    public function media(Request $request, MessageMedia $media, Stamp $stamp): BinaryFileResponse|RedirectResponse
    {
        $conversation = $media->message->conversation;
        abort_unless($conversation->includes($request->user()), 404);
        abort_unless($media->message->isUnlockedFor($request->user()), 403);
        // Flagged by the automatic scan (copies of a mass message share files): not served while it waits for review.
        abort_if(! $request->user()->is_admin && MessageMedia::where('path', $media->path)->where('scan_status', 'flagged')->exists(), 404);
        abort_unless(Files::exists($media->path), 404);
        if ($media->type === 'image' && ($text = Stamp::forMessage($media->message, $request->user()))) {
            return response()->file($stamp->image($media->path, $text), ['Content-Type' => 'image/jpeg', ...[
                'Cache-Control' => 'private, max-age=3600',
                'X-Content-Type-Options' => 'nosniff',
            ]]);
        }

        return Files::response($media->path, $media->mime, ['Cache-Control' => 'private, max-age=3600']);
    }

    private function validateMessage(Request $request): array
    {
        return $request->validate([
            'body' => ['nullable', 'string', 'max:2000', 'required_without_all:media,vault'],
            'media' => ['nullable', 'array', 'max:10'],
            // Creators: photos and videos picked from their media library.
            'vault' => ['nullable', 'array', 'max:'.Library::MAX_PER_ITEM],
            'vault.*' => ['integer'],
            'media.*' => Uploads::rule(),
            // A price locks the photos/videos, so it only applies to messages that have some.
            'price' => ['nullable', 'integer', 'min:'.config('creators.min_ppv'), 'max:'.config('creators.max_ppv')],
        ], ['body.required_without_all' => __('Write something or add a photo or video.')]);
    }

    /**
     * Library picks (creators only) followed by new uploads. A creator's uploads join their library.
     *
     * @return array<int, array{type: string, path: string, mime: string}>
     */
    private function storeFiles(Request $request, User $me): array
    {
        $creator = $me->creatorProfile()->where('status', CreatorProfile::APPROVED)->first();
        $picks = $request->input('vault', []);
        if ($picks && ! $creator) {
            throw ValidationException::withMessages(['vault' => __('This file can’t be used.')]);
        }
        if (count($request->file('media', [])) + count($picks) > Library::MAX_PER_ITEM) {
            throw ValidationException::withMessages(['media' => __('A message can have at most 10 photos and videos.')]);
        }
        $picked = $creator ? Library::pick($creator, $picks) : [];
        Uploads::checkSizes($request->file('media', []));
        $hashes = Moderation::screen($request->file('media', []));

        $uploads = collect($request->file('media', []))->map(fn ($file, $i) => [
            ...Uploads::describe($file),
            'path' => Files::store($file, "messages/{$me->id}"), // the media disk (private)
            'sha256' => $hashes[$i],
        ])->all();
        if ($creator) {
            foreach ($uploads as $file) {
                Library::record($creator, $file);
            }
        }

        // A pick already scanned elsewhere keeps its result; anything else waits for the scan.
        return [...array_map(fn ($f) => [...$f, 'scan_status' => $f['scan_status'] ?? 'pending'], $picked), ...$uploads];
    }

    /** Conversations with at least one message, newest first. */
    private function inbox(User $me): array
    {
        $conversations = Conversation::for($me)->whereNotNull('last_message_at')
            ->with(['lastMessage.media', 'low.creatorProfile:id,user_id,handle,display_name,status', 'high.creatorProfile:id,user_id,handle,display_name,status'])
            ->latest('last_message_at')->take(100)->get();

        $unread = Conversation::unreadByConversation($me);

        return $conversations->map(function (Conversation $c) use ($me, $unread) {
            $other = $c->user_low_id === $me->id ? $c->high : $c->low;
            $last = $c->lastMessage;

            return [
                'id' => $c->id,
                'other' => $this->person($other),
                'last' => $last ? [
                    'mine' => $last->sender_id === $me->id,
                    'body' => $last->body,
                    'has_media' => $last->media->isNotEmpty(),
                    'at' => $last->created_at->toIso8601String(),
                ] : null,
                'unread' => $unread[$c->id] ?? 0,
            ];
        })->all();
    }

    /** How a person shows up in messages: their creator name and handle if they're a creator. */
    private function person(User $user): array
    {
        $creator = $user->creatorProfile?->status === CreatorProfile::APPROVED ? $user->creatorProfile : null;

        return [
            'id' => $user->id,
            'name' => $creator?->display_name ?? $user->name,
            'handle' => $creator?->handle,
            'avatar_url' => $user->avatar_url,
        ];
    }
}
