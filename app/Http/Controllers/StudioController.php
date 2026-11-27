<?php

namespace App\Http\Controllers;

use App\Media\ChunkedUploads;
use App\Media\Files;
use App\Media\Library;
use App\Media\Paths;
use App\Media\Transcoding;
use App\Media\Uploads;
use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Moderation\Moderation;
use App\Support\Notify;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/** Where an approved creator writes and manages posts. */
class StudioController extends Controller
{
    private function creator(Request $request): CreatorProfile
    {
        $creator = $request->user()->creatorProfile()->first();
        abort_unless($creator?->isApproved(), 403);

        return $creator;
    }

    public function index(Request $request): Response
    {
        $creator = $this->creator($request);

        $paidThisMonth = $creator->payments()->where('status', Payment::PAID)->where('paid_at', '>=', now()->startOfMonth());

        $use = collect(explode(',', (string) $request->query('use')))->map(fn ($id) => (int) $id)->filter()->take(10);
        $prefill = $use->isEmpty() ? [] : $creator->vaultItems()->whereIn('id', $use)->get()
            ->sortBy(fn ($v) => $use->search($v->id))->values()
            ->map(fn ($v) => ['id' => $v->id, 'type' => $v->type, 'url' => route('studio.library.file', $v)])->all();

        return Inertia::render('studio/index', [
            'prefill' => $prefill,
            'prefillFor' => $request->query('to') === 'fans' ? 'fans' : 'post',
            'stats' => [
                'subscribers' => $creator->subscriptions()->active()->count(),
                'followers' => $creator->followers()->count(),
                // What the creator earns after the platform fee, this calendar month.
                'earnedThisMonth' => (int) (clone $paidThisMonth)->sum('amount') - (int) (clone $paidThisMonth)->sum('platform_fee'),
                'feePercent' => (int) config('creators.platform_fee_percent'),
            ],
            'creator' => [...$creator->only('handle', 'display_name', 'price_monthly', 'adult_content'), 'avatar_url' => $creator->avatarUrl()],
            // Scheduled posts first (soonest at the top), then everything published.
            'posts' => $creator->posts()->with('media')->withEngagement($request->user())->reorder()
                ->orderByRaw('case when publish_at > ? then 0 else 1 end', [now()])->orderBy('publish_at')->latest()->latest('id')
                ->take(100)->get()
                ->map(fn (Post $p) => [...CreatorPageController::present($p, $request->user()), 'pinned' => $p->id === $creator->pinned_post_id, 'held' => $p->held_at !== null]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $creator = $this->creator($request);

        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:5000', 'required_without_all:media,vault,uploads', 'required_with:poll_options'],
            'visibility' => ['required', Rule::in([Post::PUBLIC, Post::SUBSCRIBERS])],
            'is_adult' => ['boolean'],
            'price' => [Rule::prohibitedIf((bool) $request->input('poll_options')), 'nullable', 'integer', 'min:'.config('creators.min_ppv'), 'max:'.config('creators.max_ppv')],
            'poll_options' => ['nullable', 'array', 'list', 'min:2', 'max:4'],
            'poll_options.*' => ['required', 'string', 'max:80', 'distinct:ignore_case'],
            'publish_at' => ['nullable', 'date', 'after:now', 'before:+1 year'],
            // A live Q&A: when it starts and how long it runs (the post text is the topic).
            'qa_starts_at' => ['nullable', 'date', 'after:now', 'before:+3 months', Rule::prohibitedIf((bool) $request->input('poll_options') || (bool) $request->input('price'))],
            'qa_minutes' => ['nullable', 'required_with:qa_starts_at', 'integer', Rule::in(QaController::MINUTES)],
            'media' => ['nullable', 'array', 'max:10'],
            // Photos up to 20 MB, videos 40 MB, audio (music, podcasts) 100 MB; see App\Media\Uploads.
            'media.*' => Uploads::rule(),
            // Photos and videos picked from the media library.
            'vault' => ['nullable', 'array', 'max:'.Library::MAX_PER_ITEM],
            'vault.*' => ['integer'],
            // Files already sent in pieces (App\Media\ChunkedUploads), by upload id, in the order chosen.
            'uploads' => ['nullable', 'array', 'max:'.Library::MAX_PER_ITEM],
            'uploads.*' => ['string', 'max:40'],
        ], [
            'body.required_without_all' => __('Write something or add a photo or video.'),
        ]);
        if (count($request->file('media', [])) + count($data['vault'] ?? []) + count($data['uploads'] ?? []) > Library::MAX_PER_ITEM) {
            return back()->withErrors(['media' => __('A post can have at most 10 photos and videos.')]);
        }
        $qaStarts = isset($data['qa_starts_at']) ? Carbon::parse($data['qa_starts_at']) : null;
        if ($qaStarts && ! trim((string) ($data['body'] ?? ''))) {
            return back()->withErrors(['body' => __('Say what the Q&A is about.')]);
        }
        if ($qaStarts && isset($data['publish_at']) && Carbon::parse($data['publish_at'])->gte($qaStarts)) {
            return back()->withErrors(['qa_starts_at' => __('The Q&A has to start after the post goes out.')]);
        }
        $picked = Library::pick($creator, $data['vault'] ?? []);
        $uploads = ChunkedUploads::attachable($request->user(), $data['uploads'] ?? []);

        Uploads::checkSizes($request->file('media', []));

        // 18+ posts only from creators who said their page has 18+ content.
        $adult = (bool) ($data['is_adult'] ?? false);
        if ($adult && ! $creator->adult_content) {
            return back()->withErrors(['is_adult' => __('Turn on 18+ content for your page first.')]);
        }

        $hashes = Moderation::screen($request->file('media', []));

        $post = DB::transaction(function () use ($creator, $data, $adult, $request, $hashes, $picked, $uploads, $qaStarts) {
            $post = $creator->posts()->create([
                'body' => trim((string) ($data['body'] ?? '')) ?: null,
                'visibility' => $data['visibility'],
                'is_adult' => $adult,
                'price' => $data['price'] ?? null,
                'publish_at' => $data['publish_at'] ?? null,
                'poll_options' => $data['poll_options'] ?? null,
                'qa_starts_at' => $qaStarts,
                'qa_ends_at' => $qaStarts?->copy()->addMinutes((int) $data['qa_minutes']),
            ]);
            // Library picks first, in the order chosen, then new uploads (which join the library).
            $position = 0;
            foreach ($picked as $file) {
                $post->media()->create([...$file, 'scan_status' => $file['scan_status'] ?? 'pending', 'position' => $position++]);
            }
            foreach ($uploads as $upload) {
                if (! ChunkedUploads::markAttached($upload)) {
                    throw ValidationException::withMessages(['uploads' => __('A file is still uploading or has expired. Remove it and add it again.')]);
                }
                $stored = $upload->only(['type', 'mime', 'path', 'sha256']);
                $post->media()->create([...$stored, 'position' => $position++]);
                Library::record($creator, $stored);
            }
            foreach ($request->file('media', []) as $i => $file) {
                $stored = [
                    ...Uploads::describe($file),
                    'path' => Files::storeFor($file, $creator->user_id, Paths::POSTS), // the media disk (private)
                    'sha256' => $hashes[$i],
                ];
                $post->media()->create([...$stored, 'position' => $position++]);
                Library::record($creator, $stored);
                Transcoding::queue($stored['path'], $stored['type']); // after the commit
            }
            Moderation::queue(...$post->media()->get()->all());

            return $post;
        });
        if (! $post->isScheduled()) {
            Notify::newPost($post);
            $post->forceFill(['announced_at' => now()])->saveQuietly();
        }

        return back()->with('status', $post->isScheduled() ? 'scheduled' : 'posted'); // posts are written from the studio or the home feed
    }

    /** Change the text, who sees it (incl. pay-per-view price), or when a scheduled post goes out. Media stays. */
    public function update(Request $request, Post $post): RedirectResponse
    {
        $creator = $this->creator($request);
        abort_unless($post->creator_profile_id === $creator->id, 403);

        $data = $request->validate([
            'body' => [$post->media()->exists() && ! $post->poll_options ? 'nullable' : 'required', 'string', 'max:5000'],
            'visibility' => ['required', Rule::in([Post::PUBLIC, Post::SUBSCRIBERS])],
            'price' => [Rule::prohibitedIf((bool) $post->poll_options), 'nullable', 'integer', 'min:'.config('creators.min_ppv'), 'max:'.config('creators.max_ppv')],
            'publish_at' => ['nullable', 'date', 'after:now', 'before:+1 year'],
        ]);

        $post->update([
            'body' => trim((string) ($data['body'] ?? '')) ?: null,
            'visibility' => $data['visibility'],
            'price' => $data['price'] ?? null,
            // Only a post that hasn't gone out yet can be (re)scheduled; clearing the time publishes it now.
            ...($post->announced_at ? [] : ['publish_at' => $data['publish_at'] ?? null]),
        ]);
        if (! $post->announced_at && ! $post->isScheduled()) {
            Notify::newPost($post);
            $post->forceFill(['announced_at' => now()])->saveQuietly();
        }

        return back()->with('status', 'updated');
    }

    /** Pin a post to the top of the creator page (or unpin it). One pinned post at a time. */
    public function pin(Request $request, Post $post): RedirectResponse
    {
        $creator = $this->creator($request);
        abort_unless($post->creator_profile_id === $creator->id, 403);
        $creator->forceFill(['pinned_post_id' => $creator->pinned_post_id === $post->id ? null : $post->id])->save();

        return back();
    }

    public function destroy(Request $request, Post $post): RedirectResponse
    {
        abort_unless($post->creator_profile_id === $this->creator($request)->id, 403);

        // The files stay in the media library; Library::deleteUnused only removes ones nothing uses any more.
        $paths = $post->media->pluck('path')->all();
        $post->delete();
        Library::deleteUnused($paths);

        return to_route('studio');
    }
}
