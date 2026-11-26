<?php

use App\Http\Controllers\SettingsController;
use App\Http\Controllers\TwoFactorController;
use Illuminate\Support\Facades\Route;

// One settings page: account, language, appearance, delete account. Plus two-step sign-in.
Route::middleware('auth')->group(function () {
    Route::get('settings', [SettingsController::class, 'index'])->name('settings');
    Route::delete('settings/account', [SettingsController::class, 'destroy'])->name('settings.destroy');

    Route::get('settings/two-factor', [TwoFactorController::class, 'show'])->name('two-factor.show');
    Route::post('settings/two-factor', [TwoFactorController::class, 'enable'])->name('two-factor.enable');
    Route::post('settings/two-factor/confirm', [TwoFactorController::class, 'confirm'])->middleware('throttle:10,1')->name('two-factor.confirm');
    Route::delete('settings/two-factor', [TwoFactorController::class, 'disable'])->middleware('throttle:10,1')->name('two-factor.disable');

    // The code check after signing in.
    Route::get('two-factor', [TwoFactorController::class, 'challenge'])->name('two-factor.challenge');
    Route::post('two-factor', [TwoFactorController::class, 'verify'])->middleware('throttle:6,1')->name('two-factor.verify');
});
