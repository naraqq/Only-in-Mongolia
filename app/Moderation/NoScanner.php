<?php

namespace App\Moderation;

/** No automatic scanner configured: everything passes (the blocklist still applies at upload). */
class NoScanner implements Scanner
{
    public function scan(string $path, string $mime, bool $adult): array
    {
        return ['verdict' => 'ok', 'reason' => null, 'labels' => ['scanner' => 'none']];
    }
}
