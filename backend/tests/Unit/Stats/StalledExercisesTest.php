<?php

use App\Enums\Equipment;
use App\Enums\SetType;
use App\Services\Stats\EffectiveLoadResolver;
use App\Services\Stats\OneRepMaxCalculator;
use App\Services\Stats\StalledExercisesService;

// Hoy 13/11/2026 → el período empieza el 16/10/2026.
const STALLED_TODAY = '2026-11-13';

function stalledService(): StalledExercisesService
{
    return new StalledExercisesService(new EffectiveLoadResolver, new OneRepMaxCalculator);
}

/** Una sesión (workoutId = fecha) con series [kg, reps, tipo?]. */
function stalledSession(string $date, array $sets, array $extra = []): array
{
    return array_map(fn (array $s) => statsSet([
        'workoutId' => $date.($extra['exerciseId'] ?? 1), 'date' => $date, 'weightKg' => (float) $s[0], 'reps' => $s[1],
        'setType' => $s[2] ?? SetType::Normal, ...$extra,
    ]), $sets);
}

/** @param list<array<int, mixed>> $sessions */
function stalledRun(array $sessions, array $active = [1 => Equipment::Barbell]): array
{
    return stalledService()->stalled(collect(array_merge(...$sessions)), $active, STALLED_TODAY);
}

$plateau = fn () => [
    stalledSession('2026-10-02', [[100, 5]]),
    stalledSession('2026-10-20', [[95, 5]]),
    stalledSession('2026-10-27', [[100, 5]]),
    stalledSession('2026-11-03', [[40, 10, SetType::Warmup], [97.5, 5]]),
];

it('flags an exercise without a new best e1RM in four weeks', function () use ($plateau) {
    expect(stalledRun($plateau()))->toBe([[
        'exercise_id' => 1,
        'name' => 'Press de banca',
        'best_e1rm_kg' => 116.67,
        'best_date' => '2026-10-02',
        'sessions_since' => 3,
        'deload_kg' => 87.5,
    ]]);
});

it('does not flag a new record inside the window', function () use ($plateau) {
    expect(stalledRun([...$plateau(), stalledSession('2026-11-10', [[102.5, 5]])]))->toBe([]);
});

it('needs three sessions in the window', function () {
    expect(stalledRun([
        stalledSession('2026-10-02', [[100, 5]]),
        stalledSession('2026-10-20', [[95, 5]]),
        stalledSession('2026-11-03', [[97.5, 5]]),
    ]))->toBe([]);
});

it('needs history before the window', function () {
    expect(stalledRun([
        stalledSession('2026-10-20', [[100, 5]]),
        stalledSession('2026-10-27', [[95, 5]]),
        stalledSession('2026-11-03', [[97.5, 5]]),
    ]))->toBe([]);
});

it('dates the record the first time it was reached', function () {
    $result = stalledRun([
        stalledSession('2026-09-01', [[100, 5]]),
        stalledSession('2026-10-02', [[100, 5]]),
        stalledSession('2026-10-20', [[95, 5]]),
        stalledSession('2026-10-27', [[95, 5]]),
        stalledSession('2026-11-03', [[95, 5]]),
    ]);

    expect($result[0]['best_date'])->toBe('2026-09-01')
        ->and($result[0]['sessions_since'])->toBe(4);
});

it('ignores sessions without an e1RM', function () use ($plateau) {
    $result = stalledRun([...$plateau(), stalledSession('2026-11-10', [[45, 31, SetType::Bilbo]])]);

    expect($result[0]['sessions_since'])->toBe(3);
});

it('rounds the deload down to the equipment step', function (Equipment $equipment, float $lastKg, float $deload) {
    $result = stalledRun([
        stalledSession('2026-10-02', [[$lastKg + 20, 5]]),
        stalledSession('2026-10-20', [[$lastKg, 5]]),
        stalledSession('2026-10-27', [[$lastKg, 5]]),
        stalledSession('2026-11-03', [[$lastKg, 5]]),
    ], [1 => $equipment]);

    expect($result[0]['deload_kg'])->toBe($deload);
})->with([
    'barra 82,5' => [Equipment::Barbell, 82.5, 72.5],
    'barra 80' => [Equipment::Barbell, 80.0, 70.0],
    'mancuernas 30' => [Equipment::Dumbbell, 30.0, 25.0],
    'máquina 55' => [Equipment::Machine, 55.0, 45.0],
    'kettlebell 24' => [Equipment::Kettlebell, 24.0, 20.0],
]);

it('has no deload weight for bodyweight exercises and bands', function () {
    $sessions = fn (array $extra) => [
        stalledSession('2026-10-02', [[20, 5]], $extra),
        stalledSession('2026-10-20', [[10, 5]], $extra),
        stalledSession('2026-10-27', [[10, 5]], $extra),
        stalledSession('2026-11-03', [[10, 5]], $extra),
    ];

    expect(stalledRun($sessions(['usesBodyweight' => true, 'bodyweightKg' => 80.0]), [1 => Equipment::Bodyweight])[0]['deload_kg'])->toBeNull()
        ->and(stalledRun($sessions([]), [1 => Equipment::Band])[0]['deload_kg'])->toBeNull();
});

it('only looks at active exercises and lists the oldest plateau first', function () use ($plateau) {
    $squat = ['exerciseId' => 2, 'exerciseName' => 'Sentadilla'];
    $row = ['exerciseId' => 3, 'exerciseName' => 'Remo'];
    $sessions = [
        ...$plateau(),
        stalledSession('2026-09-15', [[120, 5]], $squat),
        stalledSession('2026-10-20', [[110, 5]], $squat),
        stalledSession('2026-10-27', [[110, 5]], $squat),
        stalledSession('2026-11-03', [[110, 5]], $squat),
        stalledSession('2026-09-01', [[60, 8]], $row),
        stalledSession('2026-10-20', [[50, 8]], $row),
        stalledSession('2026-10-27', [[50, 8]], $row),
        stalledSession('2026-11-03', [[50, 8]], $row),
    ];

    $result = stalledRun($sessions, [1 => Equipment::Barbell, 2 => Equipment::Barbell]);

    expect(array_column($result, 'name'))->toBe(['Sentadilla', 'Press de banca']);
});
