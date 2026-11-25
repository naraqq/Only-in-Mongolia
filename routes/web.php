<?php

use App\Http\Controllers\Admin\CreatorReviewController;
use App\Http\Controllers\CreatorApplicationController;
use App\Http\Controllers\CreatorPageController;
use App\Http\Controllers\FanController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\StudioController;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\SetLocale;
use Illuminate\Support\Facades\Route;

// Language switch (МН / EN), remembered in the session.
Route::post('locale/{locale}', function (string $locale) {
    session(['locale' => $locale]);

    return back();
})->whereIn('locale', SetLocale::SUPPORTED)->name('locale');


Route::get('/', [FanController::class, 'home'])->name('home');
Route::get('creators', [FanController::class, 'discover'])->name('creators');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', [FanController::class, 'dashboard'])->name('dashboard');
    Route::get('feed', [FanController::class, 'feed'])->name('feed');
    Route::post('@{handle}/follow', [FanController::class, 'follow'])->middleware('throttle:60,1')->name('creator.follow');
    Route::delete('@{handle}/follow', [FanController::class, 'unfollow'])->middleware('throttle:60,1')->name('creator.unfollow');

    // Subscriptions: subscribe -> QPay checkout -> paid (status is polled; QPay also calls back).
    Route::post('@{handle}/subscribe', [PaymentController::class, 'subscribe'])->middleware('throttle:10,1')->name('creator.subscribe');
    Route::get('payments/{payment}', [PaymentController::class, 'show'])->name('payments.show');
    Route::get('payments/{payment}/status', [PaymentController::class, 'status'])->middleware('throttle:60,1')->name('payments.status');
    Route::post('payments/{payment}/fake-pay', [PaymentController::class, 'fakePay'])->name('payments.fake-pay');

    // Become a creator: apply, then wait for admin review.
    Route::get('creator/apply', [CreatorApplicationController::class, 'show'])->name('creator.apply');
    Route::post('creator/apply', [CreatorApplicationController::class, 'store'])->middleware('throttle:5,60')->name('creator.apply.store');

    // Studio: approved creators write and manage posts.
    Route::get('studio', [StudioController::class, 'index'])->name('studio');
    Route::post('studio/posts', [StudioController::class, 'store'])->middleware('throttle:30,60')->name('studio.posts.store');
    Route::delete('studio/posts/{post}', [StudioController::class, 'destroy'])->name('studio.posts.destroy');
});

// QPay's server-to-server notification. It only makes us ask QPay for the status, so it can be public.
Route::match(['get', 'post'], 'payments/{payment}/callback', [PaymentController::class, 'callback'])->middleware('throttle:60,1')->name('payments.callback');

// Photos and videos, only after a permission check (see MediaController).
Route::get('media/{media}', [MediaController::class, 'show'])->name('media.show');

Route::middleware(['auth', EnsureAdmin::class])->prefix('admin')->name('admin.')->group(function () {
    Route::get('creators', [CreatorReviewController::class, 'index'])->name('creators');
    Route::get('creators/{creator}/document/{kind}', [CreatorReviewController::class, 'document'])->whereIn('kind', ['front', 'back', 'selfie'])->name('creators.document');
    Route::post('creators/{creator}/decide', [CreatorReviewController::class, 'decide'])->name('creators.decide');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';

// Creator pages: /@handle. Last, so it never shadows another route.
Route::get('@{handle}', [CreatorPageController::class, 'show'])->where('handle', '[A-Za-z0-9_.]{3,30}')->name('creator.show');
