<?php

namespace App\Http\Controllers;

use App\Media\ChunkedUploads;
use App\Media\Previews;
use App\Models\MediaUpload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;

/** Photos, videos and audio sent in pieces before a post is published. See App\Media\ChunkedUploads. */
class UploadController extends Controller
{
    public function start(Request $request): JsonResponse
    {
        abort_unless($request->user()->creatorProfile()->first()?->isApproved(), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'size' => ['required', 'integer', 'min:1'],
            'mime' => ['nullable', 'string', 'max:100'],
        ]);
        $upload = ChunkedUploads::start($request->user(), $data['name'], (int) $data['size'], $data['mime'] ?? null);

        return response()->json($this->state($upload), 201);
    }

    /** What has arrived so far, so a paused or interrupted upload sends only the rest. */
    public function show(Request $request, MediaUpload $upload): JsonResponse
    {
        $this->own($request, $upload);

        return response()->json($this->state($upload));
    }

    /** One piece, as the raw request body (no form encoding). */
    public function chunk(Request $request, MediaUpload $upload, int $index): Response
    {
        $this->own($request, $upload);
        ChunkedUploads::putChunk($upload, $index, $request->getContent(true));

        return response()->noContent();
    }

    public function complete(Request $request, MediaUpload $upload): JsonResponse
    {
        $this->own($request, $upload);
        if ($missing = ChunkedUploads::missing($upload)) {
            return response()->json(['message' => 'Some pieces are missing.', 'missing' => $missing], 409);
        }
        // One join at a time per upload (a retried request waits for the first, then gets its result).
        $upload = Cache::lock('upload:'.$upload->getKey(), 900)->block(120, fn () => ChunkedUploads::complete($upload->fresh()));

        return response()->json(['id' => $upload->getKey(), 'type' => $upload->type, 'mime' => $upload->mime]);
    }

    /**
     * A finished video's still frame and seek-bar frames, made by the browser (App\Media\Previews). Can arrive after
     * the post went out: the frames belong to the stored file, not to the upload.
     */
    public function preview(Request $request, MediaUpload $upload): Response
    {
        $this->own($request, $upload);
        abort_unless($upload->completed_at && $upload->type === 'video' && $upload->path, 409);
        $data = $request->validate([
            'poster' => ['required', 'file', 'mimetypes:image/jpeg,image/webp,image/png', 'max:2048'],
            'thumbs' => ['nullable', 'file', 'mimetypes:image/jpeg,image/webp,image/png', 'max:4096', 'required_with:cols'],
            'cols' => ['nullable', 'required_with:thumbs', 'integer', 'min:1', 'max:20'],
            'count' => ['nullable', 'required_with:thumbs', 'integer', 'min:1', 'max:400'],
            'interval' => ['nullable', 'required_with:thumbs', 'numeric', 'min:0.1', 'max:3600'],
            'w' => ['nullable', 'required_with:thumbs', 'integer', 'min:16', 'max:400'],
            'h' => ['nullable', 'required_with:thumbs', 'integer', 'min:16', 'max:400'],
            'width' => ['nullable', 'integer', 'min:1', 'max:16384'],
            'height' => ['nullable', 'integer', 'min:1', 'max:16384'],
            'duration' => ['nullable', 'numeric', 'min:0', 'max:86400'],
        ]);
        $grid = $request->hasFile('thumbs') ? [
            'cols' => (int) $data['cols'], 'count' => (int) $data['count'], 'interval' => (float) $data['interval'],
            'w' => (int) $data['w'], 'h' => (int) $data['h'],
        ] : null;

        Previews::save($upload->path, $request->file('poster'), $request->file('thumbs'), $grid, [
            'width' => $data['width'] ?? null, 'height' => $data['height'] ?? null, 'duration' => isset($data['duration']) ? (float) $data['duration'] : null,
        ]);

        return response()->noContent();
    }

    public function destroy(Request $request, MediaUpload $upload): Response
    {
        $this->own($request, $upload);
        ChunkedUploads::discard($upload);

        return response()->noContent();
    }

    private function own(Request $request, MediaUpload $upload): void
    {
        abort_unless($upload->user_id === $request->user()->id, 404);
    }

    private function state(MediaUpload $upload): array
    {
        return [
            'id' => $upload->getKey(),
            'chunk_size' => $upload->chunk_size,
            'chunks' => $upload->chunks,
            'received' => ChunkedUploads::received($upload),
            'completed' => (bool) $upload->completed_at,
        ];
    }
}
