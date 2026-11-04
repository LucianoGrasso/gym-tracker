<?php

namespace App\Services\Stats;

use Carbon\CarbonImmutable;

final class ConsistencyService
{
    /**
     * @param  list<string>  $workoutDates  local date of every session (one entry per session)
     * @return array{streak_weeks: int, weeks: list<array{week_start: string, sessions: int}>, days: list<array{date: string, sessions: int}>}
     */
    public function summary(array $workoutDates, CarbonImmutable $today, ?string $from): array
    {
        $todayDate = $today->toDateString();
        $perDay = array_count_values($workoutDates);
        ksort($perDay);

        $perWeek = [];
        foreach ($perDay as $date => $sessions) {
            $week = StatsCalendar::weekStart((string) $date);
            $perWeek[$week] = ($perWeek[$week] ?? 0) + $sessions;
        }

        $currentWeek = StatsCalendar::weekStart($todayDate);
        $firstWeek = match (true) {
            $from !== null => StatsCalendar::weekStart($from),
            $perDay !== [] => StatsCalendar::weekStart((string) array_key_first($perDay)),
            default => $currentWeek,
        };

        $weeks = array_map(
            fn (string $week) => ['week_start' => $week, 'sessions' => $perWeek[$week] ?? 0],
            StatsCalendar::weeks($firstWeek, $currentWeek),
        );

        $days = [];
        foreach ($perDay as $date => $sessions) {
            $date = (string) $date;
            if (($from === null || $date >= $from) && $date <= $todayDate) {
                $days[] = ['date' => $date, 'sessions' => $sessions];
            }
        }

        return ['streak_weeks' => $this->streak($workoutDates, $today), 'weeks' => $weeks, 'days' => $days];
    }

    /**
     * Consecutive weeks with at least one session, ending this week (or last week, while this one is still empty).
     *
     * @param  list<string>  $workoutDates
     */
    public function streak(array $workoutDates, CarbonImmutable $today): int
    {
        $activeWeeks = array_flip(array_map(StatsCalendar::weekStart(...), $workoutDates));

        $week = CarbonImmutable::parse(StatsCalendar::weekStart($today->toDateString()));
        if (! isset($activeWeeks[$week->toDateString()])) {
            $week = $week->subWeek();
        }

        $streak = 0;
        while (isset($activeWeeks[$week->toDateString()])) {
            $streak++;
            $week = $week->subWeek();
        }

        return $streak;
    }
}
