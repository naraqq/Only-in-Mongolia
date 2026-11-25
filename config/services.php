<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'verify_mn' => [
        'key' => env('VERIFY_MN_API_KEY'),
        'base_url' => env('VERIFY_MN_BASE_URL', 'https://api.verify.mn'),
        // Only enable on a public https APP_URL — verify.mn retries failed callbacks.
        'use_callback' => (bool) env('VERIFY_MN_USE_CALLBACK', false),
        // DEV ONLY: 8-digit numbers that skip SMS. Forced empty in production, so a live site can never bypass.
        'dev_phones' => env('APP_ENV') === 'production' ? [] : array_filter(array_map('trim', explode(',', (string) env('VERIFY_MN_DEV_PHONES', '')))),
    ],

    // QPay merchant API (https://developer.qpay.mn). Without a username, non-production sites use a fake gateway
    // with a "pay (dev)" button so the whole subscription flow can be tried locally.
    'qpay' => [
        'username' => env('QPAY_USERNAME'),
        'password' => env('QPAY_PASSWORD'),
        'invoice_code' => env('QPAY_INVOICE_CODE'),
        'base_url' => env('QPAY_BASE_URL', 'https://merchant.qpay.mn/v2'),
    ],

];
