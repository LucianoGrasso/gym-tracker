<?php

use App\Enums\SetType;
use App\Enums\StatsPeriod;
use App\Services\Stats\BodyweightTimeline;
use App\Services\Stats\EffectiveLoadResolver;
use App\Services\Stats\OneRepMaxCalculator;
use App\Services\Stats\StatsCalendar;
use App\Services\Stats\VolumeCalculator;
use Carbon\CarbonImmutable;

describe('StatsPeriod', function () {
    it('is a rolling window that ends today', function () {
        $today = CarbonImmutable::parse('2026-11-04'); // miércoles

        expect(StatsPeriod::OneWeek->startDate($today)->toDateString())->toBe('2026-10-29')
            ->and(StatsPeriod::OneMonth->startDate($today)->toDateString())->toBe('2026-10-05')
            ->and(StatsPeriod::ThreeMonths->startDate($today)->toDateString())->toBe('2026-08-05')
            ->and(StatsPeriod::SixMonths->startDate($today)->toDateString())->toBe('2026-05-05')
            ->and(StatsPeriod::OneYear->startDate($today)->toDateString())->toBe('2025-11-05')
            ->and(StatsPeriod::All->startDate($today))->toBeNull();
    });

    it('does not overflow short months', function () {
        expect(StatsPeriod::OneMonth->startDate(CarbonImmutable::parse('2026-03-31'))->toDateString())->toBe('2026-03-01');
    });
});

describe('StatsCalendar', function () {
    it('counts the weeks of a period, at least one', function () {
        expect(StatsCalendar::periodWeeks('2026-10-29', '2026-11-04', null))->toBe(1.0)
            ->and(StatsCalendar::periodWeeks('2026-10-05', '2026-11-04', null))->toBe(31 / 7)
            ->and(StatsCalendar::periodWeeks(null, '2026-11-04', '2026-10-22'))->toBe(2.0)
            ->and(StatsCalendar::periodWeeks(null, '2026-11-04', '2026-11-04'))->toBe(1.0)
            ->and(StatsCalendar::periodWeeks(null, '2026-11-04', null))->toBe(1.0);
    });

    it('finds the monday of the week, sunday included', function () {
        expect(StatsCalendar::weekStart('2026-11-08'))->toBe('2026-11-02')
            ->and(StatsCalendar::weekStart('2026-11-09'))->toBe('2026-11-09')
            ->and(StatsCalendar::weekStart('2026-11-02 00:00:00'))->toBe('2026-11-02');
    });

    it('lists the weeks between two mondays', function () {
        expect(StatsCalendar::weeks('2026-10-19', '2026-11-02'))->toBe(['2026-10-19', '2026-10-26', '2026-11-02'])
            ->and(StatsCalendar::weeks('2026-11-02', '2026-11-02'))->toBe(['2026-11-02']);
    });
});

describe('BodyweightTimeline', function () {
    $timeline = new BodyweightTimeline(['2026-10-20' => 79.0, '2026-10-01' => 80.0]);

    it('prefers the bodyweight logged in the session', function () use ($timeline) {
        expect($timeline->at('2026-10-25', 78.5))->toBe(78.5);
    });

    it('falls back to the latest metric on or before the date', function () use ($timeline) {
        expect($timeline->at('2026-10-20', null))->toBe(79.0)
            ->and($timeline->at('2026-10-19', null))->toBe(80.0);
    });

    it('is unknown before the first metric', function () use ($timeline) {
        expect($timeline->at('2026-09-30', null))->toBeNull();
    });
});

describe('EffectiveLoadResolver', function () {
    $loads = new EffectiveLoadResolver;

    it('uses the weight for regular exercises', function () use ($loads) {
        expect($loads->load(statsSet(['weightKg' => 42.5])))->toBe(42.5);
    });

    it('adds the bodyweight for bodyweight exercises', function () use ($loads) {
        expect($loads->load(statsSet(['usesBodyweight' => true, 'weightKg' => 10.0, 'bodyweightKg' => 78.0])))->toBe(88.0);
    });

    it('is unknown when the bodyweight is unknown', function () use ($loads) {
        expect($loads->load(statsSet(['usesBodyweight' => true, 'weightKg' => 0.0])))->toBeNull();
    });
});

describe('OneRepMaxCalculator', function () {
    $oneRepMax = new OneRepMaxCalculator;

    it('applies epley and returns the load for a single', function () use ($oneRepMax) {
        expect($oneRepMax->epley(100, 5))->toBe(116.67)
            ->and($oneRepMax->epley(80, 8))->toBe(101.33)
            ->and($oneRepMax->epley(90, 1))->toBe(90.0);
    });

    it('only uses working sets of 1 to 12 reps that are not bilbo', function () use ($oneRepMax) {
        expect($oneRepMax->forSet(statsSet(['reps' => 12]), 60.0))->toBe(84.0)
            ->and($oneRepMax->forSet(statsSet(['reps' => 13]), 60.0))->toBeNull()
            ->and($oneRepMax->forSet(statsSet(['reps' => 0]), 60.0))->toBeNull()
            ->and($oneRepMax->forSet(statsSet(['setType' => SetType::Bilbo, 'reps' => 10]), 45.0))->toBeNull()
            ->and($oneRepMax->forSet(statsSet(['setType' => SetType::Warmup]), 40.0))->toBeNull()
            ->and($oneRepMax->forSet(statsSet(), null))->toBeNull();
    });
});

describe('VolumeCalculator', function () {
    $volume = new VolumeCalculator(new EffectiveLoadResolver);

    it('sums load × reps of working sets, skipping warmups and unknown loads', function () use ($volume) {
        $sets = [
            statsSet(['weightKg' => 40.0, 'reps' => 10, 'setType' => SetType::Warmup]),
            statsSet(['weightKg' => 100.0, 'reps' => 5]),
            statsSet(['weightKg' => 100.0, 'reps' => 4]),
            statsSet(['usesBodyweight' => true, 'weightKg' => 0.0, 'reps' => 8]),
        ];

        expect($volume->volume($sets))->toBe(900.0)
            ->and($volume->totalReps($sets))->toBe(17);
    });

    it('adds left and right sides separately with their per-hand weight', function () use ($volume) {
        $sets = [
            statsSet(['weightKg' => 20.0, 'reps' => 10]),
            statsSet(['weightKg' => 20.0, 'reps' => 9]),
        ];

        expect($volume->volume($sets))->toBe(380.0)
            ->and($volume->totalReps($sets))->toBe(19);
    });
});
