<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Payment;
use App\Models\Post;
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
            'posts' => $creator->posts()->with('media')->take(100)->get()
                ->map(fn (Post $p) => CreatorPageController::present($p, $request->user())),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $creator = $this->creator($request);

        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:5000', 'required_without:media'],
            'visibility' => ['required', Rule::in([Post::PUBLIC, Post::SUBSCRIBERS])],
            'is_adult' => ['boolean'],
            'media' => ['nullable', 'array', 'max:10'],
            // Photos up to 20 MB, videos up to 40 MB (raise upload_max_filesize/post_max_size in production).
            'media.*' => ['file', 'mimetypes:image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm', 'max:40960'],
        ], [
            'body.required_without' => __('Write something or add a photo or video.'),
        ]);

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

        DB::transaction(function () use ($creator, $data, $adult, $request) {
            $post = $creator->posts()->create([
                'body' => trim((string) ($data['body'] ?? '')) ?: null,
                'visibility' => $data['visibility'],
                'is_adult' => $adult,
            ]);
            foreach ($request->file('media', []) as $i => $file) {
                $post->media()->create([
                    'type' => str_starts_with($file->getMimeType(), 'video/') ? 'video' : 'image',
                    'path' => $file->store("posts/{$creator->id}"), // private disk
                    'mime' => $file->getMimeType(),
                    'position' => $i,
                ]);
            }
        });

        return back()->with('status', 'posted'); // posts are written from the studio or the home feed
    }

    public function destroy(Request $request, Post $post): RedirectResponse
    {
        abort_unless($post->creator_profile_id === $this->creator($request)->id, 403);

        Storage::delete($post->media->pluck('path')->all());
        $post->delete();

        return to_route('studio');
    }
}
