<?php

use App\Enums\SetType;
use App\Services\Stats\EffectiveLoadResolver;
use App\Services\Stats\ExerciseProgressService;
use App\Services\Stats\OneRepMaxCalculator;
use App\Services\Stats\PersonalRecordsService;
use App\Services\Stats\VolumeCalculator;

function progressService(): ExerciseProgressService
{
    $loads = new EffectiveLoadResolver;
    $oneRepMax = new OneRepMaxCalculator;

    return new ExerciseProgressService($loads, $oneRepMax, new VolumeCalculator($loads), new PersonalRecordsService($loads, $oneRepMax));
}

describe('PersonalRecordsService', function () {
    $records = new PersonalRecordsService(new EffectiveLoadResolver, new OneRepMaxCalculator);

    it('finds the heaviest load, most reps and best 1RM with the date first achieved', function () use ($records) {
        $result = $records->records([
            statsSet(['date' => '2026-10-01', 'weightKg' => 80.0, 'reps' => 8]),
            statsSet(['date' => '2026-10-08', 'weightKg' => 90.0, 'reps' => 2]),
            statsSet(['date' => '2026-10-15', 'weightKg' => 90.0, 'reps' => 3]),
            statsSet(['date' => '2026-10-15', 'weightKg' => 45.0, 'reps' => 31, 'setType' => SetType::Bilbo]),
            statsSet(['date' => '2026-10-20', 'weightKg' => 120.0, 'reps' => 1, 'setType' => SetType::Warmup]),
        ]);

        expect($result['heaviest'])->toBe(['load_kg' => 90.0, 'reps' => 2, 'date' => '2026-10-08'])
            ->and($result['most_reps'])->toBe(['reps' => 31, 'load_kg' => 45.0, 'date' => '2026-10-15'])
            ->and($result['best_e1rm'])->toBe(['e1rm_kg' => 101.33, 'load_kg' => 80.0, 'reps' => 8, 'date' => '2026-10-01']);
    });

    it('is empty without working sets', function () use ($records) {
        expect($records->records([statsSet(['setType' => SetType::Warmup])]))
            ->toBe(['heaviest' => null, 'most_reps' => null, 'best_e1rm' => null]);
    });

    it('counts reps of bodyweight sets even when the load is unknown', function () use ($records) {
        $result = $records->records([statsSet(['usesBodyweight' => true, 'weightKg' => 0.0, 'reps' => 6])]);

        expect($result['heaviest'])->toBeNull()
            ->and($result['best_e1rm'])->toBeNull()
            ->and($result['most_reps'])->toBe(['reps' => 6, 'load_kg' => null, 'date' => '2026-11-02']);
    });
});

describe('ExerciseProgressService', function () {
    it('summarizes each session in date order', function () {
        $sets = collect([
            statsSet(['workoutId' => 'a', 'date' => '2026-10-01', 'weightKg' => 40.0, 'reps' => 10, 'setType' => SetType::Warmup]),
            statsSet(['workoutId' => 'a', 'date' => '2026-10-01', 'weightKg' => 80.0, 'reps' => 8]),
            statsSet(['workoutId' => 'a', 'date' => '2026-10-01', 'weightKg' => 80.0, 'reps' => 6]),
            statsSet(['workoutId' => 'b', 'date' => '2026-10-08', 'weightKg' => 45.0, 'reps' => 31, 'setType' => SetType::Bilbo]),
            statsSet(['workoutId' => 'b', 'date' => '2026-10-08', 'weightKg' => 85.0, 'reps' => 5]),
        ]);

        $result = progressService()->progress($sets, null);

        expect($result['sessions'])->toBe([
            [
                'workout_id' => 'a', 'date' => '2026-10-01', 'e1rm_kg' => 101.33, 'best_load_kg' => 80.0,
                'best_load_reps' => 8, 'volume_kg' => 1120.0, 'total_reps' => 14, 'bilbo' => [],
            ],
            [
                'workout_id' => 'b', 'date' => '2026-10-08', 'e1rm_kg' => 99.17, 'best_load_kg' => 85.0,
                'best_load_reps' => 5, 'volume_kg' => 1820.0, 'total_reps' => 36,
                'bilbo' => [['load_kg' => 45.0, 'reps' => 31]],
            ],
        ])->and($result['records']['heaviest']['load_kg'])->toBe(85.0);
    });

    it('limits sessions to the period but keeps all-time records', function () {
        $sets = collect([
            statsSet(['workoutId' => 'old', 'date' => '2026-08-01', 'weightKg' => 95.0, 'reps' => 3]),
            statsSet(['workoutId' => 'new', 'date' => '2026-10-20', 'weightKg' => 85.0, 'reps' => 3]),
        ]);

        $result = progressService()->progress($sets, '2026-10-12');

        expect(array_column($result['sessions'], 'workout_id'))->toBe(['new'])
            ->and($result['records']['heaviest'])->toBe(['load_kg' => 95.0, 'reps' => 3, 'date' => '2026-08-01']);
    });

    it('skips sessions with only warmups and keeps reps when the bodyweight is unknown', function () {
        $sets = collect([
            statsSet(['workoutId' => 'w', 'date' => '2026-10-01', 'setType' => SetType::Warmup]),
            statsSet(['workoutId' => 'bw', 'date' => '2026-10-02', 'usesBodyweight' => true, 'weightKg' => 0.0, 'reps' => 6]),
        ]);

        expect(progressService()->progress($sets, null)['sessions'])->toBe([[
            'workout_id' => 'bw', 'date' => '2026-10-02', 'e1rm_kg' => null, 'best_load_kg' => null,
            'best_load_reps' => null, 'volume_kg' => 0.0, 'total_reps' => 6, 'bilbo' => [],
        ]]);
    });
});
