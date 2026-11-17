<?php

namespace App\Http\Controllers;

use App\Http\Requests\HealthSyncRequest;
use App\Http\Resources\WorkoutResource;
use App\Models\Workout;
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
        ])->all()]);
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
