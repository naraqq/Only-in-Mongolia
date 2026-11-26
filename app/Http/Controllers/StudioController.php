<?php

namespace App\Http\Controllers;

use App\Media\Library;
use App\Moderation\Moderation;
use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
use App\Support\Notify;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
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

        return Inertia::render('studio/index', [
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
                ->map(fn (Post $p) => [...CreatorPageController::present($p, $request->user()), 'pinned' => $p->id === $creator->pinned_post_id]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $creator = $this->creator($request);

        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:5000', 'required_without_all:media,vault'],
            'visibility' => ['required', Rule::in([Post::PUBLIC, Post::SUBSCRIBERS])],
            'is_adult' => ['boolean'],
            'price' => ['nullable', 'integer', 'min:'.config('creators.min_ppv'), 'max:'.config('creators.max_ppv')],
            'publish_at' => ['nullable', 'date', 'after:now', 'before:+1 year'],
            'media' => ['nullable', 'array', 'max:10'],
            // Photos up to 20 MB, videos up to 40 MB (raise upload_max_filesize/post_max_size in production).
            'media.*' => ['file', 'mimetypes:image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm', 'max:40960'],
            // Photos and videos picked from the media library.
            'vault' => ['nullable', 'array', 'max:'.Library::MAX_PER_ITEM],
            'vault.*' => ['integer'],
        ], [
            'body.required_without_all' => __('Write something or add a photo or video.'),
        ]);
        if (count($request->file('media', [])) + count($data['vault'] ?? []) > Library::MAX_PER_ITEM) {
            return back()->withErrors(['media' => __('A post can have at most 10 photos and videos.')]);
        }
        $picked = Library::pick($creator, $data['vault'] ?? []);

        foreach ($request->file('media', []) as $i => $file) {
            if (str_starts_with($file->getMimeType(), 'image/') && $file->getSize() > 20 * 1024 * 1024) {
                return back()->withErrors(["media.$i" => __('Photos can be at most 20 MB.')]);
            }
        }

        // 18+ posts only from creators who said their page has 18+ content.
        $adult = (bool) ($data['is_adult'] ?? false);
        if ($adult && ! $creator->adult_content) {
            return back()->withErrors(['is_adult' => __('Turn on 18+ content for your page first.')]);
        }

        $hashes = Moderation::screen($request->file('media', []));

        $post = DB::transaction(function () use ($creator, $data, $adult, $request, $hashes, $picked) {
            $post = $creator->posts()->create([
                'body' => trim((string) ($data['body'] ?? '')) ?: null,
                'visibility' => $data['visibility'],
                'is_adult' => $adult,
                'price' => $data['price'] ?? null,
                'publish_at' => $data['publish_at'] ?? null,
            ]);
            // Library picks first, in the order chosen, then new uploads (which join the library).
            $position = 0;
            foreach ($picked as $file) {
                $post->media()->create([...$file, 'scan_status' => $file['scan_status'] ?? 'pending', 'position' => $position++]);
            }
            foreach ($request->file('media', []) as $i => $file) {
                $stored = [
                    'type' => str_starts_with($file->getMimeType(), 'video/') ? 'video' : 'image',
                    'path' => $file->store("posts/{$creator->id}"), // private disk
                    'mime' => $file->getMimeType(),
                    'sha256' => $hashes[$i],
                ];
                $post->media()->create([...$stored, 'position' => $position++]);
                Library::record($creator, $stored);
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
            'body' => [$post->media()->exists() ? 'nullable' : 'required', 'string', 'max:5000'],
            'visibility' => ['required', Rule::in([Post::PUBLIC, Post::SUBSCRIBERS])],
            'price' => ['nullable', 'integer', 'min:'.config('creators.min_ppv'), 'max:'.config('creators.max_ppv')],
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
