<?php

use App\Http\Controllers\SettingsController;
use Illuminate\Support\Facades\Route;

// One settings page: account, language, appearance, delete account.
Route::middleware('auth')->group(function () {
    Route::get('settings', [SettingsController::class, 'index'])->name('settings');
    Route::delete('settings/account', [SettingsController::class, 'destroy'])->name('settings.destroy');
});
