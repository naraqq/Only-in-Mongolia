<?php

return [
    // Everyone on the site must be at least this old.
    'min_age' => 18,

    // Monthly subscription price limits (₮).
    'min_price' => (int) env('CREATOR_MIN_PRICE', 5_000),
    'max_price' => (int) env('CREATOR_MAX_PRICE', 500_000),

    // A subscription buys this many days of access; fans renew by paying again (QPay has no recurring billing).
    'subscription_days' => 30,

    // Tip limits (₮).
    'min_tip' => (int) env('MIN_TIP', 1_000),
    'max_tip' => (int) env('MAX_TIP', 1_000_000),

    // The platform's share of each payment, in percent. Creators see their earnings after this.
    'platform_fee_percent' => (int) env('PLATFORM_FEE_PERCENT', 20),

    // Banks creators can be paid out to.
    'banks' => [
        'Хаан банк',
        'Голомт банк',
        'Худалдаа хөгжлийн банк',
        'Хас банк',
        'Төрийн банк',
        'Капитрон банк',
        'Богд банк',
        'Ариг банк',
        'Транс банк',
        'Үндэсний хөрөнгө оруулалтын банк',
        'М банк',
        'Чингис хаан банк',
    ],

    // Handles that can't be taken (routes and obvious impersonation).
    'reserved_handles' => ['admin', 'login', 'logout', 'register', 'settings', 'dashboard', 'creator', 'creators', 'api', 'support', 'help', 'onlyin', 'official'],
];
