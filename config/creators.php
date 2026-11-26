<?php

return [
    // Everyone on the site must be at least this old.
    'min_age' => 18,

    // Monthly subscription price limits (₮).
    'min_price' => (int) env('CREATOR_MIN_PRICE', 5_000),
    'max_price' => (int) env('CREATOR_MAX_PRICE', 500_000),

    // A subscription buys this many days of access; fans renew by paying again (QPay has no recurring billing).
    'subscription_days' => 30,

    // Bundles: creators may sell several months at once at a discount (percent, up to the max).
    'bundle_months' => [3, 6, 12],
    'max_bundle_discount' => 50,

    // Tip limits (₮).
    'min_tip' => (int) env('MIN_TIP', 1_000),
    'max_tip' => (int) env('MAX_TIP', 1_000_000),

    // Fan wallets: one top-up, and the most a wallet may hold.
    'min_topup' => (int) env('MIN_TOPUP', 1_000),
    'max_topup' => (int) env('MAX_TOPUP', 1_000_000),
    'max_wallet' => (int) env('MAX_WALLET', 3_000_000),

    // Pay-per-view price limits for posts and messages (₮).
    'min_ppv' => (int) env('MIN_PPV', 1_000),
    'max_ppv' => (int) env('MAX_PPV', 1_000_000),

    // Payouts: earnings wait this many days before they can be withdrawn, and the smallest payout (₮).
    'payout_hold_days' => (int) env('PAYOUT_HOLD_DAYS', 7),
    'min_payout' => (int) env('MIN_PAYOUT', 20_000),

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
