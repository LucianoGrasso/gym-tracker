<?php

namespace App\Services\Health;

use App\Models\Workout;
use Illuminate\Support\Collection;

/**
 * Cruza muestras crudas de Salud con el horario de cada sesión terminada en las últimas 48 h
 * y guarda FC promedio (ponderada por la duración de cada muestra dentro de la sesión) y kcal.
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
                'active_calories' => $calories === []
                    ? null
                    : (int) round(array_sum(array_map(fn (HealthSample $sample) => $sample->value, $calories))),
                'health_synced_at' => now(),
            ]);

            return true;
        })->values();
    }

    /**
     * Cada muestra pesa los segundos que dura dentro de la sesión (mínimo 1); sin fin, pesa 1.
     *
     * @param  non-empty-list<HealthSample>  $samples
     */
    private function weightedAverage(array $samples, Workout $workout): float
    {
        $total = 0.0;
        $weights = 0.0;
        foreach ($samples as $sample) {
            $weight = 1.0;
            if ($sample->end !== null) {
                $end = $sample->end->min($workout->finished_at);
                $weight = max(1.0, $sample->at->diffInSeconds($end));
            }
            $total += $sample->value * $weight;
            $weights += $weight;
        }

        return $total / $weights;
    }

    /**
     * @param  list<HealthSample>  $samples
     * @return list<HealthSample>
     */
    private function within(array $samples, Workout $workout): array
    {
        return array_values(array_filter(
            $samples,
            fn (HealthSample $sample) => $sample->at->between($workout->started_at, $workout->finished_at),
        ));
    }
}
