<?php

use App\Http\Controllers\ExerciseController;
use App\Http\Controllers\HealthController;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', fn (Request $request) => new UserResource($request->user()));

    Route::get('/exercises', [ExerciseController::class, 'index']);
    Route::post('/exercises', [ExerciseController::class, 'store']);
    Route::middleware('can:manage,exercise')->group(function () {
        Route::get('/exercises/{exercise}', [ExerciseController::class, 'show']);
        Route::put('/exercises/{exercise}', [ExerciseController::class, 'update']);
        Route::delete('/exercises/{exercise}', [ExerciseController::class, 'destroy']);
        Route::post('/exercises/{exercise}/archive', [ExerciseController::class, 'archive']);
        Route::post('/exercises/{exercise}/restore', [ExerciseController::class, 'restore']);
    });
});
