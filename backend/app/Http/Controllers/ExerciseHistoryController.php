<?php

namespace App\Http\Controllers;

use App\Http\Resources\ExerciseSessionResource;
use App\Models\Exercise;
use App\Models\WorkoutExercise;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ExerciseHistoryController extends Controller
{
    public function __invoke(Exercise $exercise): AnonymousResourceCollection
    {
        $sessions = WorkoutExercise::query()
            ->select('workout_exercises.*', 'workouts.date as workout_date')
            ->join('workouts', 'workouts.id', '=', 'workout_exercises.workout_id')
            ->where('workout_exercises.exercise_id', $exercise->id)
            ->whereHas('sets')
            ->orderByDesc('workouts.date')
            ->orderByDesc('workouts.started_at')
            ->with('sets')
            ->paginate(20);

        return ExerciseSessionResource::collection($sessions);
    }
}
