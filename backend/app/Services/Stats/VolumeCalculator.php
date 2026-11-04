<?php

namespace App\Services\Stats;

final class VolumeCalculator
{
    public function __construct(private readonly EffectiveLoadResolver $loads) {}

    /**
     * Σ load × reps of working sets with a known load (each side of a unilateral set counts on its own).
     *
     * @param  iterable<SetRow>  $sets
     */
    public function volume(iterable $sets): float
    {
        $total = 0.0;
        foreach ($sets as $set) {
            if ($set->isWarmup()) {
                continue;
            }
            $load = $this->loads->load($set);
            if ($load !== null) {
                $total += $load * $set->reps;
            }
        }

        return round($total, 2);
    }

    /** @param iterable<SetRow> $sets */
    public function totalReps(iterable $sets): int
    {
        $total = 0;
        foreach ($sets as $set) {
            if (! $set->isWarmup()) {
                $total += $set->reps;
            }
        }

        return $total;
    }
}
