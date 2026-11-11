<?php

namespace App\Services\Stats;

use App\Enums\MuscleGroup;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/** Effective sets per week of every muscle, compared with the usual hypertrophy range (10–20 per week). */
final class MuscleSetsService
{
    public const RANGE_MIN = 10;

    public const RANGE_MAX = 20;

    /** Un músculo secundario recibe media serie. */
    public const SECONDARY_WEIGHT = 0.5;

    /**
     * @param  Collection<int, SetRow>  $sets  every set of the user
     * @param  list<string>  $workoutDates  oldest first
     * @return array{weeks: float, muscles: list<array{muscle: string, sets: float, sets_per_week: float, status: string}>}
     */
    public function summary(Collection $sets, array $workoutDates, CarbonImmutable $today, ?string $from): array
    {
        $weeks = StatsCalendar::periodWeeks($from, $today->toDateString(), $workoutDates[0] ?? null);
        $perMuscle = [];
        foreach ($sets as $set) {
            if ($set->isWarmup() || ($from !== null && $set->date < $from)) {
                continue;
            }
            $perMuscle[$set->muscleGroup->value] = ($perMuscle[$set->muscleGroup->value] ?? 0) + 1;
            foreach ($set->secondaryMuscles as $secondary) {
                $perMuscle[$secondary->value] = ($perMuscle[$secondary->value] ?? 0) + self::SECONDARY_WEIGHT;
            }
        }

        $muscles = array_map(function (MuscleGroup $muscle) use ($perMuscle, $weeks) {
            $count = round((float) ($perMuscle[$muscle->value] ?? 0), 1);
            $perWeek = round($count / $weeks, 1);

            return ['muscle' => $muscle->value, 'sets' => $count, 'sets_per_week' => $perWeek, 'status' => self::status($perWeek)];
        }, MuscleGroup::cases());

        return ['weeks' => round($weeks, 1), 'muscles' => $muscles];
    }

    /** none · low (< 10) · in_range (10–20) · high (> 20) */
    public static function status(float $setsPerWeek): string
    {
        return match (true) {
            $setsPerWeek <= 0 => 'none',
            $setsPerWeek < self::RANGE_MIN => 'low',
            $setsPerWeek <= self::RANGE_MAX => 'in_range',
            default => 'high',
        };
    }
}
