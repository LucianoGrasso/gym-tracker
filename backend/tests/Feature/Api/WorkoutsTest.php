<?php

use App\Models\Exercise;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->day = RoutineDay::factory()->for(Routine::factory()->for($this->user))->create(['name' => 'Martes – Espalda']);
});

function workoutPayload(array $overrides = []): array
{
    return array_merge([
        'routine_day_id' => null,
        'date' => '2026-11-03',
        'started_at' => '2026-11-03T22:00:00.000Z',
        'finished_at' => null,
        'bodyweight_kg' => null,
        'notes' => null,
    ], $overrides);
}

it('creates a workout with a client ULID and is idempotent', function () {
    $id = strtolower((string) Str::ulid());
    $payload = workoutPayload(['routine_day_id' => $this->day->id]);

    $this->putJson("/api/workouts/{$id}", $payload)
        ->assertCreated()
        ->assertJsonPath('data.id', $id)
        ->assertJsonPath('data.date', '2026-11-03')
        ->assertJsonPath('data.finished_at', null);

    $this->putJson("/api/workouts/{$id}", $payload)->assertOk();

    expect(Workout::count())->toBe(1)
        ->and(Workout::sole()->user_id)->toBe($this->user->id);
});

it('updates a workout when finishing it', function () {
    $workout = Workout::factory()->for($this->user)->create();

    $this->putJson("/api/workouts/{$workout->id}", workoutPayload([
        'started_at' => '2026-11-03T22:00:00Z',
        'finished_at' => '2026-11-03T23:15:00Z',
        'bodyweight_kg' => 78.5,
    ]))
        ->assertOk()
        ->assertJsonPath('data.bodyweight_kg', 78.5)
        ->assertJsonPath('data.finished_at', '2026-11-03T23:15:00+00:00');
});

it('refuses to touch a workout of another user', function () {
    $foreign = Workout::factory()->create(['notes' => 'ajeno']);

    $this->putJson("/api/workouts/{$foreign->id}", workoutPayload(['notes' => 'mío']))->assertNotFound();
    $this->deleteJson("/api/workouts/{$foreign->id}")->assertNoContent();

    expect(Workout::withoutGlobalScopes()->find($foreign->id)->notes)->toBe('ajeno');
});

it('validates the workout payload', function () {
    $foreignDay = RoutineDay::factory()->create();

    $this->putJson('/api/workouts/'.strtolower((string) Str::ulid()), workoutPayload([
        'routine_day_id' => $foreignDay->id,
        'date' => '03/11/2026',
        'finished_at' => '2026-11-03T21:00:00Z',
    ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['routine_day_id', 'date', 'finished_at']);
});

it('rejects an id that is not a ULID', function () {
    $this->putJson('/api/workouts/not-a-ulid', workoutPayload())->assertNotFound();
});

it('deletes idempotently with its exercises and sets', function () {
    $workout = Workout::factory()->for($this->user)->create();
    $item = WorkoutExercise::factory()->create(['workout_id' => $workout->id]);
    WorkoutSet::factory()->create(['workout_exercise_id' => $item->id]);

    $this->deleteJson("/api/workouts/{$workout->id}")->assertNoContent();
    $this->deleteJson("/api/workouts/{$workout->id}")->assertNoContent();

    expect(Workout::count())->toBe(0)->and(WorkoutSet::count())->toBe(0);
});

it('lists workouts newest first with counts', function () {
    $old = Workout::factory()->for($this->user)->create(['date' => '2026-10-01', 'routine_day_id' => $this->day->id]);
    $new = Workout::factory()->for($this->user)->create(['date' => '2026-10-08']);
    $exercise = WorkoutExercise::factory()->create(['workout_id' => $old->id]);
    WorkoutSet::factory()->count(3)->sequence(fn ($s) => ['set_number' => $s->index + 1])->create(['workout_exercise_id' => $exercise->id]);
    Workout::factory()->create();

    $this->getJson('/api/workouts')
        ->assertOk()
        ->assertJsonPath('data.*.id', [$new->id, $old->id])
        ->assertJsonPath('data.1.routine_day_name', 'Martes – Espalda')
        ->assertJsonPath('data.1.exercises_count', 1)
        ->assertJsonPath('data.1.sets_count', 3)
        ->assertJsonPath('meta.current_page', 1);
});

it('shows a workout with exercises and sets', function () {
    $workout = Workout::factory()->for($this->user)->create();
    $exercise = Exercise::factory()->for($this->user)->create(['name' => 'Dominadas']);
    $item = WorkoutExercise::factory()->create(['workout_id' => $workout->id, 'exercise_id' => $exercise->id]);
    WorkoutSet::factory()->create(['workout_exercise_id' => $item->id, 'weight_kg' => 0, 'reps' => 6]);

    $this->getJson("/api/workouts/{$workout->id}")
        ->assertOk()
        ->assertJsonPath('data.exercises.0.exercise.name', 'Dominadas')
        ->assertJsonPath('data.exercises.0.sets.0.reps', 6)
        ->assertJsonPath('data.exercises.0.sets.0.workout_exercise_id', $item->id);

    $this->getJson('/api/workouts/'.Workout::factory()->create()->id)->assertNotFound();
});
