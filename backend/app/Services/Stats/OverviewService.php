<?php

namespace App\Services\Stats;

use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

final class OverviewService
{
    private const RECENT_RECORDS = 5;

    public function __construct(
        private readonly VolumeCalculator $volume,
        private readonly PersonalRecordsService $records,
        private readonly ConsistencyService $consistency,
    ) {}

    /**
     * @param  Collection<int, SetRow>  $sets  every set of the user
     * @param  list<string>  $workoutDates
     * @return array<string, mixed>
     */
    public function overview(Collection $sets, array $workoutDates, CarbonImmutable $today, ?string $from): array
    {
        $inPeriod = fn (string $date) => $from === null || $date >= $from;
        $periodSets = $sets->filter(fn (SetRow $set) => $inPeriod($set->date));
        $working = $sets->reject(fn (SetRow $set) => $set->isWarmup());

        return [
            'sessions' => count(array_filter($workoutDates, $inPeriod)),
            'total_volume_kg' => $this->volume->volume($periodSets),
            'total_sets' => $periodSets->reject(fn (SetRow $set) => $set->isWarmup())->count(),
            'streak_weeks' => $this->consistency->streak($workoutDates, $today),
            'recent_records' => $this->recentRecords($sets, $inPeriod),
            'exercises' => $working
                ->groupBy('exerciseId')
                ->map(fn (Collection $exerciseSets) => [
                    'id' => $exerciseSets->first()->exerciseId,
                    'name' => $exerciseSets->first()->exerciseName,
                    'sessions' => $exerciseSets->pluck('workoutId')->unique()->count(),
                ])
                ->sortBy('name')
                ->values()
                ->all(),
        ];
    }

    /**
     * All-time records (heaviest load, best 1RM) first reached inside the period, newest first.
     *
     * @param  Collection<int, SetRow>  $sets
     * @return list<array<string, mixed>>
     */
    private function recentRecords(Collection $sets, callable $inPeriod): array
    {
        return $sets
            ->groupBy('exerciseId')
            ->flatMap(function (Collection $exerciseSets) use ($inPeriod) {
                $first = $exerciseSets->first();
                $records = $this->records->records($exerciseSets);
                $entries = [];
                foreach (['heaviest', 'best_e1rm'] as $type) {
                    $record = $records[$type];
                    if ($record !== null && $inPeriod($record['date'])) {
                        $entries[] = ['exercise_id' => $first->exerciseId, 'exercise_name' => $first->exerciseName, 'type' => $type, ...$record];
                    }
                }

                return $entries;
            })
            ->sortByDesc('date')
            ->take(self::RECENT_RECORDS)
            ->values()
            ->all();
    }
}
