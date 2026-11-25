<?php

use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Auth\PhoneLoginController;
use Illuminate\Support\Facades\Route;

// Phone (verify.mn) is the only way in: there are no passwords or emails to manage.
Route::middleware('guest')->group(function () {
    Route::get('login', [PhoneLoginController::class, 'create'])->name('login');
    Route::post('login/phone', [PhoneLoginController::class, 'start'])->middleware('throttle:6,1')->name('login.phone.start');
    Route::get('login/phone/status', [PhoneLoginController::class, 'status'])->middleware('throttle:60,1')->name('login.phone.status');
    Route::post('login/phone/complete', [PhoneLoginController::class, 'complete'])->name('login.phone.complete');
    Route::post('login/phone/cancel', [PhoneLoginController::class, 'cancel'])->name('login.phone.cancel');
    Route::get('login/phone/name', [PhoneLoginController::class, 'nameForm'])->name('login.phone.name');
    Route::post('login/phone/name', [PhoneLoginController::class, 'storeName'])->name('login.phone.name.store');
});

Route::post('logout', [AuthenticatedSessionController::class, 'destroy'])->middleware('auth')->name('logout');

// verify.mn → us. Unauthenticated GET wake-up signal; the UUID makes it unguessable.
Route::get('verify-mn/callback/{verification}', [PhoneLoginController::class, 'callback'])
    ->middleware('throttle:30,1')
    ->name('verify-mn.callback');
