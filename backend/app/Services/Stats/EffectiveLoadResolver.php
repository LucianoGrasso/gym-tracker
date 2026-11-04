<?php

namespace App\Services\Stats;

final class EffectiveLoadResolver
{
    /** Load in kg of a set, or null when it depends on an unknown bodyweight. */
    public function load(SetRow $set): ?float
    {
        if (! $set->usesBodyweight) {
            return $set->weightKg;
        }

        return $set->bodyweightKg === null ? null : $set->bodyweightKg + $set->weightKg;
    }
}
