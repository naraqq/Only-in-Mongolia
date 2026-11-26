<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Admin area: admins only, and (unless switched off) only once they've turned on authenticator codes. */
class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user?->is_admin, 403);

        if (config('security.admin_requires_two_factor') && ! $user->hasTwoFactor()) {
            return redirect()->route('two-factor.show')->with('status', 'admin-needs-2fa');
        }

        return $next($request);
    }
}
