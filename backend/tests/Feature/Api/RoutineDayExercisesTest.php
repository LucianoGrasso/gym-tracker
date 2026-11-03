<?php

use App\Models\Exercise;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->day = RoutineDay::factory()->for(Routine::factory()->for($this->user))->create();
    $this->exercise = Exercise::factory()->for($this->user)->create(['name' => 'Dominadas']);
});

function targetsPayload(array $overrides = []): array
{
    return array_merge([
        'target_sets' => 6,
        'target_reps_min' => 5,
        'target_reps_max' => 6,
        'target_text' => 'Parar con 1-2 RIR',
        'default_set_type' => 'normal',
        'rest_seconds' => 150,
        'notes' => null,
    ], $overrides);
}

it('adds an exercise at the end of the day', function () {
    RoutineDayExercise::factory()->for($this->day, 'routineDay')->create(['position' => 0]);

    $this->postJson("/api/routine-days/{$this->day->id}/exercises", targetsPayload(['exercise_id' => $this->exercise->id]))
        ->assertCreated()
        ->assertJsonPath('data.exercise.name', 'Dominadas')
        ->assertJsonPath('data.position', 1)
        ->assertJsonPath('data.target_sets', 6);
});

it('validates the targets and the exercise ownership', function () {
    $foreign = Exercise::factory()->create();

    $this->postJson("/api/routine-days/{$this->day->id}/exercises", targetsPayload([
        'exercise_id' => $foreign->id,
        'target_reps_min' => 10,
        'target_reps_max' => 8,
        'default_set_type' => 'superset',
    ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['exercise_id', 'target_reps_max', 'default_set_type'])
        ->assertJsonPath('errors.target_reps_max.0', 'El máximo de reps no puede ser menor que el mínimo.');
});

it('updates the targets of an exercise', function () {
    $item = RoutineDayExercise::factory()->for($this->day, 'routineDay')->create(['exercise_id' => $this->exercise->id]);

    $this->putJson("/api/routine-day-exercises/{$item->id}", targetsPayload(['target_sets' => 5, 'default_set_type' => 'heavy']))
        ->assertOk()
        ->assertJsonPath('data.target_sets', 5)
        ->assertJsonPath('data.default_set_type', 'heavy')
        ->assertJsonPath('data.exercise.id', $this->exercise->id);
});

it('removes an exercise from the day', function () {
    $item = RoutineDayExercise::factory()->for($this->day, 'routineDay')->create();

    $this->deleteJson("/api/routine-day-exercises/{$item->id}")->assertNoContent();
    expect(RoutineDayExercise::count())->toBe(0);
});

it('reorders the exercises of a day', function () {
    $a = RoutineDayExercise::factory()->for($this->day, 'routineDay')->create(['position' => 0]);
    $b = RoutineDayExercise::factory()->for($this->day, 'routineDay')->create(['position' => 1]);

    $this->putJson("/api/routine-days/{$this->day->id}/exercises/reorder", ['ids' => [$b->id, $a->id]])
        ->assertNoContent();

    expect($b->fresh()->position)->toBe(0)->and($a->fresh()->position)->toBe(1);
});

it('forbids touching exercises of other users days', function () {
    $foreignDay = RoutineDay::factory()->create();
    $foreignItem = RoutineDayExercise::factory()->for($foreignDay, 'routineDay')->create();

    $this->postJson("/api/routine-days/{$foreignDay->id}/exercises", targetsPayload(['exercise_id' => $this->exercise->id]))
        ->assertForbidden();
    $this->putJson("/api/routine-day-exercises/{$foreignItem->id}", targetsPayload())->assertForbidden();
    $this->deleteJson("/api/routine-day-exercises/{$foreignItem->id}")->assertForbidden();
});
