<?php

use App\Enums\MuscleGroup;
use App\Enums\SetType;
use App\Models\BodyMetric;
use App\Models\Exercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;

/** Sesión con un ejercicio y series [kg, reps, tipo]. */
function statsWorkout(User $user, Exercise $exercise, string $date, array $sets, ?float $bodyweight = null): Workout
{
    $workout = Workout::factory()->for($user)->create(['date' => $date, 'bodyweight_kg' => $bodyweight]);
    $item = WorkoutExercise::factory()->create(['workout_id' => $workout->id, 'exercise_id' => $exercise->id]);
    foreach ($sets as $i => [$kg, $reps, $type]) {
        WorkoutSet::factory()->create([
            'workout_exercise_id' => $item->id, 'set_number' => $i + 1,
            'weight_kg' => $kg, 'reps' => $reps, 'set_type' => $type,
        ]);
    }

    return $workout;
}

beforeEach(function () {
    // Domingo 08/11 a las 23:00 en Santiago (ya es lunes en UTC): la semana actual empieza el 02/11.
    $this->travelTo(new DateTimeImmutable('2026-11-09T02:00:00Z'));
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->bench = Exercise::factory()->for($this->user)->create(['name' => 'Press de banca', 'muscle_group' => MuscleGroup::Chest]);
});

it('returns the progress of an exercise with its records, archived or not', function () {
    statsWorkout($this->user, $this->bench, '2026-08-03', [[90, 3, SetType::Normal]]);
    statsWorkout($this->user, $this->bench, '2026-10-26', [[40, 10, SetType::Warmup], [80, 8, SetType::Normal], [45, 31, SetType::Bilbo]]);
    $this->bench->update(['archived_at' => now()]);

    $this->getJson("/api/stats/exercises/{$this->bench->id}?period=1m")
        ->assertOk()
        ->assertJsonPath('data.period', '1m')
        ->assertJsonPath('data.exercise.name', 'Press de banca')
        ->assertJsonCount(1, 'data.sessions')
        ->assertJsonPath('data.sessions.0.date', '2026-10-26')
        ->assertJsonPath('data.sessions.0.e1rm_kg', 101.33)
        ->assertJsonPath('data.sessions.0.total_reps', 39)
        ->assertJsonPath('data.sessions.0.bilbo.0.reps', 31)
        ->assertJsonPath('data.records.heaviest.load_kg', 90.0)
        ->assertJsonPath('data.records.heaviest.date', '2026-08-03');
});

it('hides the stats of an exercise of another user', function () {
    $this->getJson('/api/stats/exercises/'.Exercise::factory()->create()->id)->assertNotFound();
});

it('validates the period', function (string $period) {
    $this->getJson("/api/stats/overview?period={$period}")
        ->assertStatus(422)
        ->assertJsonValidationErrors(['period']);
})->with(['2w', '4w', '12w']);

it('uses one month by default', function () {
    $this->getJson('/api/stats/overview')->assertOk()->assertJsonPath('data.period', '1m');
});

it('summarizes the period with only own data', function () {
    statsWorkout($this->user, $this->bench, '2026-10-27', [[100, 5, SetType::Normal]]);
    statsWorkout($this->user, $this->bench, '2026-11-08', [[80, 5, SetType::Normal]]);
    statsWorkout(User::factory()->create(), Exercise::factory()->create(), '2026-11-08', [[200, 5, SetType::Normal]]);

    $this->getJson('/api/stats/overview?period=1m')
        ->assertOk()
        ->assertJsonPath('data.sessions', 2)
        ->assertJsonPath('data.effective_sets', 2)
        ->assertJsonMissingPath('data.total_volume_kg')
        ->assertJsonPath('data.streak_weeks', 2)
        ->assertJsonPath('data.exercises.0.name', 'Press de banca')
        ->assertJsonPath('data.recent_records.0.type', 'heaviest');
});

it('returns the weekly sets per muscle with only own data', function () {
    statsWorkout($this->user, $this->bench, '2026-11-02', [[40, 10, SetType::Warmup], [100, 5, SetType::Normal], [100, 5, SetType::Normal]]);
    statsWorkout(User::factory()->create(), Exercise::factory()->create(['muscle_group' => MuscleGroup::Chest]), '2026-11-02', [[200, 5, SetType::Normal]]);

    $this->getJson('/api/stats/muscles?period=1w')
        ->assertOk()
        ->assertJsonPath('data.period', '1w')
        ->assertJsonPath('data.weeks', 1.0)
        ->assertJsonCount(12, 'data.muscles')
        ->assertJsonPath('data.muscles.0', ['muscle' => 'chest', 'sets' => 2.0, 'sets_per_week' => 2.0, 'status' => 'low']);
});

it('no longer offers the weekly volume in kilos', function () {
    $this->getJson('/api/stats/weekly-volume')->assertNotFound();
});

it('uses the Santiago calendar for the consistency', function () {
    statsWorkout($this->user, $this->bench, '2026-11-08', [[80, 5, SetType::Normal]]);

    $this->getJson('/api/stats/consistency?period=1m')
        ->assertOk()
        ->assertJsonPath('data.streak_weeks', 1)
        ->assertJsonCount(5, 'data.weeks')
        ->assertJsonPath('data.weeks.4', ['week_start' => '2026-11-02', 'sessions' => 1])
        ->assertJsonPath('data.days', [['date' => '2026-11-08', 'sessions' => 1]]);
});

it('returns the bodyweight series', function () {
    BodyMetric::factory()->for($this->user)->create(['date' => '2026-10-20', 'bodyweight_kg' => 79]);
    statsWorkout($this->user, $this->bench, '2026-11-02', [[100, 5, SetType::Normal]], 78.5);

    $this->getJson('/api/stats/bodyweight?period=1m')
        ->assertOk()
        ->assertJsonPath('data.points', [
            ['date' => '2026-10-20', 'bodyweight_kg' => 79.0, 'source' => 'metric'],
            ['date' => '2026-11-02', 'bodyweight_kg' => 78.5, 'source' => 'workout'],
        ]);
});

function stalledBench(User $user, Exercise $bench): void
{
    $bench->update(['equipment' => App\Enums\Equipment::Barbell]);
    statsWorkout($user, $bench, '2026-10-01', [[100, 5, SetType::Normal]]);
    statsWorkout($user, $bench, '2026-10-15', [[100, 5, SetType::Normal]]);
    statsWorkout($user, $bench, '2026-10-25', [[95, 5, SetType::Normal]]);
    statsWorkout($user, $bench, '2026-11-05', [[97.5, 5, SetType::Normal]]);
}

it('lists the stalled exercises of the user', function () {
    stalledBench($this->user, $this->bench);
    $other = User::factory()->create();
    stalledBench($other, Exercise::factory()->for($other)->create());

    $this->getJson('/api/stats/stalled')
        ->assertOk()
        ->assertJsonCount(1, 'data.exercises')
        ->assertJsonPath('data.exercises.0.name', 'Press de banca')
        ->assertJsonPath('data.exercises.0.best_date', '2026-10-01')
        ->assertJsonPath('data.exercises.0.sessions_since', 3)
        ->assertJsonPath('data.exercises.0.deload_kg', 87.5);
});

it('leaves archived exercises out of the stalled list', function () {
    stalledBench($this->user, $this->bench);
    $this->bench->update(['archived_at' => now()]);

    $this->getJson('/api/stats/stalled')->assertOk()->assertJsonCount(0, 'data.exercises');
});

it('requires a session for the stalled list', function () {
    $this->app['auth']->forgetGuards();

    $this->getJson('/api/stats/stalled')->assertUnauthorized();
});

it('tells whether an exercise is stalled in its stats', function () {
    $this->getJson("/api/stats/exercises/{$this->bench->id}")->assertOk()->assertJsonPath('data.stalled', null);

    stalledBench($this->user, $this->bench);

    $this->getJson("/api/stats/exercises/{$this->bench->id}")
        ->assertOk()
        ->assertJsonPath('data.stalled.best_date', '2026-10-01')
        ->assertJsonPath('data.stalled.deload_kg', 87.5);
});
