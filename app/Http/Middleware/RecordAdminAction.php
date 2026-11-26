<?php

namespace App\Http\Middleware;

use App\Models\AdminAction;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\Response;

/**
 * The admin audit log: records every admin request that changes something, and every look at a creator's
 * ID documents. Runs on the whole admin area, so new admin actions are logged without extra code.
 */
class RecordAdminAction
{
    /** Read-only routes that are still worth a record (they show private documents). */
    private const SENSITIVE_READS = ['admin.creators.document'];

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $route = $request->route();
        $name = $route?->getName() ?? $request->path();
        if ($request->isMethodSafe() && ! in_array($name, self::SENSITIVE_READS, true)) {
            return $response;
        }

        // The first model in the URL is what the action was about (a user, a payout, a report...).
        $subject = collect($route?->parameters() ?? [])->first(fn ($p) => $p instanceof Model);
        $failed = $response->getStatusCode() >= 400 || ($request->hasSession() && $request->session()->has('errors'));

        AdminAction::create([
            'admin_id' => $request->user()?->id,
            'action' => str_replace('admin.', '', $name),
            'subject_type' => $subject ? class_basename($subject) : null,
            'subject_id' => $subject ? (string) $subject->getKey() : null,
            'data' => $this->details($request) ?: null,
            'ok' => ! $failed,
            'ip' => $request->ip(),
        ]);

        return $response;
    }

    /** What was submitted (reason, decision, note...), without tokens, files or anything secret, kept short. */
    private function details(Request $request): array
    {
        $kind = $request->route('kind');

        return collect($request->except(['_token', '_method', 'password', 'code']))
            ->reject(fn ($v) => $v instanceof UploadedFile || is_array($v))
            ->map(fn ($v) => is_string($v) ? mb_strimwidth($v, 0, 300, '…') : $v)
            ->when($kind, fn ($c) => $c->put('kind', $kind))
            ->all();
    }
}
