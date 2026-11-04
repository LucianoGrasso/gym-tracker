<?php

namespace App\Services\Stats;

use App\Enums\SetType;
use Illuminate\Support\Collection;

final class ExerciseProgressService
{
    public function __construct(
        private readonly EffectiveLoadResolver $loads,
        private readonly OneRepMaxCalculator $oneRepMax,
        private readonly VolumeCalculator $volume,
        private readonly PersonalRecordsService $records,
    ) {}

    /**
     * Per-session series since $from (all time when null) plus all-time records.
     *
     * @param  Collection<int, SetRow>  $sets  every set of one exercise
     * @return array{sessions: list<array<string, mixed>>, records: array<string, mixed>}
     */
    public function progress(Collection $sets, ?string $from): array
    {
        $sessions = $sets
            ->filter(fn (SetRow $set) => $from === null || $set->date >= $from)
            ->groupBy('workoutId')
            ->map(fn (Collection $sessionSets) => $this->session($sessionSets))
            ->filter()
            ->sortBy('date')
            ->values()
            ->all();

        return ['sessions' => $sessions, 'records' => $this->records->records($sets)];
    }

    /**
     * @param  Collection<int, SetRow>  $sets
     * @return array<string, mixed>|null null when the session only has warmups
     */
    private function session(Collection $sets): ?array
    {
        $working = $sets->reject(fn (SetRow $set) => $set->isWarmup());
        if ($working->isEmpty()) {
            return null;
        }

        $loaded = $working
            ->map(fn (SetRow $set) => ['load' => $this->loads->load($set), 'reps' => $set->reps])
            ->filter(fn (array $entry) => $entry['load'] !== null);
        $bestLoad = $loaded->max('load');

        $first = $sets->first();

        return [
            'workout_id' => $first->workoutId,
            'date' => $first->date,
            'e1rm_kg' => $working
                ->map(fn (SetRow $set) => $this->oneRepMax->forSet($set, $this->loads->load($set)))
                ->filter(fn (?float $value) => $value !== null)
                ->max(),
            'best_load_kg' => $bestLoad,
            'best_load_reps' => $bestLoad === null ? null : $loaded->where('load', $bestLoad)->max('reps'),
            'volume_kg' => $this->volume->volume($sets),
            'total_reps' => $this->volume->totalReps($sets),
            'bilbo' => $working
                ->filter(fn (SetRow $set) => $set->setType === SetType::Bilbo)
                ->map(fn (SetRow $set) => ['load_kg' => $this->loads->load($set), 'reps' => $set->reps])
                ->values()
                ->all(),
        ];
    }
}
