<?php

namespace App\Http\Controllers;

use App\Models\CreatorProfile;
use App\Models\Post;
use App\Models\SearchHistory;
use App\Support\Blocking;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SearchController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $input = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'tab' => ['nullable', 'in:all,creators,posts'],
            'sort' => ['nullable', 'in:relevance,latest,popular'],
            'media' => ['nullable', 'in:any,image,video'],
            'date' => ['nullable', 'in:any,week,month,year'],
            'page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $filters = [
            'q' => trim((string) ($input['q'] ?? '')),
            'tab' => $input['tab'] ?? 'all',
            'sort' => $input['sort'] ?? 'relevance',
            'media' => $input['media'] ?? 'any',
            'date' => $input['date'] ?? 'any',
        ];
        $page = $filters['tab'] === 'all' ? 1 : (int) ($input['page'] ?? 1);
        $perPage = $filters['tab'] === 'all' ? 4 : 12;
        $viewer = $request->user();
        $creators = $posts = [];
        $moreCreators = $morePosts = false;

        if ($filters['q'] !== '') {
            $phrase = mb_strtolower(ltrim($filters['q'], '@'));
            $terms = preg_split('/\s+/u', $phrase, 6, PREG_SPLIT_NO_EMPTY) ?: [];
            $prefix = $this->literal($phrase).'%';
            $exact = $phrase;
            $eligible = CreatorProfile::listableFor(null)
                ->when($viewer, fn (Builder $builder) => $builder->whereNotIn('user_id', Blocking::idsAround($viewer)));

            if ($terms !== [] && $filters['tab'] !== 'posts') {
                $query = (clone $eligible)->withCount(['posts', 'followers']);
                foreach ($terms as $term) {
                    $pattern = '%'.$this->literal($term).'%';
                    $query->where(fn (Builder $builder) => $this->creatorMatch($builder, $pattern));
                }
                if ($filters['sort'] === 'relevance') {
                    $query->orderByRaw("CASE WHEN LOWER(handle) = ? THEN 0 WHEN LOWER(display_name) = ? THEN 1 WHEN LOWER(handle) LIKE ? ESCAPE '!' OR LOWER(display_name) LIKE ? ESCAPE '!' THEN 2 ELSE 3 END", [$exact, $exact, $prefix, $prefix]);
                } elseif ($filters['sort'] === 'popular') {
                    $query->orderByDesc('followers_count');
                }

                $result = $query->latest('reviewed_at')->latest('id')->simplePaginate($perPage, ['*'], 'page', $page);
                $creators = $result->getCollection()->map->toCard($viewer)->all();
                $moreCreators = $page < 100 && $result->hasMorePages();
            }

            if ($terms !== [] && $filters['tab'] !== 'creators') {
                $query = Post::published()->where('visibility', Post::PUBLIC)->where('is_adult', false)
                    ->where(fn (Builder $builder) => $builder->whereNull('price')->orWhere('price', 0))
                    ->whereIn('creator_profile_id', (clone $eligible)->select('id'))
                    ->with(['media' => fn ($builder) => $builder->where('scan_status', '!=', 'flagged'), 'creator.user:id,avatar_path'])
                    ->withEngagement($viewer);
                foreach ($terms as $term) {
                    $pattern = '%'.$this->literal($term).'%';
                    $query->where(fn (Builder $builder) => $builder->whereRaw("LOWER(body) LIKE ? ESCAPE '!'", [$pattern])
                        ->orWhereHas('creator', fn (Builder $creator) => $this->creatorMatch($creator, $pattern)));
                }

                $days = ['week' => 7, 'month' => 30, 'year' => 365][$filters['date']] ?? null;
                if ($days !== null) {
                    $query->whereRaw('COALESCE(publish_at, created_at) >= ?', [now()->subDays($days)]);
                }
                if ($filters['media'] !== 'any') {
                    $query->whereHas('media', fn (Builder $builder) => $builder->where('type', $filters['media'])->where('scan_status', '!=', 'flagged'));
                }
                if ($filters['sort'] === 'relevance') {
                    $query->orderByRaw("CASE WHEN LOWER(body) LIKE ? ESCAPE '!' THEN 0 ELSE 1 END", ['%'.$this->literal($phrase).'%']);
                } elseif ($filters['sort'] === 'popular') {
                    $query->orderByDesc('likes_count');
                }

                $result = $query->orderByRaw('COALESCE(publish_at, created_at) DESC')->latest('id')->simplePaginate($perPage, ['*'], 'page', $page);
                $posts = $result->getCollection()->map(fn (Post $post) => [
                    ...CreatorPageController::present($post, $viewer),
                    'author' => [
                        'name' => $post->creator->display_name,
                        'handle' => $post->creator->handle,
                        'avatar_url' => $post->creator->avatarUrl(),
                    ],
                ])->all();
                $morePosts = $page < 100 && $result->hasMorePages();
            }
        }

        // Recent searches live on the account: remember this one, or show the latest when the box is empty.
        $recent = [];
        if ($viewer && $filters['q'] !== '' && $page === 1) {
            SearchHistory::record($viewer, $filters['q']);
        } elseif ($viewer && $filters['q'] === '') {
            $recent = $viewer->searchHistories()->orderByDesc('searched_at')->limit(SearchHistory::SHOW)->pluck('query')->all();
        }

        return Inertia::render('search', compact('filters', 'creators', 'posts', 'page', 'moreCreators', 'morePosts', 'recent'));
    }

    /**
     * The search box dropdown (like Facebook's): recent searches when it's empty; while typing, matching creators
     * and matching recent searches. Small and fast; the full results stay on the search page.
     */
    public function suggest(Request $request): JsonResponse
    {
        $q = trim((string) ($request->validate(['q' => ['nullable', 'string', 'max:100']])['q'] ?? ''));
        $viewer = $request->user();
        $recent = $viewer
            ? $viewer->searchHistories()
                ->when($q !== '', fn ($w) => $w->whereRaw("LOWER(query) LIKE ? ESCAPE '!'", ['%'.$this->literal(mb_strtolower($q)).'%']))
                ->orderByDesc('searched_at')->limit($q === '' ? 8 : 3)->pluck('query')
            : collect();

        $creators = collect();
        $phrase = mb_strtolower(ltrim($q, '@'));
        if ($phrase !== '') {
            $query = CreatorProfile::listableFor(null)->with('user:id,avatar_path')
                ->when($viewer, fn (Builder $b) => $b->whereNotIn('user_id', Blocking::idsAround($viewer)));
            foreach (preg_split('/\s+/u', $phrase, 6, PREG_SPLIT_NO_EMPTY) ?: [] as $term) {
                $pattern = '%'.$this->literal($term).'%';
                $query->where(fn (Builder $b) => $b->whereRaw("LOWER(handle) LIKE ? ESCAPE '!'", [$pattern])
                    ->orWhereRaw("LOWER(display_name) LIKE ? ESCAPE '!'", [$pattern]));
            }
            $prefix = $this->literal($phrase).'%';
            $creators = $query
                ->orderByRaw("CASE WHEN LOWER(handle) = ? THEN 0 WHEN LOWER(display_name) = ? THEN 1 WHEN LOWER(handle) LIKE ? ESCAPE '!' OR LOWER(display_name) LIKE ? ESCAPE '!' THEN 2 ELSE 3 END", [$phrase, $phrase, $prefix, $prefix])
                ->withCount('followers')->orderByDesc('followers_count')->limit(6)->get()
                ->map(fn (CreatorProfile $c) => [
                    'handle' => $c->handle,
                    'display_name' => $c->display_name,
                    'avatar_url' => $c->avatarUrl(),
                    'followers' => (int) $c->followers_count,
                ]);
        }

        return response()->json(['recent' => $recent->values(), 'creators' => $creators->values()]);
    }

    private function creatorMatch(Builder $builder, string $pattern): Builder
    {
        return $builder->whereRaw("LOWER(handle) LIKE ? ESCAPE '!'", [$pattern])
            ->orWhereRaw("LOWER(display_name) LIKE ? ESCAPE '!'", [$pattern])
            ->orWhereRaw("LOWER(bio) LIKE ? ESCAPE '!'", [$pattern]);
    }

    private function literal(string $value): string
    {
        return strtr($value, ['!' => '!!', '%' => '!%', '_' => '!_']);
    }
}
