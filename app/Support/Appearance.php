<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * Light, dark, or follow the device ("system"). Saved on the account when signed in, and in a cookie so the
 * very first HTML already has the right theme (no flash of the wrong colours) for visitors too.
 */
class Appearance
{
    public const MODES = ['light', 'dark', 'system'];

    public const COOKIE = 'appearance';

    public static function for(Request $request): string
    {
        $mode = $request->user()?->appearance ?? $request->cookie(self::COOKIE);

        return in_array($mode, self::MODES, true) ? $mode : 'system';
    }
}
