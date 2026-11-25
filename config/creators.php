<?php

return [
    // Everyone on the site must be at least this old.
    'min_age' => 18,

    // Monthly subscription price limits (₮).
    'min_price' => (int) env('CREATOR_MIN_PRICE', 5_000),
    'max_price' => (int) env('CREATOR_MAX_PRICE', 500_000),

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
