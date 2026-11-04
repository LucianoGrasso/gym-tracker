<?php

use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->item = WorkoutExercise::factory()->create([
        'workout_id' => Workout::factory()->for($this->user)->create()->id,
    ]);
});

function setPayload(array $overrides = []): array
{
    return array_merge([
        'set_number' => 1,
        'set_type' => 'bilbo',
        'weight_kg' => 42.5,
        'reps' => 31,
        'side' => 'both',
        'rir' => null,
        'pain_level' => 2,
        'notes' => 'Muñeca derecha',
    ], $overrides);
}

it('creates and updates a set idempotently', function () {
    $id = strtolower((string) Str::ulid());

    $this->putJson("/api/workout-sets/{$id}", setPayload(['workout_exercise_id' => $this->item->id]))
        ->assertCreated()
        ->assertJsonPath('data.weight_kg', 42.5)
        ->assertJsonPath('data.set_type', 'bilbo')
        ->assertJsonPath('data.pain_level', 2);

    $this->putJson("/api/workout-sets/{$id}", setPayload(['workout_exercise_id' => $this->item->id, 'reps' => 32]))
        ->assertOk()
        ->assertJsonPath('data.reps', 32);

    expect(WorkoutSet::count())->toBe(1);
});

it('validates the set', function () {
    $this->putJson('/api/workout-sets/'.strtolower((string) Str::ulid()), setPayload([
        'workout_exercise_id' => WorkoutExercise::factory()->create()->id,
        'weight_kg' => -5,
        'reps' => 1000,
        'side' => 'up',
        'pain_level' => 11,
    ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['workout_exercise_id', 'weight_kg', 'reps', 'side', 'pain_level']);
});

it('refuses to overwrite a set of another user', function () {
    $foreign = WorkoutSet::factory()->create();

    $this->putJson("/api/workout-sets/{$foreign->id}", setPayload(['workout_exercise_id' => $this->item->id]))
        ->assertNotFound();
    $this->deleteJson("/api/workout-sets/{$foreign->id}")->assertNoContent();

    expect(WorkoutSet::find($foreign->id))->not->toBeNull();
});

it('deletes a set idempotently', function () {
    $set = WorkoutSet::factory()->create(['workout_exercise_id' => $this->item->id]);

    $this->deleteJson("/api/workout-sets/{$set->id}")->assertNoContent();
    $this->deleteJson("/api/workout-sets/{$set->id}")->assertNoContent();

    expect(WorkoutSet::count())->toBe(0);
});
