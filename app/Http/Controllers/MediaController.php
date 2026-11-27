<?php

namespace App\Http\Controllers;

use App\Media\Files;
use App\Media\Previews;
use App\Media\Stamp;
use App\Models\Post;
use App\Models\PostMedia;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Every photo and video goes through here: the file is only sent if the viewer may see its post.
 * Files are never in a public folder, so a link can't be guessed or shared around the check.
 */
class MediaController extends Controller
{
    public function show(Request $request, PostMedia $media, Stamp $stamp): BinaryFileResponse|RedirectResponse
    {
        $post = $this->allowed($request, $media);
        abort_unless(Files::exists($media->path), 404);

        // Paid and subscriber photos carry the viewer's ID (videos get it as an overlay in the player).
        if ($media->type === 'image' && ($text = Stamp::forPost($post, $request->user()))) {
            return response()->file($stamp->image($media->path, $text), ['Content-Type' => 'image/jpeg', ...[
                'Cache-Control' => 'private, max-age=3600',
                'X-Content-Type-Options' => 'nosniff',
            ]]);
        }

        // From this server, or a short-lived signed R2 link. Videos can be scrubbed either way (range requests).
        return Files::response($media->path, $media->mime, ['Cache-Control' => 'private, max-age=3600']);
    }

    /** A video's still frame or seek-bar frames (App\Media\Previews): shown to exactly whoever may watch the video. */
    public function preview(Request $request, PostMedia $media, string $which): BinaryFileResponse|RedirectResponse
    {
        abort_unless($media->type === 'video', 404);
        $this->allowed($request, $media);
        $path = Previews::file($media->path, $which);
        abort_unless($path && Files::exists($path), 404);

        return Files::response($path, 'image/jpeg', ['Cache-Control' => 'private, max-age=86400']);
    }

    /** The post the file is in, when the viewer may see it (403/404 otherwise). */
    private function allowed(Request $request, PostMedia $media): Post
    {
        $post = $media->post()->with('creator')->firstOrFail();
        abort_unless($post->creator->isApproved() && $post->isVisibleTo($request->user()), 403);
        abort_if($media->scan_status === 'flagged' && ! $request->user()?->is_admin, 404); // waiting for review

        return $post;
    }
}
