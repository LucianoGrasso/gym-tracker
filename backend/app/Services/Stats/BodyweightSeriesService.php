<?php

namespace App\Services\Stats;

final class BodyweightSeriesService
{
    /**
     * One point per date; a logged metric wins over the bodyweight typed when finishing a session.
     *
     * @param  array<string, float>  $metrics  date => kg (body_metrics)
     * @param  array<string, float>  $workouts  date => kg (workouts.bodyweight_kg)
     * @return list<array{date: string, bodyweight_kg: float, source: string}>
     */
    public function series(array $metrics, array $workouts, ?string $from): array
    {
        $points = [];
        foreach ($workouts as $date => $kg) {
            $points[$date] = ['date' => (string) $date, 'bodyweight_kg' => $kg, 'source' => 'workout'];
        }
        foreach ($metrics as $date => $kg) {
            $points[$date] = ['date' => (string) $date, 'bodyweight_kg' => $kg, 'source' => 'metric'];
        }
        ksort($points);

        return array_values(array_filter($points, fn (array $point) => $from === null || $point['date'] >= $from));
    }
}
