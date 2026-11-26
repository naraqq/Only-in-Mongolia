<?php

namespace App\Http\Controllers;

use App\Media\Library;
use App\Models\CreatorProfile;
use App\Models\VaultItem;
use App\Moderation\Moderation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
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
        $type = in_array($request->query('type'), ['image', 'video'], true) ? $request->query('type') : null;

        return Inertia::render('studio/library', [
            'items' => $this->items($creator, $type, 200),
            'type' => $type,
            'counts' => [
                'image' => $creator->vaultItems()->where('type', 'image')->count(),
                'video' => $creator->vaultItems()->where('type', 'video')->count(),
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
            'media.*' => ['file', 'mimetypes:image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm', 'max:40960'],
        ]);
        foreach ($request->file('media') as $i => $file) {
            if (str_starts_with($file->getMimeType(), 'image/') && $file->getSize() > 20 * 1024 * 1024) {
                return back()->withErrors(["media.$i" => __('Photos can be at most 20 MB.')]);
            }
        }
        $hashes = Moderation::screen($request->file('media'));

        foreach ($request->file('media') as $i => $file) {
            Library::record($creator, [
                'type' => str_starts_with($file->getMimeType(), 'video/') ? 'video' : 'image',
                'path' => $file->store("library/{$creator->id}"), // private disk
                'mime' => $file->getMimeType(),
                'sha256' => $hashes[$i],
            ]);
        }

        return back()->with('status', 'library-added');
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
    public function file(Request $request, VaultItem $item): BinaryFileResponse
    {
        abort_unless($item->creator_profile_id === $this->creator($request)->id, 404);
        abort_unless(Storage::exists($item->path), 404);

        return response()->file(Storage::path($item->path), [
            'Content-Type' => $item->mime,
            'Cache-Control' => 'private, max-age=86400',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function items(CreatorProfile $creator, ?string $type, int $limit): array
    {
        $items = $creator->vaultItems()->when($type, fn ($q) => $q->where('type', $type))->latest('id')->take($limit)->get();
        $uses = Library::uses($items->pluck('path')->all());

        return $items->map(fn (VaultItem $v) => [
            'id' => $v->id,
            'type' => $v->type,
            'url' => route('studio.library.file', $v),
            'uses' => $uses[$v->path] ?? 0,
            'created_at' => $v->created_at->toIso8601String(),
        ])->all();
    }
}
