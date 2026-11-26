<?php

use App\Support\SentryEventFilter;

return [
    'dsn' => env('APP_ENV') === 'production' ? env('SENTRY_LARAVEL_DSN') : null,
    'release' => env('SENTRY_RELEASE'),
    'send_default_pii' => false,
    'traces_sample_rate' => null,
    'profiles_sample_rate' => null,
    'enable_logs' => false,
    'enable_metrics' => false,
    'max_breadcrumbs' => 0,
    'context_lines' => 0,
    'before_send' => [SentryEventFilter::class, 'filter'],
];
