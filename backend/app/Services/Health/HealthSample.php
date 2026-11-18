<?php

namespace App\Services\Health;

use Carbon\CarbonInterface;

/** Una muestra de Apple Salud: instante (UTC) y valor (lpm o kcal). */
final readonly class HealthSample
{
    public function __construct(
        public CarbonInterface $at,
        public float $value,
    ) {}
}
