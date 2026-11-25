<?php

use App\Http\Controllers\Admin\CreatorReviewController;
use App\Http\Controllers\CreatorApplicationController;
use App\Http\Controllers\CreatorPageController;
use App\Http\Controllers\FanController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\MessageController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\ProfileEditController;
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
    Route::post('@{handle}/tip', [PaymentController::class, 'tip'])->middleware('throttle:10,1')->name('creator.tip');
    Route::post('posts/{post}/buy', [PaymentController::class, 'buyPost'])->middleware('throttle:10,1')->name('posts.buy');
    Route::post('message/{message}/buy', [PaymentController::class, 'buyMessage'])->middleware('throttle:10,1')->name('messages.buy');
    Route::get('payments/{payment}', [PaymentController::class, 'show'])->name('payments.show');
    Route::get('payments/{payment}/status', [PaymentController::class, 'status'])->middleware('throttle:60,1')->name('payments.status');
    Route::post('payments/{payment}/fake-pay', [PaymentController::class, 'fakePay'])->name('payments.fake-pay');

    // Notifications (the bell). Opening the page marks them read.
    Route::get('notifications', [NotificationController::class, 'index'])->name('notifications');

    // Direct messages (the page polls for new ones).
    Route::get('messages', [MessageController::class, 'index'])->name('messages.index');
    Route::get('messages/{conversation}', [MessageController::class, 'index'])->name('messages.show');
    Route::post('messages/{conversation}', [MessageController::class, 'send'])->middleware('throttle:60,1')->name('messages.send');
    Route::get('message-media/{media}', [MessageController::class, 'media'])->name('messages.media');
    Route::post('@{handle}/message', [MessageController::class, 'start'])->middleware('throttle:30,1')->name('creator.message');
    Route::post('studio/mass-message', [MessageController::class, 'mass'])->middleware('throttle:5,60')->name('studio.mass');

    // Edit profile: name, photo, and for creators the cover, bio, price and who may message them.
    Route::get('profile', [ProfileEditController::class, 'edit'])->name('me.edit');
    Route::patch('profile', [ProfileEditController::class, 'update'])->name('me.update');
    Route::post('profile/photo/{kind}', [ProfileEditController::class, 'photo'])->whereIn('kind', ['avatar', 'cover'])->middleware('throttle:20,60')->name('me.photo');
    Route::delete('profile/photo/{kind}', [ProfileEditController::class, 'removePhoto'])->whereIn('kind', ['avatar', 'cover'])->name('me.photo.destroy');

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
