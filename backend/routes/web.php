<?php

use App\Http\Controllers\Auth\DemoController;
use App\Http\Controllers\Auth\InvitationPreviewController;
use App\Http\Controllers\Auth\RegisteredUserController;
use App\Http\Controllers\Auth\SessionController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('/login', [SessionController::class, 'store'])->middleware('throttle:6,1');
    Route::post('/logout', [SessionController::class, 'destroy'])->middleware('auth');
    Route::get('/invitations/{token}', InvitationPreviewController::class)->middleware('throttle:30,1');
    Route::post('/register', [RegisteredUserController::class, 'store'])->middleware('throttle:6,1');
    Route::post('/demo', [DemoController::class, 'store'])->middleware('throttle:demo');
});
