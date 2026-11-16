<?php

namespace App\Services\Stats;

use App\Enums\ExerciseKind;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

final class OverviewService
{
    private const RECENT_RECORDS = 5;

    public function __construct(
        private readonly PersonalRecordsService $records,
        private readonly ConsistencyService $consistency,
        private readonly CardioService $cardio = new CardioService,
    ) {}

    /**
     * @param  Collection<int, SetRow>  $sets  every set of the user
     * @param  list<string>  $workoutDates  oldest first
     * @param  Collection<int, CardioRow>|null  $cardio  every cardio segment of the user
     * @return array<string, mixed>
     */
    public function overview(Collection $sets, array $workoutDates, CarbonImmutable $today, ?string $from, ?Collection $cardio = null): array
    {
        $cardio ??= new Collection;
        $inPeriod = fn (string $date) => $from === null || $date >= $from;
        $working = $sets->reject(fn (SetRow $set) => $set->isWarmup());
        $sessions = count(array_filter($workoutDates, $inPeriod));
        $weeks = StatsCalendar::periodWeeks($from, $today->toDateString(), $workoutDates[0] ?? null);

        return [
            'sessions' => $sessions,
            'sessions_per_week' => round($sessions / $weeks, 1),
            'effective_sets' => $working->filter(fn (SetRow $set) => $inPeriod($set->date))->count(),
            'streak_weeks' => $this->consistency->streak($workoutDates, $today),
            'recent_records' => $this->recentRecords($sets, $inPeriod),
            'cardio' => $this->cardio->summary($cardio, $from),
            'exercises' => $this->exercises($working, ExerciseKind::Strength)
                ->concat($this->exercises($cardio, ExerciseKind::Cardio))
                ->sortBy('name')
                ->values()
                ->all(),
        ];
    }

    /**
     * Every exercise with history (strength sets or cardio segments) and how many sessions it has.
     *
     * @param  Collection<int, SetRow|CardioRow>  $rows
     * @return Collection<int, array{id: int, name: string, sessions: int, kind: string}>
     */
    private function exercises(Collection $rows, ExerciseKind $kind): Collection
    {
        return $rows
            ->groupBy('exerciseId')
            ->map(fn (Collection $exerciseRows) => [
                'id' => $exerciseRows->first()->exerciseId,
                'name' => $exerciseRows->first()->exerciseName,
                'sessions' => $exerciseRows->pluck('workoutId')->unique()->count(),
                'kind' => $kind->value,
            ])
            ->values();
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
