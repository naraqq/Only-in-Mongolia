<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\CreatorSeries;
use App\Models\Post;
use App\Support\Blocking;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class SeriesController extends Controller
{
    public function index(Request $request): Response
    {
        $creator = $this->creator($request);
        $series = $creator->series()->with(['posts' => fn ($query) => $query->published()->select('posts.id', 'posts.body', 'posts.visibility', 'posts.price')])
            ->orderByDesc('featured')->latest('id')->get();
        $recent = $creator->posts()->published()->take(120)->get(['id', 'body', 'visibility', 'price']);
        $available = $recent->concat($series->flatMap->posts)->unique('id')->values();

        return Inertia::render('studio/series', [
            'series' => $series->map(fn (CreatorSeries $item) => [...$item->only('id', 'title', 'description', 'featured'), 'post_ids' => $item->posts->modelKeys()]),
            'available' => $available->map(fn (Post $post) => [
                ...$post->only('id', 'visibility', 'price'),
                'body' => mb_strimwidth((string) $post->body, 0, 110, '…'),
            ]),
            'handle' => $creator->handle,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        return $this->save($request, $this->creator($request));
    }

    public function update(Request $request, int $series): RedirectResponse
    {
        $creator = $this->creator($request);

        return $this->save($request, $creator, $creator->series()->findOrFail($series));
    }

    public function destroy(Request $request, int $series): RedirectResponse
    {
        $this->creator($request)->series()->findOrFail($series)->delete();

        return to_route('studio.series');
    }

    public function show(Request $request, string $handle, int $series): Response
    {
        $viewer = $request->user();
        $creator = CreatorProfile::listableFor($viewer)->where('handle', mb_strtolower($handle))->firstOrFail();
        abort_if(Blocking::between($viewer, $creator->user), 404);
        $collection = $creator->series()->findOrFail($series);
        $posts = $collection->posts()->published()->when(! $viewer, fn ($query) => $query->where('posts.is_adult', false))
            ->with('media')->withEngagement($viewer)->get();
        abort_if($posts->isEmpty(), 404);

        return Inertia::render('creator/series', [
            'series' => $collection->only('title', 'description', 'featured'),
            'creator' => ['handle' => $creator->handle, 'name' => $creator->display_name, 'avatar_url' => $creator->avatarUrl(), 'price_monthly' => $creator->price_monthly],
            'posts' => $posts->map(fn (Post $post) => CreatorPageController::present($post->setRelation('creator', $creator), $viewer)),
        ]);
    }

    private function save(Request $request, CreatorProfile $creator, ?CreatorSeries $series = null): RedirectResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:500'],
            'featured' => ['required', 'boolean'],
            'post_ids' => ['required', 'array', 'list', 'min:1', 'max:25'],
            'post_ids.*' => ['required', 'integer', 'distinct'],
        ]);

        DB::transaction(function () use ($creator, $series, $data) {
            CreatorProfile::whereKey($creator->id)->lockForUpdate()->firstOrFail();
            if ($creator->posts()->published()->whereIn('posts.id', $data['post_ids'])->count() !== count($data['post_ids'])) {
                throw ValidationException::withMessages(['post_ids' => __('Choose published posts from your own page.')]);
            }
            if (! $series && $creator->series()->count() >= 20) {
                throw ValidationException::withMessages(['title' => __('You can create up to 20 series.')]);
            }
            if ($data['featured']) {
                $creator->series()->where('featured', true)->when($series, fn ($query) => $query->whereKeyNot($series->id))->update(['featured' => false]);
            }
            $attributes = ['title' => $data['title'], 'description' => $data['description'] ?? null, 'featured' => $data['featured']];
            if ($series) {
                $series->update($attributes);
            } else {
                $series = $creator->series()->create($attributes);
            }
            $series->posts()->sync(collect($data['post_ids'])->mapWithKeys(fn ($id, $position) => [$id => ['position' => $position]])->all());
        });

        return to_route('studio.series');
    }

    private function creator(Request $request): CreatorProfile
    {
        $creator = $request->user()->creatorProfile()->first();
        abort_unless($creator?->isApproved(), 403);

        return $creator;
    }
}
