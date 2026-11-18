<?php

namespace App\Services\Health;

use App\Models\Workout;
use Illuminate\Support\Collection;

/**
 * Cruza muestras crudas de Salud con el horario de cada sesión terminada en las últimas 48 h
 * y guarda FC promedio (ponderada por los segundos de cada muestra dentro de la sesión) y kcal
 * (cada bloque aporta la fracción que se superpone). Así cuadra aunque Fitness parta antes.
 * La FC máxima no se calcula: Atajos solo expone promedios de bloques de ~5 min, no el pico real.
 * Una sesión sin muestras no se toca.
 */
class ApplyHealthSamples
{
    /**
     * @param  list<HealthSample>  $heartRate
     * @param  list<HealthSample>  $energy
     * @return Collection<int, Workout> sesiones actualizadas
     */
    public function handle(array $heartRate, array $energy): Collection
    {
        $workouts = Workout::query()
            ->whereNotNull('finished_at')
            ->where('finished_at', '>=', now()->subHours(48))
            ->orderBy('started_at')
            ->get();

        return $workouts->filter(function (Workout $workout) use ($heartRate, $energy) {
            $beats = $this->within($heartRate, $workout);
            $calories = $this->within($energy, $workout);
            if ($beats === [] && $calories === []) {
                return false;
            }

            $workout->update([
                'avg_heart_rate' => $beats === [] ? null : (int) round($this->weightedAverage($beats, $workout)),
                'max_heart_rate' => null,
                'active_calories' => $calories === [] ? null : (int) round($this->proratedSum($calories, $workout)),
                'health_synced_at' => now(),
            ]);

            return true;
        })->values();
    }

    /**
     * Cada muestra pesa los segundos que se superpone con la sesión (mínimo 1).
     *
     * @param  non-empty-list<HealthSample>  $samples
     */
    private function weightedAverage(array $samples, Workout $workout): float
    {
        $total = 0.0;
        $weights = 0.0;
        foreach ($samples as $sample) {
            $weight = max(1.0, $this->overlapSeconds($sample, $workout) ?? 1.0);
            $total += $sample->value * $weight;
            $weights += $weight;
        }

        return $total / $weights;
    }

    /**
     * Suma de kcal; un bloque que cruza el inicio o el fin aporta solo la fracción que cae dentro.
     *
     * @param  non-empty-list<HealthSample>  $samples
     */
    private function proratedSum(array $samples, Workout $workout): float
    {
        $total = 0.0;
        foreach ($samples as $sample) {
            $overlap = $this->overlapSeconds($sample, $workout);
            $duration = $sample->end === null ? 0.0 : $sample->at->diffInSeconds($sample->end);
            $total += $overlap === null || $duration <= 0 ? $sample->value : $sample->value * $overlap / $duration;
        }

        return $total;
    }

    /**
     * @param  list<HealthSample>  $samples
     * @return list<HealthSample>
     */
    private function within(array $samples, Workout $workout): array
    {
        return array_values(array_filter($samples, function (HealthSample $sample) use ($workout) {
            $overlap = $this->overlapSeconds($sample, $workout);

            return $overlap === null
                ? $sample->at->between($workout->started_at, $workout->finished_at)
                : $overlap > 0;
        }));
    }

    /** Segundos de la muestra dentro de la sesión; null si la muestra es instantánea o no trae fin. */
    private function overlapSeconds(HealthSample $sample, Workout $workout): ?float
    {
        if ($sample->end === null || $sample->end->lessThanOrEqualTo($sample->at)) {
            return null;
        }
        $from = $sample->at->max($workout->started_at);
        $to = $sample->end->min($workout->finished_at);

        return $to->greaterThan($from) ? $from->diffInSeconds($to) : 0.0;
    }
}
