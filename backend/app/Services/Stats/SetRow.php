<?php

namespace App\Services\Stats;

use App\Enums\MuscleGroup;
use App\Enums\SetType;

/** One logged set, flattened with what the stats need (bodyweight already resolved). */
final readonly class SetRow
{
    public function __construct(
        public string $workoutId,
        public string $date,
        public int $exerciseId,
        public string $exerciseName,
        public MuscleGroup $muscleGroup,
        public bool $usesBodyweight,
        public SetType $setType,
        public float $weightKg,
        public int $reps,
        public ?float $bodyweightKg,
    ) {}

    public function isWarmup(): bool
    {
        return $this->setType === SetType::Warmup;
    }
}
