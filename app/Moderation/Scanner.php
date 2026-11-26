<?php

namespace App\Moderation;

/** Something that looks at an uploaded photo or video and says whether a person should check it before anyone sees it. */
interface Scanner
{
    /**
     * @param  bool  $adult  the post is marked 18+ (so a face that looks under 18 is serious)
     * @return array{verdict: 'ok'|'flag'|'error', reason: ?string, labels: array<string, mixed>}
     */
    public function scan(string $path, string $mime, bool $adult): array;
}
