<?php

namespace App\Services\Health;

use App\Models\Workout;
use Illuminate\Support\Collection;

/**
 * Cruza muestras crudas de Salud con el horario de cada sesión terminada en las últimas 48 h
 * y guarda FC promedio, FC máxima y kcal. Una sesión sin muestras no se toca.
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
                'avg_heart_rate' => $beats === [] ? null : (int) round(array_sum($beats) / count($beats)),
                'max_heart_rate' => $beats === [] ? null : (int) round(max($beats)),
                'active_calories' => $calories === [] ? null : (int) round(array_sum($calories)),
                'health_synced_at' => now(),
            ]);

            return true;
        })->values();
    }

    /**
     * @param  list<HealthSample>  $samples
     * @return list<float>
     */
    private function within(array $samples, Workout $workout): array
    {
        $values = [];
        foreach ($samples as $sample) {
            if ($sample->at->between($workout->started_at, $workout->finished_at)) {
                $values[] = $sample->value;
            }
        }

        return $values;
    }
}
