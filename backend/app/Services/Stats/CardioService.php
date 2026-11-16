<?php

namespace App\Services\Stats;

use Illuminate\Support\Collection;

final class CardioService
{
    /**
     * @param  Collection<int, CardioRow>  $rows
     * @return array{minutes: int, sessions: int, distance_km: float}
     */
    public function summary(Collection $rows, ?string $from): array
    {
        $inPeriod = $this->inPeriod($rows, $from);

        return [
            'minutes' => (int) round($inPeriod->sum('durationSeconds') / 60),
            'sessions' => $inPeriod->pluck('workoutId')->unique()->count(),
            'distance_km' => round((float) $inPeriod->sum(fn (CardioRow $row) => $row->distanceKm ?? 0), 2),
        ];
    }

    /**
     * @param  Collection<int, CardioRow>  $rows  oldest first
     * @return list<array{workout_id: string, date: string, minutes: float, distance_km: ?float, calories: ?int, avg_speed_kmh: ?float, avg_incline_pct: ?float, avg_heart_rate: ?int}>
     */
    public function progress(Collection $rows, ?string $from): array
    {
        return $this->inPeriod($rows, $from)
            ->groupBy('workoutId')
            ->map(function (Collection $segments) {
                $heartRate = $this->weighted($segments, fn (CardioRow $row) => $row->avgHeartRate);
                $calories = $this->total($segments, fn (CardioRow $row) => $row->calories, 0);

                return [
                    'workout_id' => $segments->first()->workoutId,
                    'date' => $segments->first()->date,
                    'minutes' => round($segments->sum('durationSeconds') / 60, 1),
                    'distance_km' => $this->total($segments, fn (CardioRow $row) => $row->distanceKm, 2),
                    'calories' => $calories === null ? null : (int) $calories,
                    'avg_speed_kmh' => $this->round($this->weighted($segments, fn (CardioRow $row) => $row->speedKmh), 1),
                    'avg_incline_pct' => $this->round($this->weighted($segments, fn (CardioRow $row) => $row->inclinePct), 1),
                    'avg_heart_rate' => $heartRate === null ? null : (int) round($heartRate),
                ];
            })
            ->values()
            ->all();
    }

    /** @param  Collection<int, CardioRow>  $rows */
    private function inPeriod(Collection $rows, ?string $from): Collection
    {
        return $rows->filter(fn (CardioRow $row) => $from === null || $row->date >= $from);
    }

    /** Average of the segments that have the value, weighted by their duration. */
    private function weighted(Collection $segments, callable $value): ?float
    {
        $with = $segments->filter(fn (CardioRow $row) => $value($row) !== null && $row->durationSeconds > 0);
        $seconds = $with->sum('durationSeconds');

        return $seconds === 0 ? null : $with->sum(fn (CardioRow $row) => $value($row) * $row->durationSeconds) / $seconds;
    }

    private function total(Collection $segments, callable $value, int $precision): ?float
    {
        $values = $segments->map($value)->filter(fn ($v) => $v !== null);

        return $values->isEmpty() ? null : round((float) $values->sum(), $precision);
    }

    private function round(?float $value, int $precision): ?float
    {
        return $value === null ? null : round($value, $precision);
    }
}
