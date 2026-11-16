<?php

use App\Enums\ExerciseKind;
use App\Models\Exercise;
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

function cardioItem(User $user): WorkoutExercise
{
    return WorkoutExercise::factory()->create([
        'workout_id' => Workout::factory()->for($user)->create()->id,
        'exercise_id' => Exercise::factory()->for($user)->create(['kind' => ExerciseKind::Cardio])->id,
    ]);
}

function segmentPayload(array $overrides = []): array
{
    return array_merge([
        'set_number' => 1, 'set_type' => 'normal', 'weight_kg' => 0, 'reps' => 0, 'side' => 'both',
        'duration_seconds' => 2100, 'speed_kmh' => 5.5, 'incline_pct' => 12, 'distance_km' => 3.2,
        'avg_heart_rate' => 128, 'calories' => 250,
    ], $overrides);
}

it('stores a cardio segment', function () {
    $item = cardioItem($this->user);
    $id = strtolower((string) Str::ulid());

    $this->putJson("/api/workout-sets/{$id}", segmentPayload(['workout_exercise_id' => $item->id]))
        ->assertCreated()
        ->assertJsonPath('data.duration_seconds', 2100)
        ->assertJsonPath('data.speed_kmh', 5.5)
        ->assertJsonPath('data.incline_pct', 12)
        ->assertJsonPath('data.distance_km', 3.2)
        ->assertJsonPath('data.avg_heart_rate', 128)
        ->assertJsonPath('data.calories', 250);
});

it('requires the duration of a cardio segment', function () {
    $item = cardioItem($this->user);
    $id = strtolower((string) Str::ulid());

    $this->putJson("/api/workout-sets/{$id}", segmentPayload(['workout_exercise_id' => $item->id, 'duration_seconds' => null]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['duration_seconds' => 'La duración es obligatoria.']);
});

it('validates the cardio ranges', function () {
    $item = cardioItem($this->user);
    $id = strtolower((string) Str::ulid());

    $this->putJson("/api/workout-sets/{$id}", segmentPayload([
        'workout_exercise_id' => $item->id, 'duration_seconds' => 0, 'speed_kmh' => 61, 'incline_pct' => 41,
        'distance_km' => 1000, 'avg_heart_rate' => 29, 'calories' => 10000,
    ]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['duration_seconds', 'speed_kmh', 'incline_pct', 'distance_km', 'avg_heart_rate', 'calories']);
});

it('keeps strength sets without cardio fields', function () {
    $id = strtolower((string) Str::ulid());

    $this->putJson("/api/workout-sets/{$id}", setPayload(['workout_exercise_id' => $this->item->id]))
        ->assertCreated()
        ->assertJsonPath('data.duration_seconds', null)
        ->assertJsonPath('data.speed_kmh', null);
});
