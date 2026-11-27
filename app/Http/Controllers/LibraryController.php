<?php

namespace App\Http\Controllers;

use App\Media\Files;
use App\Media\Library;
use App\Media\Paths;
use App\Media\Transcoding;
use App\Media\Uploads;
use App\Models\CreatorProfile;
use App\Models\VaultItem;
use App\Moderation\Moderation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Studio: the creator's media library. Upload once, reuse in posts, paid messages and mass messages. */
class LibraryController extends Controller
{
    private function creator(Request $request): CreatorProfile
    {
        return $request->user()->creatorProfile()->where('status', CreatorProfile::APPROVED)->firstOrFail();
    }

    public function index(Request $request): Response
    {
        $creator = $this->creator($request);
        $type = in_array($request->query('type'), ['image', 'video', 'audio'], true) ? $request->query('type') : null;
        $sort = in_array($request->query('sort'), ['used', 'earned'], true) ? $request->query('sort') : 'new';
        $unused = $request->boolean('unused');
        $items = collect($this->items($creator, $type, 300))
            ->when($unused, fn ($c) => $c->where('uses', 0))
            ->when($sort === 'used', fn ($c) => $c->sortByDesc('uses'))
            ->when($sort === 'earned', fn ($c) => $c->sortByDesc('earned'))
            ->values();

        return Inertia::render('studio/library', [
            'items' => $items,
            'type' => $type,
            'sort' => $sort,
            'unused' => $unused,
            'unusedCount' => collect($this->items($creator, null, 300))->where('uses', 0)->count(),
            'counts' => [
                'image' => $creator->vaultItems()->where('type', 'image')->count(),
                'video' => $creator->vaultItems()->where('type', 'video')->count(),
                'audio' => $creator->vaultItems()->where('type', 'audio')->count(),
            ],
        ]);
    }

    /** For the "From library" picker in the composers. */
    public function list(Request $request): JsonResponse
    {
        return response()->json(['items' => $this->items($this->creator($request), null, 120)]);
    }

    public function store(Request $request): RedirectResponse
    {
        $creator = $this->creator($request);
        $request->validate([
            'media' => ['required', 'array', 'max:20'],
            'media.*' => Uploads::rule(),
        ]);
        Uploads::checkSizes($request->file('media'));
        $hashes = Moderation::screen($request->file('media'));

        foreach ($request->file('media') as $i => $file) {
            $stored = [
                ...Uploads::describe($file),
                'path' => Files::storeFor($file, $creator->user_id, Paths::LIBRARY), // the media disk (private)
                'sha256' => $hashes[$i],
            ];
            Library::record($creator, $stored);
            Transcoding::queue($stored['path'], $stored['type']);
        }

        return back()->with('status', 'library-added');
    }

    /** Where one file is used: its posts (with how they did) and how many messages carry it. */
    public function usage(Request $request, VaultItem $item): JsonResponse
    {
        $creator = $this->creator($request);
        abort_unless($item->creator_profile_id === $creator->id, 404);

        return response()->json(Library::usage($creator, $item->path));
    }

    /** Several files out of the library at once. */
    public function destroyMany(Request $request): RedirectResponse
    {
        $creator = $this->creator($request);
        $ids = $request->validate(['ids' => ['required', 'array', 'max:300'], 'ids.*' => ['integer']])['ids'];
        $items = $creator->vaultItems()->whereIn('id', $ids)->get();
        $creator->vaultItems()->whereIn('id', $items->pluck('id'))->delete();
        Library::deleteUnused($items->pluck('path')->all());

        return back()->with('status', 'library-removed:'.$items->count());
    }

    /** Out of the library. Posts and messages that use the file keep it. */
    public function destroy(Request $request, VaultItem $item): RedirectResponse
    {
        abort_unless($item->creator_profile_id === $this->creator($request)->id, 404);
        $item->delete();
        Library::deleteUnused([$item->path]);

        return back();
    }

    /** The file itself, for the creator only (thumbnails in the library and the picker). */
    public function file(Request $request, VaultItem $item): BinaryFileResponse|RedirectResponse
    {
        abort_unless($item->creator_profile_id === $this->creator($request)->id, 404);
        abort_unless(Files::exists($item->path), 404);

        return Files::response($item->path, $item->mime, ['Cache-Control' => 'private, max-age=86400']);
    }

    private function items(CreatorProfile $creator, ?string $type, int $limit): array
    {
        $items = $creator->vaultItems()->when($type, fn ($q) => $q->where('type', $type))->latest('id')->take($limit)->get();
        $uses = Library::uses($items->pluck('path')->all());
        $stats = Library::stats($creator, $items->pluck('path')->all());

        return $items->map(fn (VaultItem $v) => [
            'id' => $v->id,
            'type' => $v->type,
            'url' => route('studio.library.file', $v),
            'uses' => $uses[$v->path] ?? 0,
            'views' => $stats[$v->path]['views'] ?? 0,
            'earned' => $stats[$v->path]['earned'] ?? 0,
            'created_at' => $v->created_at->toIso8601String(),
        ])->all();
    }
}
