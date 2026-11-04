<?php

namespace App\Services\Stats;

use App\Enums\MuscleGroup;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

final class WeeklyMuscleVolumeService
{
    public function __construct(private readonly VolumeCalculator $volume) {}

    /**
     * @param  Collection<int, SetRow>  $sets
     * @return array{muscle_groups: list<string>, weeks: list<array{week_start: string, volumes: array<string, float>}>}
     */
    public function weekly(Collection $sets, CarbonImmutable $today, ?string $from, ?MuscleGroup $only = null): array
    {
        $groups = $only !== null ? [$only] : MuscleGroup::cases();
        $relevant = $sets->filter(
            fn (SetRow $set) => ($from === null || $set->date >= $from) && ($only === null || $set->muscleGroup === $only)
        );

        $currentWeek = StatsCalendar::weekStart($today->toDateString());
        $firstWeek = match (true) {
            $from !== null => StatsCalendar::weekStart($from),
            $relevant->isNotEmpty() => StatsCalendar::weekStart($relevant->min('date')),
            default => $currentWeek,
        };
        $byWeek = $relevant->groupBy(fn (SetRow $set) => StatsCalendar::weekStart($set->date));

        $weeks = array_map(function (string $week) use ($byWeek, $groups) {
            $weekSets = $byWeek->get($week, collect());
            $volumes = [];
            foreach ($groups as $group) {
                $volumes[$group->value] = $this->volume->volume(
                    $weekSets->filter(fn (SetRow $set) => $set->muscleGroup === $group)
                );
            }

            return ['week_start' => $week, 'volumes' => $volumes];
        }, StatsCalendar::weeks($firstWeek, $currentWeek));

        return ['muscle_groups' => array_map(fn (MuscleGroup $group) => $group->value, $groups), 'weeks' => $weeks];
    }
}
