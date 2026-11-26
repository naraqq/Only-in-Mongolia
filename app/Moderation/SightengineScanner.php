<?php

namespace App\Moderation;

use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Sightengine image moderation (https://sightengine.com). Checks photos for faces that look under 18 in sexual
 * or 18+ content, and for gore. Videos aren't sent (that needs their separate video API) and pass as "not scanned".
 */
class SightengineScanner implements Scanner
{
    public function __construct(private readonly array $config) {}

    public function scan(string $path, string $mime, bool $adult): array
    {
        if (! str_starts_with($mime, 'image/')) {
            return ['verdict' => 'ok', 'reason' => null, 'labels' => ['scanner' => 'sightengine', 'skipped' => 'video']];
        }

        try {
            $r = Http::timeout(20)->attach('media', fopen($path, 'r'), basename($path))
                ->post('https://api.sightengine.com/1.0/check.json', [
                    'models' => 'nudity-2.1,face-attributes,gore-2.0',
                    'api_user' => $this->config['user'],
                    'api_secret' => $this->config['secret'],
                ])->throw()->json();
        } catch (Throwable $e) {
            report($e);

            return ['verdict' => 'error', 'reason' => null, 'labels' => ['scanner' => 'sightengine', 'error' => class_basename($e)]];
        }

        $minor = collect($r['faces'] ?? [])->max(fn ($f) => $f['attributes']['minor'] ?? 0) ?? 0;
        $sexual = max($r['nudity']['sexual_activity'] ?? 0, $r['nudity']['sexual_display'] ?? 0, $r['nudity']['erotica'] ?? 0);
        $gore = $r['gore']['prob'] ?? 0;
        $labels = ['scanner' => 'sightengine', 'minor' => round($minor, 3), 'sexual' => round($sexual, 3), 'gore' => round($gore, 3)];

        if ($minor >= $this->config['minor_threshold'] && ($adult || $sexual >= 0.5)) {
            return ['verdict' => 'flag', 'reason' => 'minor', 'labels' => $labels];
        }
        if ($gore >= $this->config['gore_threshold']) {
            return ['verdict' => 'flag', 'reason' => 'illegal', 'labels' => $labels];
        }

        return ['verdict' => 'ok', 'reason' => null, 'labels' => $labels];
    }
}
