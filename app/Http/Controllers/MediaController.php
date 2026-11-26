<?php

namespace App\Http\Controllers;

use App\Media\Stamp;
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
    public function show(Request $request, PostMedia $media, Stamp $stamp): BinaryFileResponse
    {
        $post = $media->post()->with('creator')->firstOrFail();
        abort_unless($post->creator->isApproved() && $post->isVisibleTo($request->user()), 403);
        abort_if($media->scan_status === 'flagged' && ! $request->user()?->is_admin, 404); // waiting for review
        abort_unless(Storage::exists($media->path), 404);

        // Paid and subscriber photos carry the viewer's ID (videos get it as an overlay in the player).
        if ($media->type === 'image' && ($text = Stamp::forPost($post, $request->user()))) {
            return response()->file($stamp->image($media->path, $text), ['Content-Type' => 'image/jpeg', ...[
                'Cache-Control' => 'private, max-age=3600',
                'X-Content-Type-Options' => 'nosniff',
            ]]);
        }

        // BinaryFileResponse supports range requests, so videos can be scrubbed.
        return response()->file(Storage::path($media->path), [
            'Content-Type' => $media->mime,
            'Cache-Control' => 'private, max-age=3600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
