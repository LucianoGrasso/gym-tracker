<?php

namespace App\Services\Stats;

use App\Enums\SetType;

final class OneRepMaxCalculator
{
    public const MAX_REPS = 12;

    /** Epley: load × (1 + reps / 30); a single is the load itself. */
    public function epley(float $load, int $reps): float
    {
        return $reps === 1 ? $load : round($load * (1 + $reps / 30), 2);
    }

    /** Estimated 1RM of a set, or null when the set does not qualify (warmup, bilbo, reps outside 1-12, unknown load). */
    public function forSet(SetRow $set, ?float $load): ?float
    {
        if ($load === null || $set->isWarmup() || $set->setType === SetType::Bilbo) {
            return null;
        }
        if ($set->reps < 1 || $set->reps > self::MAX_REPS) {
            return null;
        }

        return $this->epley($load, $set->reps);
    }
}
