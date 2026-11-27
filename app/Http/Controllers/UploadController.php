<?php

namespace App\Http\Controllers;

use App\Media\ChunkedUploads;
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
