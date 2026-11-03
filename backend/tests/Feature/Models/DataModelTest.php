<?php

use App\Enums\Equipment;
use App\Enums\MuscleGroup;
use App\Enums\SetType;
use App\Enums\Side;
use App\Models\Exercise;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use Illuminate\Database\QueryException;
use Illuminate\Support\Str;

it('casts exercise enums and flags', function () {
    $exercise = Exercise::factory()->create([
        'muscle_group' => 'chest',
        'equipment' => 'dumbbell',
        'is_unilateral' => 1,
    ])->fresh();

    expect($exercise->muscle_group)->toBe(MuscleGroup::Chest)
        ->and($exercise->equipment)->toBe(Equipment::Dumbbell)
        ->and($exercise->is_unilateral)->toBeTrue()
        ->and($exercise->uses_bodyweight)->toBeFalse();
});

it('excludes archived exercises with the active scope', function () {
    Exercise::factory()->create();
    Exercise::factory()->create(['archived_at' => now()]);

    expect(Exercise::active()->count())->toBe(1)
        ->and(Exercise::count())->toBe(2);
});

it('orders routine days and their exercises by position', function () {
    $routine = Routine::factory()->create();
    RoutineDay::factory()->for($routine)->create(['name' => 'B', 'position' => 1]);
    $first = RoutineDay::factory()->for($routine)->create(['name' => 'A', 'position' => 0]);
    RoutineDayExercise::factory()->for($first, 'routineDay')->create(['position' => 1, 'target_text' => 'segundo']);
    RoutineDayExercise::factory()->for($first, 'routineDay')->create(['position' => 0, 'target_text' => 'primero']);

    expect($routine->days->pluck('name')->all())->toBe(['A', 'B'])
        ->and($first->exercises->pluck('target_text')->all())->toBe(['primero', 'segundo'])
        ->and($first->exercises->first()->default_set_type)->toBe(SetType::Normal);
});

it('uses ULIDs for workouts, workout exercises and sets', function () {
    $set = WorkoutSet::factory()->create();

    expect(Str::isUlid($set->id))->toBeTrue()
        ->and(Str::isUlid($set->workout_exercise_id))->toBeTrue()
        ->and(Str::isUlid($set->workoutExercise->workout_id))->toBeTrue()
        ->and($set->side)->toBe(Side::Both)
        ->and($set->weight_kg)->toBe('50.00');
});

it('accepts a client-generated ULID', function () {
    $id = (string) Str::ulid();

    $workout = Workout::factory()->create(['id' => $id]);

    expect($workout->id)->toBe($id);
});

it('cascades workout deletion to its exercises and sets', function () {
    $set = WorkoutSet::factory()->create();
    $workout = $set->workoutExercise->workout;

    $workout->delete();

    expect(WorkoutExercise::count())->toBe(0)
        ->and(WorkoutSet::count())->toBe(0);
});

it('prevents deleting an exercise that has history', function () {
    $workoutExercise = WorkoutExercise::factory()->create();

    $workoutExercise->exercise->delete();
})->throws(QueryException::class);
