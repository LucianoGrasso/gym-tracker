<?php

namespace App\Services\Stats;

final class PersonalRecordsService
{
    public function __construct(
        private readonly EffectiveLoadResolver $loads,
        private readonly OneRepMaxCalculator $oneRepMax,
    ) {}

    /**
     * Heaviest load, most reps (any load) and best estimated 1RM, each with the date it was first reached.
     *
     * @param  iterable<SetRow>  $sets
     * @return array{heaviest: ?array{load_kg: float, reps: int, date: string}, most_reps: ?array{reps: int, load_kg: ?float, date: string}, best_e1rm: ?array{e1rm_kg: float, load_kg: float, reps: int, date: string}}
     */
    public function records(iterable $sets): array
    {
        $heaviest = $mostReps = $bestE1rm = null;

        foreach (collect($sets)->sortBy('date') as $set) {
            if ($set->isWarmup()) {
                continue;
            }
            $load = $this->loads->load($set);

            if ($load !== null && ($heaviest === null || $load > $heaviest['load_kg'])) {
                $heaviest = ['load_kg' => $load, 'reps' => $set->reps, 'date' => $set->date];
            }
            if ($mostReps === null || $set->reps > $mostReps['reps']) {
                $mostReps = ['reps' => $set->reps, 'load_kg' => $load, 'date' => $set->date];
            }
            $e1rm = $this->oneRepMax->forSet($set, $load);
            if ($e1rm !== null && ($bestE1rm === null || $e1rm > $bestE1rm['e1rm_kg'])) {
                $bestE1rm = ['e1rm_kg' => $e1rm, 'load_kg' => $load, 'reps' => $set->reps, 'date' => $set->date];
            }
        }

        return ['heaviest' => $heaviest, 'most_reps' => $mostReps, 'best_e1rm' => $bestE1rm];
    }
}
