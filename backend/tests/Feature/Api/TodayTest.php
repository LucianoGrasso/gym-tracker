<?php

use App\Models\Exercise;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->routine = Routine::factory()->for($this->user)->create(['name' => 'Rutina 4 días', 'is_active' => true]);
    $this->monday = RoutineDay::factory()->for($this->routine)->create(['name' => 'Lunes – Pecho', 'weekday' => 1, 'position' => 0]);
    RoutineDay::factory()->for($this->routine)->create(['name' => 'Martes – Espalda', 'weekday' => 2, 'position' => 1]);
    $this->bench = Exercise::factory()->for($this->user)->create(['name' => 'Press de banca']);
    RoutineDayExercise::factory()->for($this->monday, 'routineDay')->create(['exercise_id' => $this->bench->id, 'default_set_type' => 'bilbo']);
});

it('returns the day that matches today in America/Santiago with the last performance', function () {
    $workout = Workout::factory()->for($this->user)->create(['date' => '2026-10-26']);
    $workoutExercise = WorkoutExercise::factory()->create(['workout_id' => $workout->id, 'exercise_id' => $this->bench->id]);
    WorkoutSet::factory()->create(['workout_exercise_id' => $workoutExercise->id, 'weight_kg' => 42.5, 'reps' => 30, 'set_type' => 'bilbo']);

    // 02:00 UTC del martes = 23:00 del lunes en Santiago (UTC-3)
    $this->travelTo(Carbon::parse('2026-11-03 02:00:00', 'UTC'));

    $this->getJson('/api/today')
        ->assertOk()
        ->assertJsonPath('data.date', '2026-11-02')
        ->assertJsonPath('data.weekday', 1)
        ->assertJsonPath('data.routine.name', 'Rutina 4 días')
        ->assertJsonPath('data.day.name', 'Lunes – Pecho')
        ->assertJsonPath('data.day.exercises.0.exercise.name', 'Press de banca')
        ->assertJsonPath('data.day.exercises.0.default_set_type', 'bilbo')
        ->assertJsonPath('data.day.exercises.0.last_performance.date', '2026-10-26')
        ->assertJsonPath('data.day.exercises.0.last_performance.sets.0.weight_kg', 42.5)
        ->assertJsonPath('data.days.*.name', ['Lunes – Pecho', 'Martes – Espalda']);
});

it('returns a null last performance when there is no history', function () {
    $this->travelTo(Carbon::parse('2026-11-02 15:00:00', 'UTC'));

    $this->getJson('/api/today')->assertJsonPath('data.day.exercises.0.last_performance', null);
});

it('returns no day on a rest day', function () {
    $this->travelTo(Carbon::parse('2026-11-04 15:00:00', 'UTC')); // miércoles

    $this->getJson('/api/today')
        ->assertOk()
        ->assertJsonPath('data.weekday', 3)
        ->assertJsonPath('data.routine.id', $this->routine->id)
        ->assertJsonPath('data.day', null);
});

it('returns nulls without an active routine of the user', function () {
    $this->routine->update(['is_active' => false]);
    Routine::factory()->create(['is_active' => true]);

    $this->getJson('/api/today')
        ->assertOk()
        ->assertJsonPath('data.routine', null)
        ->assertJsonPath('data.day', null)
        ->assertJsonPath('data.days', []);
});
