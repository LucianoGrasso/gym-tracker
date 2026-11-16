<?php

use App\Services\Stats\CardioRow;
use App\Services\Stats\CardioService;

function cardioRow(array $overrides = []): CardioRow
{
    $data = array_merge([
        'workoutId' => 'w1', 'date' => '2026-11-11', 'exerciseId' => 1, 'exerciseName' => 'Caminata',
        'durationSeconds' => 1800, 'speedKmh' => null, 'inclinePct' => null, 'distanceKm' => null,
        'avgHeartRate' => null, 'calories' => null,
    ], $overrides);

    return new CardioRow(...$data);
}

it('summarizes minutes, sessions and distance of the period', function () {
    $rows = collect([
        cardioRow(['workoutId' => 'old', 'date' => '2026-09-01', 'durationSeconds' => 3600, 'distanceKm' => 5.0]),
        cardioRow(['workoutId' => 'w1', 'durationSeconds' => 600, 'distanceKm' => 1.2]),
        cardioRow(['workoutId' => 'w1', 'durationSeconds' => 1530]),
        cardioRow(['workoutId' => 'w2', 'date' => '2026-11-13', 'durationSeconds' => 2100, 'distanceKm' => 3.25]),
    ]);

    expect((new CardioService)->summary($rows, '2026-10-16'))
        ->toBe(['minutes' => 71, 'sessions' => 2, 'distance_km' => 4.45]);
});

it('summarizes an empty period with zeros', function () {
    expect((new CardioService)->summary(collect(), null))->toBe(['minutes' => 0, 'sessions' => 0, 'distance_km' => 0.0]);
});

it('weights the averages by duration, skipping segments without the value', function () {
    $rows = collect([
        cardioRow(['durationSeconds' => 600, 'speedKmh' => 8.0, 'inclinePct' => 1.0, 'avgHeartRate' => 160, 'calories' => 100, 'distanceKm' => 1.3]),
        cardioRow(['durationSeconds' => 1800, 'speedKmh' => 5.0, 'inclinePct' => 12.0, 'calories' => 200]),
        cardioRow(['durationSeconds' => 900]),
    ]);

    expect((new CardioService)->progress($rows, null))->toBe([[
        'workout_id' => 'w1', 'date' => '2026-11-11', 'minutes' => 55.0, 'distance_km' => 1.3, 'calories' => 300,
        'avg_speed_kmh' => 5.8, 'avg_incline_pct' => 9.3, 'avg_heart_rate' => 160,
    ]]);
});

it('gives one entry per session in order, with nulls when nothing was recorded', function () {
    $rows = collect([
        cardioRow(['workoutId' => 'a', 'date' => '2026-11-04', 'durationSeconds' => 1200]),
        cardioRow(['workoutId' => 'b', 'date' => '2026-11-11', 'durationSeconds' => 2100, 'inclinePct' => 12.0]),
    ]);

    $progress = (new CardioService)->progress($rows, '2026-11-01');

    expect(array_column($progress, 'workout_id'))->toBe(['a', 'b'])
        ->and($progress[0])->toMatchArray(['minutes' => 20.0, 'distance_km' => null, 'calories' => null, 'avg_incline_pct' => null])
        ->and($progress[1]['avg_incline_pct'])->toBe(12.0);
});
