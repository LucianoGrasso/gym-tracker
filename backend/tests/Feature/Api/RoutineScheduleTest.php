<?php

use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->routine = Routine::factory()->for($this->user)->create();
    $this->wed = RoutineDay::factory()->for($this->routine)->create(['name' => 'Pecho', 'weekday' => 3, 'position' => 0]);
    $this->thu = RoutineDay::factory()->for($this->routine)->create(['name' => 'Piernas', 'weekday' => 4, 'position' => 1]);
    $this->extra = RoutineDay::factory()->for($this->routine)->create(['name' => 'Extra', 'weekday' => null, 'position' => 2]);
});

function putSchedule(Routine $routine, array $days)
{
    return test()->putJson("/api/routines/{$routine->id}/schedule", ['days' => $days]);
}

it('swaps two days and stores the order as position', function () {
    putSchedule($this->routine, [
        ['id' => $this->thu->id, 'weekday' => 3],
        ['id' => $this->wed->id, 'weekday' => 4],
        ['id' => $this->extra->id, 'weekday' => null],
    ])->assertNoContent();

    expect($this->thu->fresh())->weekday->toBe(3)->position->toBe(0)
        ->and($this->wed->fresh())->weekday->toBe(4)->position->toBe(1)
        ->and($this->extra->fresh())->weekday->toBeNull()->position->toBe(2);
});

it('moves a day to the tray and another to a free weekday', function () {
    putSchedule($this->routine, [
        ['id' => $this->extra->id, 'weekday' => 1],
        ['id' => $this->thu->id, 'weekday' => 4],
        ['id' => $this->wed->id, 'weekday' => null],
    ])->assertNoContent();

    expect($this->extra->fresh()->weekday)->toBe(1)
        ->and($this->wed->fresh())->weekday->toBeNull()->position->toBe(2);
});

it('rejects two days on the same weekday', function () {
    putSchedule($this->routine, [
        ['id' => $this->wed->id, 'weekday' => 3],
        ['id' => $this->thu->id, 'weekday' => 3],
        ['id' => $this->extra->id, 'weekday' => null],
    ])
        ->assertStatus(422)
        ->assertJsonPath('errors.days.0', 'Hay dos días asignados al mismo día de la semana.');

    expect($this->thu->fresh()->weekday)->toBe(4);
});

it('rejects a schedule that leaves days out', function () {
    putSchedule($this->routine, [
        ['id' => $this->wed->id, 'weekday' => 3],
        ['id' => $this->thu->id, 'weekday' => 4],
    ])
        ->assertStatus(422)
        ->assertJsonPath('errors.days.0', 'Faltan días de la rutina.');
});

it('rejects a day of another routine', function () {
    $other = RoutineDay::factory()->for(Routine::factory()->for($this->user))->create();

    putSchedule($this->routine, [
        ['id' => $this->wed->id, 'weekday' => 3],
        ['id' => $this->thu->id, 'weekday' => 4],
        ['id' => $other->id, 'weekday' => null],
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['days.2.id']);
});

it('does not touch a routine of another user', function () {
    $foreign = Routine::factory()->create();

    putSchedule($foreign, [])->assertNotFound();
});
