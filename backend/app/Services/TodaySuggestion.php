<?php

namespace App\Services;

use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\Workout;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/** Qué día mostrar en Hoy según lo entrenado esta semana (lunes a domingo). */
class TodaySuggestion
{
    /**
     * @return array{day: ?RoutineDay, suggestion: ?string, replaced: ?array, week: array{start: string, done_day_ids: list<int>}}
     */
    public function for(?Routine $routine, CarbonInterface $now, ?int $requestedDayId = null): array
    {
        $start = $now->copy()->startOfWeek(CarbonInterface::MONDAY);
        $done = $routine ? $this->doneDates($routine, $start) : collect();
        $result = [
            'day' => null,
            'suggestion' => null,
            'replaced' => null,
            'week' => [
                'start' => $start->toDateString(),
                'done_day_ids' => $done->keys()->map(fn ($id) => (int) $id)->values()->all(),
            ],
        ];

        // ?day=ID: el día pedido manda (el controlador responde 404 si no existe).
        if ($requestedDayId !== null) {
            $day = $routine?->days->firstWhere('id', $requestedDayId);

            return [...$result, 'day' => $day, 'suggestion' => $day ? 'chosen' : null];
        }

        $planned = $routine?->days->firstWhere('weekday', $now->dayOfWeekIso);
        if (! $planned) {
            return $result;
        }

        $dates = $done->get($planned->id, []);
        if ($dates === [] || in_array($now->toDateString(), $dates, true)) {
            return [...$result, 'day' => $planned, 'suggestion' => 'planned'];
        }

        // El de hoy ya se hizo otro día: primero los pendientes atrasados (menor weekday).
        $pending = $routine->days
            ->filter(fn (RoutineDay $day) => $day->weekday !== null && ! $done->has($day->id))
            ->sortBy('weekday')
            ->first();

        return [
            ...$result,
            'day' => $pending,
            'suggestion' => $pending ? 'pending' : 'week_done',
            'replaced' => [
                'id' => $planned->id,
                'name' => $planned->name,
                'weekday' => $planned->weekday,
                'done_on' => $dates[0],
            ],
        ];
    }

    /** @return Collection<int, list<string>> routine_day_id => fechas (Y-m-d, ascendentes) de esta semana. */
    private function doneDates(Routine $routine, CarbonInterface $start): Collection
    {
        return Workout::query()
            ->whereIn('routine_day_id', $routine->days->pluck('id'))
            ->where('date', '>=', $start->toDateString())
            ->where('date', '<', $start->copy()->addWeek()->toDateString())
            ->orderBy('date')
            ->get(['routine_day_id', 'date'])
            ->groupBy('routine_day_id')
            ->map(fn (Collection $workouts) => $workouts
                ->map(fn (Workout $workout) => $workout->date->toDateString())
                ->unique()
                ->values()
                ->all());
    }
}
