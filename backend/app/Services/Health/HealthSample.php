<?php

namespace App\Services\Health;

use Carbon\CarbonInterface;

/**
 * Una muestra de Apple Salud: inicio (UTC), valor (lpm o kcal) y, si se conoce, su fin.
 * Atajos entrega la FC en bloques de ~5 min con el promedio del bloque; el fin permite ponderar.
 */
final readonly class HealthSample
{
    public function __construct(
        public CarbonInterface $at,
        public float $value,
        public ?CarbonInterface $end = null,
    ) {}
}
