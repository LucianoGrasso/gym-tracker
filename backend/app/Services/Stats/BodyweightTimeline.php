<?php

namespace App\Services\Stats;

/** Effective bodyweight of a session: the one logged in it, else the latest metric up to that date. */
final class BodyweightTimeline
{
    /** @var array<string, float> */
    private array $metrics;

    /** @param array<string, float> $metrics date ("Y-m-d") => kg */
    public function __construct(array $metrics)
    {
        ksort($metrics);
        $this->metrics = $metrics;
    }

    public function at(string $date, ?float $workoutBodyweight): ?float
    {
        if ($workoutBodyweight !== null) {
            return $workoutBodyweight;
        }

        $found = null;
        foreach ($this->metrics as $metricDate => $kg) {
            if ($metricDate > $date) {
                break;
            }
            $found = $kg;
        }

        return $found;
    }
}
