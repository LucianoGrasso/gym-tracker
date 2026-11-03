<?php

namespace App\Services;

use App\Models\WorkoutExercise;

class LastPerformanceService
{
    /**
     * Most recent session (by workout date, then start time) that has at least one set,
     * for each given exercise.
     *
     * @param  list<int>  $exerciseIds
     * @return array<int, WorkoutExercise> keyed by exercise_id
     */
    public function forExercises(array $exerciseIds): array
    {
        if ($exerciseIds === []) {
            return [];
        }

        return WorkoutExercise::query()
            ->select('workout_exercises.*', 'workouts.date as workout_date')
            ->join('workouts', 'workouts.id', '=', 'workout_exercises.workout_id')
            ->whereIn('workout_exercises.exercise_id', $exerciseIds)
            ->whereHas('sets')
            ->orderByDesc('workouts.date')
            ->orderByDesc('workouts.started_at')
            ->with('sets')
            ->get()
            ->unique('exercise_id')
            ->keyBy('exercise_id')
            ->all();
    }
}
