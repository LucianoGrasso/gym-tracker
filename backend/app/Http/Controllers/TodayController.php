<?php

namespace App\Http\Controllers;

use App\Http\Resources\ExerciseSessionResource;
use App\Http\Resources\RoutineDayExerciseResource;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Services\LastPerformanceService;
use Illuminate\Http\JsonResponse;

class TodayController extends Controller
{
    public function __invoke(LastPerformanceService $lastPerformance): JsonResponse
    {
        $now = now(config('app.user_timezone'));
        $routine = Routine::query()->where('is_active', true)->with('days')->first();
        $day = $routine?->days->firstWhere('weekday', $now->dayOfWeekIso);

        return response()->json(['data' => [
            'date' => $now->toDateString(),
            'weekday' => $now->dayOfWeekIso,
            'routine' => $routine ? ['id' => $routine->id, 'name' => $routine->name] : null,
            'day' => $day ? $this->dayWithLastPerformance($day, $lastPerformance) : null,
            'days' => $routine
                ? $routine->days->map(fn (RoutineDay $d) => ['id' => $d->id, 'name' => $d->name, 'weekday' => $d->weekday])->values()
                : [],
        ]]);
    }

    private function dayWithLastPerformance(RoutineDay $day, LastPerformanceService $lastPerformance): array
    {
        $day->load('exercises.exercise');
        $last = $lastPerformance->forExercises($day->exercises->pluck('exercise_id')->unique()->values()->all());

        return [
            'id' => $day->id,
            'routine_id' => $day->routine_id,
            'name' => $day->name,
            'weekday' => $day->weekday,
            'position' => $day->position,
            'exercises' => $day->exercises->map(fn (RoutineDayExercise $item) => [
                ...(new RoutineDayExerciseResource($item))->resolve(),
                'last_performance' => isset($last[$item->exercise_id])
                    ? (new ExerciseSessionResource($last[$item->exercise_id]))->resolve()
                    : null,
            ])->values(),
        ];
    }
}
