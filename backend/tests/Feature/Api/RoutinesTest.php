<?php

use App\Models\Exercise;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

it('lists the user routines with day count, active first', function () {
    Routine::factory()->for($this->user)->create(['name' => 'A']);
    $active = Routine::factory()->for($this->user)->create(['name' => 'B', 'is_active' => true]);
    RoutineDay::factory()->count(2)->for($active)->create();
    Routine::factory()->create(['name' => 'Ajena']);

    $this->getJson('/api/routines')
        ->assertOk()
        ->assertJsonPath('data.*.name', ['B', 'A'])
        ->assertJsonPath('data.0.days_count', 2);
});

it('creates and validates a routine', function () {
    $this->postJson('/api/routines', ['name' => 'Torso/pierna'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Torso/pierna')
        ->assertJsonPath('data.is_active', false);

    $this->postJson('/api/routines', ['name' => ''])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name']);
});

it('shows a routine with ordered days and exercises', function () {
    $routine = Routine::factory()->for($this->user)->create();
    $tuesday = RoutineDay::factory()->for($routine)->create(['name' => 'Martes', 'position' => 1]);
    RoutineDay::factory()->for($routine)->create(['name' => 'Lunes', 'position' => 0]);
    RoutineDayExercise::factory()->for($tuesday, 'routineDay')->create([
        'position' => 0,
        'exercise_id' => Exercise::factory()->for($this->user)->create()->id,
    ]);

    $this->getJson("/api/routines/{$routine->id}")
        ->assertOk()
        ->assertJsonPath('data.days.*.name', ['Lunes', 'Martes'])
        ->assertJsonCount(1, 'data.days.1.exercises')
        ->assertJsonStructure(['data' => ['days' => [1 => ['exercises' => [['exercise' => ['id', 'name']]]]]]]);
});

it('updates and deletes a routine', function () {
    $routine = Routine::factory()->for($this->user)->create();
    RoutineDay::factory()->for($routine)->create();

    $this->putJson("/api/routines/{$routine->id}", ['name' => 'Nueva', 'notes' => 'x'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Nueva');

    $this->deleteJson("/api/routines/{$routine->id}")->assertNoContent();
    expect(Routine::count())->toBe(0)->and(RoutineDay::count())->toBe(0);
});

it('activates one routine and deactivates the other routines of the user', function () {
    $old = Routine::factory()->for($this->user)->create(['is_active' => true]);
    $new = Routine::factory()->for($this->user)->create();
    $foreign = Routine::factory()->create(['is_active' => true]);

    $this->postJson("/api/routines/{$new->id}/activate")
        ->assertOk()
        ->assertJsonPath('data.is_active', true);

    expect($old->fresh()->is_active)->toBeFalse()
        ->and(Routine::withoutGlobalScopes()->find($foreign->id)->is_active)->toBeTrue();
});

it('hides routines of other users', function () {
    $foreign = Routine::factory()->create();

    $this->getJson("/api/routines/{$foreign->id}")->assertNotFound();
    $this->postJson("/api/routines/{$foreign->id}/activate")->assertNotFound();
});
