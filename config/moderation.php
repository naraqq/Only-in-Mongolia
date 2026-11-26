<?php

return [
    // Which automatic scanner checks uploads: "none" (only the blocklist) or "sightengine".
    'driver' => env('MODERATION_DRIVER', 'none'),

    'sightengine' => [
        'user' => env('SIGHTENGINE_USER'),
        'secret' => env('SIGHTENGINE_SECRET'),
        // A face this likely to be under 18, in sexual or 18+ content, holds the post for review.
        'minor_threshold' => (float) env('SIGHTENGINE_MINOR_THRESHOLD', 0.85),
        'gore_threshold' => (float) env('SIGHTENGINE_GORE_THRESHOLD', 0.9),
    ],
];
