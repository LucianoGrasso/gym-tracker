<?php

namespace App\Http\Controllers;

use App\Http\Requests\StatsRequest;
use App\Models\Exercise;
use App\Services\Stats\BodyweightSeriesService;
use App\Services\Stats\ConsistencyService;
use App\Services\Stats\ExerciseProgressService;
use App\Services\Stats\MuscleSetsService;
use App\Services\Stats\OverviewService;
use App\Services\Stats\StalledExercisesService;
use App\Services\Stats\StatsDataLoader;
use Illuminate\Http\JsonResponse;

/** Glue only: request → data loader → stats service → JSON. */
class StatsController extends Controller
{
    public function __construct(private readonly StatsDataLoader $data) {}

    public function exercise(StatsRequest $request, Exercise $exercise, ExerciseProgressService $progress, StalledExercisesService $stalled): JsonResponse
    {
        $sets = $this->data->sets($exercise->id);
        $active = $exercise->archived_at === null ? [$exercise->id => $exercise->equipment] : [];

        return $this->respond($request, [
            'exercise' => ['id' => $exercise->id, 'name' => $exercise->name, 'uses_bodyweight' => $exercise->uses_bodyweight],
            ...$progress->progress($sets, $request->from()),
            'stalled' => $stalled->stalled($sets, $active, $request->today()->toDateString())[0] ?? null,
        ]);
    }

    public function stalled(StatsRequest $request, StalledExercisesService $stalled): JsonResponse
    {
        $active = Exercise::query()
            ->whereNull('archived_at')
            ->get(['id', 'equipment'])
            ->mapWithKeys(fn (Exercise $exercise) => [$exercise->id => $exercise->equipment])
            ->all();

        return $this->respond($request, [
            'exercises' => $stalled->stalled($this->data->sets(), $active, $request->today()->toDateString()),
        ]);
    }

    public function overview(StatsRequest $request, OverviewService $overview): JsonResponse
    {
        return $this->respond($request, $overview->overview(
            $this->data->sets(), $this->data->workoutDates(), $request->today(), $request->from(),
        ));
    }

    public function muscles(StatsRequest $request, MuscleSetsService $muscles): JsonResponse
    {
        return $this->respond($request, $muscles->summary(
            $this->data->sets(), $this->data->workoutDates(), $request->today(), $request->from(),
        ));
    }

    public function consistency(StatsRequest $request, ConsistencyService $consistency): JsonResponse
    {
        return $this->respond($request, $consistency->summary(
            $this->data->workoutDates(), $request->today(), $request->from(),
        ));
    }

    public function bodyweight(StatsRequest $request, BodyweightSeriesService $series): JsonResponse
    {
        return $this->respond($request, [
            'points' => $series->series($this->data->bodyMetrics(), $this->data->workoutBodyweights(), $request->from()),
        ]);
    }

    /**
     * Kilos keep their decimal part in the JSON (90.0, not 90), so every weight has the same type.
     *
     * @param  array<string, mixed>  $payload
     */
    private function respond(StatsRequest $request, array $payload): JsonResponse
    {
        return response()->json(
            ['data' => ['period' => $request->period()->value, ...$payload]],
            options: JSON_PRESERVE_ZERO_FRACTION,
        );
    }
}
