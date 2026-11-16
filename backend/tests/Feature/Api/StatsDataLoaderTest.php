<?php

use App\Enums\ExerciseKind;
use App\Enums\MuscleGroup;
use App\Enums\SetType;
use App\Models\BodyMetric;
use App\Models\Exercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use App\Services\Stats\CardioRow;
use App\Services\Stats\SetRow;
use App\Services\Stats\StatsDataLoader;

/** Crea una sesión con un ejercicio y sus series ([kg, reps, tipo]). */
function loggedWorkout(User $user, Exercise $exercise, string $date, array $sets, ?float $bodyweight = null): Workout
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
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

it('flattens own sets oldest first, resolving the bodyweight', function () {
    $pullUps = Exercise::factory()->for($this->user)->create([
        'name' => 'Dominadas', 'muscle_group' => MuscleGroup::Lats, 'uses_bodyweight' => true, 'archived_at' => now(),
        'secondary_muscles' => [MuscleGroup::Biceps],
    ]);
    BodyMetric::factory()->for($this->user)->create(['date' => '2026-10-01', 'bodyweight_kg' => 80]);
    loggedWorkout($this->user, $pullUps, '2026-10-08', [[5, 6, SetType::Normal]], 78.5);
    loggedWorkout($this->user, $pullUps, '2026-10-02', [[0, 8, SetType::Normal], [0, 7, SetType::Normal]]);
    loggedWorkout(User::factory()->create(), Exercise::factory()->create(), '2026-10-05', [[100, 5, SetType::Normal]]);

    $sets = app(StatsDataLoader::class)->sets();

    expect($sets)->toHaveCount(3)
        ->and($sets->first())->toBeInstanceOf(SetRow::class)
        ->and($sets->map(fn (SetRow $s) => [$s->date, $s->reps, $s->bodyweightKg])->all())->toBe([
            ['2026-10-02', 8, 80.0],
            ['2026-10-02', 7, 80.0],
            ['2026-10-08', 6, 78.5],
        ])
        ->and($sets->first()->exerciseName)->toBe('Dominadas')
        ->and($sets->first()->muscleGroup)->toBe(MuscleGroup::Lats)
        ->and($sets->first()->usesBodyweight)->toBeTrue()
        ->and($sets->first()->secondaryMuscles)->toBe([MuscleGroup::Biceps]);
});

it('filters by exercise and lists session dates and bodyweights', function () {
    $bench = Exercise::factory()->for($this->user)->create();
    $row = Exercise::factory()->for($this->user)->create();
    loggedWorkout($this->user, $bench, '2026-10-01', [[100, 5, SetType::Normal]], 80.0);
    loggedWorkout($this->user, $row, '2026-10-03', [[60, 10, SetType::Normal]]);
    BodyMetric::factory()->for($this->user)->create(['date' => '2026-10-02', 'bodyweight_kg' => 79.5]);

    $loader = app(StatsDataLoader::class);

    expect($loader->sets($bench->id))->toHaveCount(1)
        ->and($loader->workoutDates())->toBe(['2026-10-01', '2026-10-03'])
        ->and($loader->workoutBodyweights())->toBe(['2026-10-01' => 80.0])
        ->and($loader->bodyMetrics())->toBe(['2026-10-02' => 79.5]);
});

it('leaves cardio out of the strength sets', function () {
    $bench = Exercise::factory()->for($this->user)->create(['name' => 'Press de banca']);
    $walk = Exercise::factory()->for($this->user)->create(['name' => 'Caminata', 'kind' => ExerciseKind::Cardio, 'muscle_group' => MuscleGroup::Other]);
    loggedWorkout($this->user, $bench, '2026-11-10', [[60, 8, SetType::Normal]]);
    loggedWorkout($this->user, $walk, '2026-11-12', [[0, 0, SetType::Normal]]);

    $sets = app(StatsDataLoader::class)->sets();

    expect($sets)->toHaveCount(1)
        ->and($sets->first()->exerciseName)->toBe('Press de banca');
});

it('flattens own cardio segments, optionally for one exercise', function () {
    $walk = Exercise::factory()->for($this->user)->create(['name' => 'Caminata', 'kind' => ExerciseKind::Cardio, 'muscle_group' => MuscleGroup::Other]);
    $bike = Exercise::factory()->for($this->user)->create(['name' => 'Bicicleta', 'kind' => ExerciseKind::Cardio, 'muscle_group' => MuscleGroup::Other]);
    $bench = Exercise::factory()->for($this->user)->create(['name' => 'Press']);
    loggedWorkout($this->user, $bench, '2026-11-10', [[60, 8, SetType::Normal]]);
    $workout = loggedWorkout($this->user, $walk, '2026-11-11', [[0, 0, SetType::Normal]]);
    WorkoutSet::query()->update(['duration_seconds' => 2100, 'speed_kmh' => 5.5, 'incline_pct' => 12, 'distance_km' => 3.2, 'avg_heart_rate' => 128, 'calories' => 250]);
    loggedWorkout($this->user, $bike, '2026-11-12', [[0, 0, SetType::Normal]]);
    WorkoutSet::query()->whereNull('duration_seconds')->update(['duration_seconds' => 600]);
    $other = User::factory()->create();
    loggedWorkout($other, Exercise::factory()->for($other)->create(['kind' => ExerciseKind::Cardio]), '2026-11-12', [[0, 0, SetType::Normal]]);

    $loader = app(StatsDataLoader::class);
    $rows = $loader->cardioSegments();

    expect($rows->pluck('exerciseName')->all())->toBe(['Caminata', 'Bicicleta'])
        ->and($rows->first())->toEqual(new CardioRow(
            workoutId: $workout->id, date: '2026-11-11', exerciseId: $walk->id, exerciseName: 'Caminata',
            durationSeconds: 2100, speedKmh: 5.5, inclinePct: 12.0, distanceKm: 3.2, avgHeartRate: 128, calories: 250,
        ))
        ->and($loader->cardioSegments($bike->id)->pluck('exerciseName')->all())->toBe(['Bicicleta']);
});
