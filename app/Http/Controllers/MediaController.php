<?php

namespace App\Http\Controllers;

use App\Models\PostMedia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Every photo and video goes through here: the file is only sent if the viewer may see its post.
 * Files are never in a public folder, so a link can't be guessed or shared around the check.
 */
class MediaController extends Controller
{
    public function show(Request $request, PostMedia $media): BinaryFileResponse
    {
        $post = $media->post()->with('creator')->firstOrFail();
        abort_unless($post->creator->isApproved() && $post->isVisibleTo($request->user()), 403);
        abort_unless(Storage::exists($media->path), 404);

        // BinaryFileResponse supports range requests, so videos can be scrubbed.
        return response()->file(Storage::path($media->path), [
            'Content-Type' => $media->mime,
            'Cache-Control' => 'private, max-age=3600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
