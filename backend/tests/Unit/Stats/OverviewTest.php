<?php

use App\Enums\MuscleGroup;
use App\Enums\SetType;
use App\Services\Stats\BodyweightSeriesService;
use App\Services\Stats\ConsistencyService;
use App\Services\Stats\EffectiveLoadResolver;
use App\Services\Stats\OneRepMaxCalculator;
use App\Services\Stats\OverviewService;
use App\Services\Stats\PersonalRecordsService;
use App\Services\Stats\VolumeCalculator;
use App\Services\Stats\WeeklyMuscleVolumeService;
use Carbon\CarbonImmutable;

$today = CarbonImmutable::parse('2026-11-04'); // miércoles, semana del 02/11

describe('ConsistencyService', function () use ($today) {
    $consistency = new ConsistencyService;

    it('counts sessions per week and per day, zero-filling the weeks', function () use ($consistency, $today) {
        $result = $consistency->summary(['2026-10-12', '2026-10-14', '2026-10-14', '2026-10-27', '2026-11-03'], $today, '2026-10-12');

        expect($result['weeks'])->toBe([
            ['week_start' => '2026-10-12', 'sessions' => 3],
            ['week_start' => '2026-10-19', 'sessions' => 0],
            ['week_start' => '2026-10-26', 'sessions' => 1],
            ['week_start' => '2026-11-02', 'sessions' => 1],
        ])->and($result['days'])->toBe([
            ['date' => '2026-10-12', 'sessions' => 1],
            ['date' => '2026-10-14', 'sessions' => 2],
            ['date' => '2026-10-27', 'sessions' => 1],
            ['date' => '2026-11-03', 'sessions' => 1],
        ]);
    });

    it('counts the streak of weeks with sessions up to the current one', function () use ($consistency, $today) {
        expect($consistency->streak(['2026-10-12', '2026-10-27', '2026-11-03'], $today))->toBe(2);
    });

    it('does not break the streak because the current week has no session yet', function () use ($consistency, $today) {
        expect($consistency->streak(['2026-10-20', '2026-10-27'], $today))->toBe(2)
            ->and($consistency->streak([], $today))->toBe(0);
    });

    it('treats sunday as the end of the week', function () {
        $sunday = CarbonImmutable::parse('2026-11-08');

        expect((new ConsistencyService)->streak(['2026-11-08'], $sunday))->toBe(1);
    });
});

describe('WeeklyMuscleVolumeService', function () use ($today) {
    $weekly = new WeeklyMuscleVolumeService(new VolumeCalculator(new EffectiveLoadResolver));

    it('sums the volume per muscle group and week', function () use ($weekly, $today) {
        $sets = collect([
            statsSet(['date' => '2026-10-26', 'weightKg' => 100.0, 'reps' => 5]),
            statsSet(['date' => '2026-11-01', 'muscleGroup' => MuscleGroup::Lats, 'weightKg' => 60.0, 'reps' => 10]),
            statsSet(['date' => '2026-11-02', 'weightKg' => 50.0, 'reps' => 10, 'setType' => SetType::Warmup]),
            statsSet(['date' => '2026-11-03', 'weightKg' => 80.0, 'reps' => 5]),
        ]);

        $result = $weekly->weekly($sets, $today, '2026-10-26');

        expect($result['muscle_groups'])->toBe(['chest', 'lats', 'upper_back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'other'])
            ->and($result['weeks'][0]['week_start'])->toBe('2026-10-26')
            ->and($result['weeks'][0]['volumes']['chest'])->toBe(500.0)
            ->and($result['weeks'][0]['volumes']['lats'])->toBe(600.0)
            ->and($result['weeks'][1]['volumes']['chest'])->toBe(400.0)
            ->and($result['weeks'][1]['volumes']['quads'])->toBe(0.0);
    });

    it('can keep a single muscle group', function () use ($weekly, $today) {
        $result = $weekly->weekly(collect([statsSet(['date' => '2026-11-03'])]), $today, '2026-11-02', MuscleGroup::Chest);

        expect($result)->toBe([
            'muscle_groups' => ['chest'],
            'weeks' => [['week_start' => '2026-11-02', 'volumes' => ['chest' => 500.0]]],
        ]);
    });
});

describe('BodyweightSeriesService', function () {
    it('merges metrics and session bodyweights by date, preferring metrics', function () {
        $series = (new BodyweightSeriesService)->series(
            ['2026-10-20' => 79.0, '2026-10-01' => 80.0],
            ['2026-10-20' => 79.4, '2026-10-10' => 79.8],
            '2026-10-05',
        );

        expect($series)->toBe([
            ['date' => '2026-10-10', 'bodyweight_kg' => 79.8, 'source' => 'workout'],
            ['date' => '2026-10-20', 'bodyweight_kg' => 79.0, 'source' => 'metric'],
        ]);
    });
});

describe('OverviewService', function () use ($today) {
    $loads = new EffectiveLoadResolver;
    $overview = new OverviewService(
        new VolumeCalculator($loads),
        new PersonalRecordsService($loads, new OneRepMaxCalculator),
        new ConsistencyService,
    );

    it('summarizes the period with recent records and every exercise with history', function () use ($overview, $today) {
        $sets = collect([
            statsSet(['workoutId' => 'a', 'date' => '2026-08-03', 'weightKg' => 90.0, 'reps' => 3]),
            statsSet(['workoutId' => 'b', 'date' => '2026-10-27', 'weightKg' => 85.0, 'reps' => 5]),
            statsSet(['workoutId' => 'b', 'date' => '2026-10-27', 'exerciseId' => 2, 'exerciseName' => 'Dominadas', 'muscleGroup' => MuscleGroup::Lats, 'weightKg' => 60.0, 'reps' => 8]),
            statsSet(['workoutId' => 'c', 'date' => '2026-11-03', 'exerciseId' => 2, 'exerciseName' => 'Dominadas', 'muscleGroup' => MuscleGroup::Lats, 'weightKg' => 40.0, 'reps' => 10, 'setType' => SetType::Warmup]),
        ]);

        $result = $overview->overview($sets, ['2026-08-03', '2026-10-27', '2026-11-03'], $today, '2026-10-12');

        expect($result['sessions'])->toBe(2)
            ->and($result['total_volume_kg'])->toBe(905.0)
            ->and($result['total_sets'])->toBe(2)
            ->and($result['streak_weeks'])->toBe(2)
            ->and($result['exercises'])->toBe([
                ['id' => 2, 'name' => 'Dominadas', 'sessions' => 1],
                ['id' => 1, 'name' => 'Press de banca', 'sessions' => 2],
            ])
            ->and(array_map(fn ($r) => [$r['exercise_name'], $r['type']], $result['recent_records']))->toBe([
                ['Press de banca', 'best_e1rm'],
                ['Dominadas', 'heaviest'],
                ['Dominadas', 'best_e1rm'],
            ]);
    });
});
