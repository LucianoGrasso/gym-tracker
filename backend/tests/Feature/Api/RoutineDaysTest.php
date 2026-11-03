<?php

use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->routine = Routine::factory()->for($this->user)->create();
});

it('adds a day at the end', function () {
    RoutineDay::factory()->for($this->routine)->create(['position' => 0]);

    $this->postJson("/api/routines/{$this->routine->id}/days", ['name' => 'Viernes – Piernas', 'weekday' => 5])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Viernes – Piernas')
        ->assertJsonPath('data.weekday', 5)
        ->assertJsonPath('data.position', 1)
        ->assertJsonPath('data.exercises', []);
});

it('rejects a weekday already used in the same routine only', function () {
    RoutineDay::factory()->for($this->routine)->create(['weekday' => 1]);
    $other = Routine::factory()->for($this->user)->create();

    $this->postJson("/api/routines/{$this->routine->id}/days", ['name' => 'Otro lunes', 'weekday' => 1])
        ->assertStatus(422)
        ->assertJsonPath('errors.weekday.0', 'Ya hay un día de esta rutina asignado a ese día de la semana.');

    $this->postJson("/api/routines/{$other->id}/days", ['name' => 'Lunes', 'weekday' => 1])->assertCreated();
});

it('updates a day keeping its own weekday', function () {
    $day = RoutineDay::factory()->for($this->routine)->create(['weekday' => 1]);

    $this->putJson("/api/routine-days/{$day->id}", ['name' => 'Lunes – Pecho', 'weekday' => 1])
        ->assertOk()
        ->assertJsonPath('data.name', 'Lunes – Pecho');
});

it('deletes a day', function () {
    $day = RoutineDay::factory()->for($this->routine)->create();

    $this->deleteJson("/api/routine-days/{$day->id}")->assertNoContent();
    expect(RoutineDay::count())->toBe(0);
});

it('reorders the days of a routine', function () {
    $a = RoutineDay::factory()->for($this->routine)->create(['position' => 0]);
    $b = RoutineDay::factory()->for($this->routine)->create(['position' => 1]);

    $this->putJson("/api/routines/{$this->routine->id}/days/reorder", ['ids' => [$b->id, $a->id]])
        ->assertNoContent();

    expect($b->fresh()->position)->toBe(0)->and($a->fresh()->position)->toBe(1);

    $this->putJson("/api/routines/{$this->routine->id}/days/reorder", ['ids' => [$a->id]])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['ids']);
});

it('duplicates a day with its exercises', function () {
    $day = RoutineDay::factory()->for($this->routine)->create(['name' => 'Lunes', 'weekday' => 1, 'position' => 0]);
    RoutineDayExercise::factory()->count(2)->for($day, 'routineDay')->sequence(['position' => 0], ['position' => 1])->create();

    $this->postJson("/api/routine-days/{$day->id}/duplicate")
        ->assertCreated()
        ->assertJsonPath('data.name', 'Lunes (copia)')
        ->assertJsonPath('data.weekday', null)
        ->assertJsonPath('data.position', 1)
        ->assertJsonCount(2, 'data.exercises');

    expect(RoutineDayExercise::count())->toBe(4);
});

it('forbids touching days of other users', function () {
    $foreign = RoutineDay::factory()->create();

    $this->putJson("/api/routine-days/{$foreign->id}", ['name' => 'x', 'weekday' => null])->assertForbidden();
    $this->deleteJson("/api/routine-days/{$foreign->id}")->assertForbidden();
    $this->postJson("/api/routine-days/{$foreign->id}/duplicate")->assertForbidden();
});
