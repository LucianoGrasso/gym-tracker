<?php

namespace App\Http\Controllers;

use App\Http\Requests\HealthSamplesRequest;
use App\Http\Requests\HealthSyncRequest;
use App\Http\Resources\WorkoutResource;
use App\Models\Workout;
use App\Services\Health\ApplyHealthSamples;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;

/** Endpoints del Atajo "GymTracker Salud" (token con habilidad health:sync). */
class HealthSyncController extends Controller
{
    public function index(): JsonResponse
    {
        $timezone = config('app.user_timezone');
        $workouts = Workout::query()
            ->whereNotNull('finished_at')
            ->where('finished_at', '>=', now()->subHours(48))
            ->orderBy('started_at')
            ->get(['id', 'started_at', 'finished_at']);

        return response()->json(['data' => $workouts->map(fn (Workout $workout) => [
            'id' => $workout->id,
            'started_at' => $workout->started_at->setTimezone($timezone)->toIso8601String(),
            'finished_at' => $workout->finished_at->setTimezone($timezone)->toIso8601String(),
            'started_seconds_ago' => $this->secondsAgo($workout->started_at),
            'finished_seconds_ago' => $this->secondsAgo($workout->finished_at),
        ])->all()]);
    }

    /**
     * Recibe las muestras crudas de los últimos días y las reparte entre las sesiones por horario.
     * `summary` es el texto que el Atajo muestra en la notificación.
     */
    public function samples(HealthSamplesRequest $request, ApplyHealthSamples $apply): JsonResponse
    {
        $updated = $apply->handle($request->heartRate(), $request->energy());

        $summary = $updated->isEmpty()
            ? 'Sin datos de Salud en tus sesiones de las últimas 48 h.'
            : $updated->map(fn (Workout $workout) => $this->describe($workout))->implode("\n");

        return response()->json([
            'data' => $updated->map(fn (Workout $workout) => [
                'id' => $workout->id,
                'date' => $workout->date->toDateString(),
                'avg_heart_rate' => $workout->avg_heart_rate,
                'max_heart_rate' => $workout->max_heart_rate,
                'active_calories' => $workout->active_calories,
            ])->all(),
            'summary' => $summary,
        ]);
    }

    /** "16/11: ♥ 144 ppm prom · 162 máx · 351 kcal" */
    private function describe(Workout $workout): string
    {
        $parts = [];
        if ($workout->avg_heart_rate !== null) {
            $parts[] = "♥ {$workout->avg_heart_rate} ppm prom";
            $parts[] = "{$workout->max_heart_rate} máx";
        }
        if ($workout->active_calories !== null) {
            $parts[] = "{$workout->active_calories} kcal";
        }

        return $workout->date->format('d/m').': '.implode(' · ', $parts);
    }

    /**
     * Atajos interpreta mal las fechas ISO ("Obtener fechas de la entrada"); con segundos
     * hacia atrás arma el rango con "Fecha actual" + "Ajustar fecha", sin depender del idioma.
     */
    private function secondsAgo(CarbonInterface $moment): int
    {
        return max(0, (int) round($moment->diffInSeconds(now())));
    }

    /** Sobrescribe; si los tres valores llegan vacíos no toca nada (corrida sin AirPods ni Watch). */
    public function update(HealthSyncRequest $request, Workout $workout): WorkoutResource
    {
        $data = $request->only(HealthSyncRequest::FIELDS);
        if (array_filter($data, fn ($value) => $value !== null) !== []) {
            $workout->update($data + ['health_synced_at' => now()]);
        }

        return new WorkoutResource($workout);
    }
}
