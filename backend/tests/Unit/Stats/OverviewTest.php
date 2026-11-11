<?php

use App\Enums\MuscleGroup;
use App\Enums\SetType;
use App\Services\Stats\BodyweightSeriesService;
use App\Services\Stats\ConsistencyService;
use App\Services\Stats\EffectiveLoadResolver;
use App\Services\Stats\MuscleSetsService;
use App\Services\Stats\OneRepMaxCalculator;
use App\Services\Stats\OverviewService;
use App\Services\Stats\PersonalRecordsService;
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

describe('MuscleSetsService', function () use ($today) {
    $muscles = new MuscleSetsService;

    it('averages the effective sets per week of every muscle', function () use ($muscles, $today) {
        $sets = collect([
            ...array_fill(0, 30, statsSet(['date' => '2026-10-28'])),
            statsSet(['date' => '2026-10-28', 'setType' => SetType::Warmup]),
            statsSet(['date' => '2026-10-21']),
            ...array_fill(0, 3, statsSet(['date' => '2026-11-03', 'muscleGroup' => MuscleGroup::Lats, 'setType' => SetType::Failure])),
        ]);

        // del 22/10 al 04/11: 14 días, 2 semanas
        $result = $muscles->summary($sets, ['2026-10-21', '2026-10-28', '2026-11-03'], $today, '2026-10-22');

        expect($result['weeks'])->toBe(2.0)
            ->and(array_column($result['muscles'], 'muscle'))->toBe(array_map(fn (MuscleGroup $g) => $g->value, MuscleGroup::cases()))
            ->and($result['muscles'][0])->toBe(['muscle' => 'chest', 'sets' => 30, 'sets_per_week' => 15.0, 'status' => 'in_range'])
            ->and($result['muscles'][1])->toBe(['muscle' => 'lats', 'sets' => 3, 'sets_per_week' => 1.5, 'status' => 'low'])
            ->and($result['muscles'][6])->toBe(['muscle' => 'quads', 'sets' => 0, 'sets_per_week' => 0.0, 'status' => 'none']);
    });

    it('counts all time from the first session', function () use ($muscles, $today) {
        // del 25/10 al 04/11: 11 días
        $result = $muscles->summary(collect([statsSet(['date' => '2026-10-25'])]), ['2026-10-25'], $today, null);

        expect($result['weeks'])->toBe(1.6)
            ->and($result['muscles'][0]['sets_per_week'])->toBe(0.6);
    });

    it('compares the weekly sets with the 10 to 20 range', function (float $perWeek, string $status) {
        expect(MuscleSetsService::status($perWeek))->toBe($status);
    })->with([[0.0, 'none'], [9.9, 'low'], [10.0, 'in_range'], [20.0, 'in_range'], [20.1, 'high']]);
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
            ->and($result)->not->toHaveKeys(['total_volume_kg', 'total_sets'])
            ->and($result['effective_sets'])->toBe(2)
            ->and($result['sessions_per_week'])->toBe(0.6) // 2 sesiones en 24 días
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
