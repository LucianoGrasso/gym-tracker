<?php

namespace App\Services\Stats;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/** Monday-to-sunday weeks over local dates ("Y-m-d"). */
final class StatsCalendar
{
    public static function weekStart(string $date): string
    {
        return CarbonImmutable::parse(substr($date, 0, 10))
            ->startOfWeek(CarbonInterface::MONDAY)
            ->toDateString();
    }

    /** @return list<string> mondays from $firstWeek to $lastWeek, both included */
    public static function weeks(string $firstWeek, string $lastWeek): array
    {
        $weeks = [];
        for ($week = CarbonImmutable::parse($firstWeek); $week->toDateString() <= $lastWeek; $week = $week->addWeek()) {
            $weeks[] = $week->toDateString();
        }

        return $weeks;
    }

    /**
     * Weeks covered by a period, from its start (or the first session, for all time) to today, both included.
     * Never less than one, so a fresh period does not inflate the weekly averages.
     */
    public static function periodWeeks(?string $from, string $today, ?string $firstWorkout): float
    {
        $start = $from ?? $firstWorkout ?? $today;
        $days = CarbonImmutable::parse($start)->diffInDays(CarbonImmutable::parse($today)) + 1;

        return max(1.0, $days / 7);
    }
}
