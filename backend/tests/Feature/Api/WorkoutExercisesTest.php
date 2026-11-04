<?php

use App\Models\Exercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->workout = Workout::factory()->for($this->user)->create();
    $this->exercise = Exercise::factory()->for($this->user)->create(['name' => 'Dominadas']);
});

function workoutExercisePayload(array $overrides = []): array
{
    return array_merge([
        'position' => 0,
        'target_sets' => 6,
        'target_reps_min' => 5,
        'target_reps_max' => 6,
        'target_text' => null,
        'default_set_type' => 'normal',
        'rest_seconds' => 150,
        'notes' => null,
    ], $overrides);
}

it('creates and updates a workout exercise idempotently', function () {
    $id = strtolower((string) Str::ulid());
    $payload = workoutExercisePayload(['workout_id' => $this->workout->id, 'exercise_id' => $this->exercise->id]);

    $this->putJson("/api/workout-exercises/{$id}", $payload)
        ->assertCreated()
        ->assertJsonPath('data.exercise.name', 'Dominadas');
    $this->putJson("/api/workout-exercises/{$id}", [...$payload, 'position' => 2])
        ->assertOk()
        ->assertJsonPath('data.position', 2);

    expect(WorkoutExercise::count())->toBe(1);
});

it('allows a free-form exercise without targets', function () {
    $this->putJson('/api/workout-exercises/'.strtolower((string) Str::ulid()), workoutExercisePayload([
        'workout_id' => $this->workout->id,
        'exercise_id' => $this->exercise->id,
        'target_sets' => null,
        'target_reps_min' => null,
        'target_reps_max' => null,
    ]))->assertCreated();
});

it('validates ownership of the workout and the exercise', function () {
    $this->putJson('/api/workout-exercises/'.strtolower((string) Str::ulid()), workoutExercisePayload([
        'workout_id' => Workout::factory()->create()->id,
        'exercise_id' => Exercise::factory()->create()->id,
    ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['workout_id', 'exercise_id']);
});

it('refuses to overwrite a workout exercise of another user', function () {
    $foreign = WorkoutExercise::factory()->create();

    $this->putJson("/api/workout-exercises/{$foreign->id}", workoutExercisePayload([
        'workout_id' => $this->workout->id,
        'exercise_id' => $this->exercise->id,
    ]))->assertNotFound();

    $this->deleteJson("/api/workout-exercises/{$foreign->id}")->assertNoContent();
    expect(WorkoutExercise::find($foreign->id))->not->toBeNull();
});

it('deletes a workout exercise idempotently', function () {
    $item = WorkoutExercise::factory()->create(['workout_id' => $this->workout->id]);

    $this->deleteJson("/api/workout-exercises/{$item->id}")->assertNoContent();
    $this->deleteJson("/api/workout-exercises/{$item->id}")->assertNoContent();

    expect(WorkoutExercise::count())->toBe(0);
});
