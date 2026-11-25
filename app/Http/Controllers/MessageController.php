<?php

namespace App\Http\Controllers;

use App\Models\Conversation;
use App\Models\CreatorProfile;
use App\Models\Message;
use App\Models\MessageMedia;
use App\Models\User;
use App\Support\Messaging;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
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

        $thread = null;
        if ($conversation) {
            $other = User::with('creatorProfile:id,user_id,handle,display_name,status')->findOrFail($conversation->otherId($me));
            $conversation->markRead($me);
            $thread = [
                'id' => $conversation->id,
                'other' => $this->person($other),
                'messages' => $conversation->messages()->with('media')->latest('id')->take(self::PAGE)->get()->reverse()->values()->map->present(),
                'cannotSend' => Messaging::whyNot($me, $other),
            ];
        }

        return Inertia::render('messages/index', [
            'conversations' => $this->inbox($me),
            'thread' => $thread,
            'me' => $me->id,
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
        $this->deliver($conversation, $me, ($data['body'] ?? null), $this->storeFiles($request, $me));
        $conversation->markRead($me);

        return back();
    }

    /** Creators: one message to all active subscribers (or all followers). Each fan gets it in their own conversation. */
    public function mass(Request $request): RedirectResponse
    {
        $me = $request->user();
        $creator = $me->creatorProfile()->where('status', CreatorProfile::APPROVED)->firstOrFail();
        $request->validate(['audience' => ['required', 'in:subscribers,followers']]);
        $data = $this->validateMessage($request);

        $recipients = $request->input('audience') === 'subscribers'
            ? User::whereIn('id', $creator->subscriptions()->active()->select('user_id'))
            : $creator->followers()->getQuery();
        $files = $this->storeFiles($request, $me); // stored once, shared by every copy

        $sent = 0;
        $recipients->where('users.id', '!=', $me->id)->select('users.*')->chunkById(200, function ($users) use ($me, $data, $files, &$sent) {
            foreach ($users as $user) {
                $conversation = Conversation::between($me, $user);
                $this->deliver($conversation, $me, ($data['body'] ?? null), $files, mass: true);
                $conversation->markRead($me);
                $sent++;
            }
        }, 'users.id', 'id');

        return back()->with('status', "mass-sent:$sent");
    }

    /** A message photo or video, only for the two people in the conversation. */
    public function media(Request $request, MessageMedia $media): BinaryFileResponse
    {
        $conversation = $media->message->conversation;
        abort_unless($conversation->includes($request->user()), 404);
        abort_unless(Storage::exists($media->path), 404);

        return response()->file(Storage::path($media->path), [
            'Content-Type' => $media->mime,
            'Cache-Control' => 'private, max-age=3600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function validateMessage(Request $request): array
    {
        return $request->validate([
            'body' => ['nullable', 'string', 'max:2000', 'required_without:media'],
            'media' => ['nullable', 'array', 'max:10'],
            'media.*' => ['file', 'mimetypes:image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm', 'max:40960'],
        ], ['body.required_without' => __('Write something or add a photo or video.')]);
    }

    /** @return array<int, array{type: string, path: string, mime: string}> */
    private function storeFiles(Request $request, User $me): array
    {
        return collect($request->file('media', []))->map(fn ($file) => [
            'type' => str_starts_with($file->getMimeType(), 'video/') ? 'video' : 'image',
            'path' => $file->store("messages/{$me->id}"), // private disk
            'mime' => $file->getMimeType(),
        ])->all();
    }

    private function deliver(Conversation $conversation, User $from, ?string $body, array $files, bool $mass = false): Message
    {
        return DB::transaction(function () use ($conversation, $from, $body, $files, $mass) {
            $message = $conversation->messages()->create([
                'sender_id' => $from->id,
                'body' => trim((string) $body) ?: null,
                'is_mass' => $mass,
            ]);
            foreach ($files as $i => $f) {
                $message->media()->create([...$f, 'position' => $i]);
            }
            $conversation->forceFill(['last_message_at' => now()])->saveQuietly();

            return $message;
        });
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
