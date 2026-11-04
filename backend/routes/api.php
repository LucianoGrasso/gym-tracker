<?php

use App\Http\Controllers\ExerciseController;
use App\Http\Controllers\ExerciseHistoryController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\RoutineController;
use App\Http\Controllers\RoutineDayController;
use App\Http\Controllers\RoutineDayExerciseController;
use App\Http\Controllers\TodayController;
use App\Http\Controllers\WorkoutController;
use App\Http\Controllers\WorkoutExerciseController;
use App\Http\Controllers\WorkoutSetController;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', fn (Request $request) => new UserResource($request->user()));
    Route::get('/today', TodayController::class);

    Route::get('/exercises', [ExerciseController::class, 'index']);
    Route::post('/exercises', [ExerciseController::class, 'store']);
    Route::middleware('can:manage,exercise')->group(function () {
        Route::get('/exercises/{exercise}', [ExerciseController::class, 'show']);
        Route::put('/exercises/{exercise}', [ExerciseController::class, 'update']);
        Route::delete('/exercises/{exercise}', [ExerciseController::class, 'destroy']);
        Route::post('/exercises/{exercise}/archive', [ExerciseController::class, 'archive']);
        Route::post('/exercises/{exercise}/restore', [ExerciseController::class, 'restore']);
        Route::get('/exercises/{exercise}/history', ExerciseHistoryController::class);
    });

    Route::get('/routines', [RoutineController::class, 'index']);
    Route::post('/routines', [RoutineController::class, 'store']);
    Route::middleware('can:manage,routine')->group(function () {
        Route::get('/routines/{routine}', [RoutineController::class, 'show']);
        Route::put('/routines/{routine}', [RoutineController::class, 'update']);
        Route::delete('/routines/{routine}', [RoutineController::class, 'destroy']);
        Route::post('/routines/{routine}/activate', [RoutineController::class, 'activate']);
        Route::post('/routines/{routine}/days', [RoutineDayController::class, 'store']);
        Route::put('/routines/{routine}/days/reorder', [RoutineDayController::class, 'reorder']);
    });
    Route::middleware('can:manage,routineDay')->group(function () {
        Route::put('/routine-days/{routineDay}', [RoutineDayController::class, 'update']);
        Route::delete('/routine-days/{routineDay}', [RoutineDayController::class, 'destroy']);
        Route::post('/routine-days/{routineDay}/duplicate', [RoutineDayController::class, 'duplicate']);
        Route::post('/routine-days/{routineDay}/exercises', [RoutineDayExerciseController::class, 'store']);
        Route::put('/routine-days/{routineDay}/exercises/reorder', [RoutineDayExerciseController::class, 'reorder']);
    });
    Route::middleware('can:manage,routineDayExercise')->group(function () {
        Route::put('/routine-day-exercises/{routineDayExercise}', [RoutineDayExerciseController::class, 'update']);
        Route::delete('/routine-day-exercises/{routineDayExercise}', [RoutineDayExerciseController::class, 'destroy']);
    });

    Route::get('/workouts', [WorkoutController::class, 'index']);
    Route::get('/workouts/{workout}', [WorkoutController::class, 'show']);
    Route::put('/workouts/{workout}', [WorkoutController::class, 'upsert']);
    Route::delete('/workouts/{workout}', [WorkoutController::class, 'destroy']);
    Route::put('/workout-exercises/{workoutExercise}', [WorkoutExerciseController::class, 'upsert']);
    Route::delete('/workout-exercises/{workoutExercise}', [WorkoutExerciseController::class, 'destroy']);
    Route::put('/workout-sets/{workoutSet}', [WorkoutSetController::class, 'upsert']);
    Route::delete('/workout-sets/{workoutSet}', [WorkoutSetController::class, 'destroy']);
});
