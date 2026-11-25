<?php

use App\Http\Controllers\Admin\CreatorReviewController;
use App\Http\Controllers\AgeGateController;
use App\Http\Controllers\CreatorApplicationController;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\SetLocale;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Language switch (МН / EN), remembered in the session.
Route::post('locale/{locale}', function (string $locale) {
    session(['locale' => $locale]);

    return back();
})->whereIn('locale', SetLocale::SUPPORTED)->name('locale');

// 18+ gate (see EnsureAgeConfirmed).
Route::get('age-gate', [AgeGateController::class, 'show'])->name('age-gate');
Route::post('age-gate', [AgeGateController::class, 'confirm'])->name('age-gate.confirm');

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', function () {
        return Inertia::render('dashboard', [
            'creatorStatus' => request()->user()->creatorProfile?->status,
        ]);
    })->name('dashboard');

    // Become a creator: apply, then wait for admin review.
    Route::get('creator/apply', [CreatorApplicationController::class, 'show'])->name('creator.apply');
    Route::post('creator/apply', [CreatorApplicationController::class, 'store'])->middleware('throttle:5,60')->name('creator.apply.store');
});

Route::middleware(['auth', EnsureAdmin::class])->prefix('admin')->name('admin.')->group(function () {
    Route::get('creators', [CreatorReviewController::class, 'index'])->name('creators');
    Route::get('creators/{creator}/document/{kind}', [CreatorReviewController::class, 'document'])->whereIn('kind', ['front', 'back', 'selfie'])->name('creators.document');
    Route::post('creators/{creator}/decide', [CreatorReviewController::class, 'decide'])->name('creators.decide');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
