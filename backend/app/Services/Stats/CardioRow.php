<?php

namespace App\Services\Stats;

/** One cardio segment, flattened with what the stats need. */
final readonly class CardioRow
{
    public function __construct(
        public string $workoutId,
        public string $date,
        public int $exerciseId,
        public string $exerciseName,
        public int $durationSeconds,
        public ?float $speedKmh,
        public ?float $inclinePct,
        public ?float $distanceKm,
        public ?int $avgHeartRate,
        public ?int $calories,
    ) {}
}
