<?php

use App\Models\Exercise;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use App\Services\LastPerformanceService;

function sessionWith(Exercise $exercise, string $date, array $sets): WorkoutExercise
{
    $workout = Workout::factory()->create(['user_id' => $exercise->user_id, 'date' => $date]);
    $workoutExercise = WorkoutExercise::factory()->create([
        'workout_id' => $workout->id,
        'exercise_id' => $exercise->id,
    ]);
    foreach ($sets as $i => [$weight, $reps]) {
        WorkoutSet::factory()->create([
            'workout_exercise_id' => $workoutExercise->id,
            'set_number' => $i + 1,
            'weight_kg' => $weight,
            'reps' => $reps,
        ]);
    }

    return $workoutExercise;
}

it('returns the most recent session with sets per exercise', function () {
    $bench = Exercise::factory()->create();
    $pullUps = Exercise::factory()->create(['user_id' => $bench->user_id]);
    sessionWith($bench, '2026-10-20', [[40, 30]]);
    $latest = sessionWith($bench, '2026-10-27', [[42.5, 31], [42.5, 10]]);
    sessionWith($bench, '2026-10-30', []);
    $pull = sessionWith($pullUps, '2026-10-28', [[0, 6]]);

    $result = app(LastPerformanceService::class)->forExercises([$bench->id, $pullUps->id]);

    expect($result)->toHaveKeys([$bench->id, $pullUps->id])
        ->and($result[$bench->id]->id)->toBe($latest->id)
        ->and($result[$bench->id]->sets)->toHaveCount(2)
        ->and(substr($result[$bench->id]->workout_date, 0, 10))->toBe('2026-10-27')
        ->and($result[$pullUps->id]->id)->toBe($pull->id);
});

it('returns an empty array for no exercises or no history', function () {
    $exercise = Exercise::factory()->create();

    expect(app(LastPerformanceService::class)->forExercises([]))->toBe([])
        ->and(app(LastPerformanceService::class)->forExercises([$exercise->id]))->toBe([]);
});
