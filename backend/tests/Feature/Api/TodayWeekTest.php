<?php

use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\User;
use App\Models\Workout;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->routine = Routine::factory()->for($this->user)->create(['is_active' => true]);
    $this->mon = RoutineDay::factory()->for($this->routine)->create(['name' => 'Pecho', 'weekday' => 1, 'position' => 0]);
    $this->wed = RoutineDay::factory()->for($this->routine)->create(['name' => 'Espalda', 'weekday' => 3, 'position' => 1]);
    $this->thu = RoutineDay::factory()->for($this->routine)->create(['name' => 'Piernas', 'weekday' => 4, 'position' => 2]);
    RoutineDay::factory()->for($this->routine)->create(['name' => 'Extra', 'weekday' => null, 'position' => 3]);
    // Jueves 2026-11-05 al mediodía en Santiago (semana del lunes 2026-11-02).
    $this->travelTo(Carbon::parse('2026-11-05 15:00:00', 'UTC'));
});

function trainedOn(string $date, ?RoutineDay $day = null): void
{
    Workout::factory()->for(test()->user)->create(['date' => $date, 'routine_day_id' => $day?->id]);
}

it('reports the routine days done this week', function () {
    trainedOn('2026-11-02', $this->mon);
    trainedOn('2026-10-29', $this->thu); // semana anterior
    trainedOn('2026-11-03'); // sesión libre
    trainedOn('2026-11-03', RoutineDay::factory()->for(Routine::factory()->for($this->user))->create()); // otra rutina

    $this->getJson('/api/today')
        ->assertOk()
        ->assertJsonPath('data.week.start', '2026-11-02')
        ->assertJsonPath('data.week.done_day_ids', [$this->mon->id])
        ->assertJsonPath('data.suggestion', 'planned')
        ->assertJsonPath('data.day.name', 'Piernas')
        ->assertJsonPath('data.replaced', null);
});

it('counts the whole week up to sunday', function () {
    $this->travelTo(Carbon::parse('2026-11-08 15:00:00', 'UTC')); // domingo
    trainedOn('2026-11-08', $this->thu);

    $this->getJson('/api/today')
        ->assertJsonPath('data.week.start', '2026-11-02')
        ->assertJsonPath('data.week.done_day_ids', [$this->thu->id]);
});

it('suggests the pending day when today\'s was done earlier this week', function () {
    trainedOn('2026-11-02', $this->mon);
    trainedOn('2026-11-04', $this->thu);

    $this->getJson('/api/today')
        ->assertJsonPath('data.suggestion', 'pending')
        ->assertJsonPath('data.day.name', 'Espalda')
        ->assertJsonPath('data.replaced.id', $this->thu->id)
        ->assertJsonPath('data.replaced.name', 'Piernas')
        ->assertJsonPath('data.replaced.done_on', '2026-11-04');
});

it('suggests the earliest pending day first', function () {
    trainedOn('2026-11-04', $this->thu);

    $this->getJson('/api/today')->assertJsonPath('data.day.name', 'Pecho');
});

it('keeps today\'s day when it was trained today', function () {
    trainedOn('2026-11-05', $this->thu);

    $this->getJson('/api/today')
        ->assertJsonPath('data.suggestion', 'planned')
        ->assertJsonPath('data.day.name', 'Piernas')
        ->assertJsonPath('data.replaced', null);
});

it('reports a complete week', function () {
    trainedOn('2026-11-02', $this->mon);
    trainedOn('2026-11-03', $this->wed);
    trainedOn('2026-11-04', $this->thu);

    $this->getJson('/api/today')
        ->assertJsonPath('data.suggestion', 'week_done')
        ->assertJsonPath('data.day', null)
        ->assertJsonPath('data.replaced.name', 'Piernas');
});

it('marks a chosen day as chosen', function () {
    $this->getJson("/api/today?day={$this->wed->id}")
        ->assertJsonPath('data.suggestion', 'chosen')
        ->assertJsonPath('data.day.name', 'Espalda');
});

it('has no suggestion on a rest day', function () {
    $this->travelTo(Carbon::parse('2026-11-03 15:00:00', 'UTC')); // martes

    $this->getJson('/api/today')
        ->assertJsonPath('data.suggestion', null)
        ->assertJsonPath('data.day', null);
});
