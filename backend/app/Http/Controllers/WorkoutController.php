<?php

namespace App\Http\Controllers;

use App\Http\Requests\WorkoutRequest;
use App\Http\Resources\WorkoutResource;
use App\Models\Workout;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class WorkoutController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $workouts = Workout::query()
            ->with('routineDay')
            ->withCount(['exercises', 'sets'])
            ->orderByDesc('date')
            ->orderByDesc('started_at')
            ->paginate(20);

        return WorkoutResource::collection($workouts);
    }

    public function show(string $workout): WorkoutResource
    {
        $model = Workout::query()
            ->with(['routineDay', 'exercises.exercise', 'exercises.sets'])
            ->findOrFail(strtolower($workout));

        return new WorkoutResource($model);
    }

    /** Create or update by client-generated ULID (idempotent). */
    public function upsert(WorkoutRequest $request, string $workout): WorkoutResource
    {
        $id = strtolower($workout);
        abort_unless(Str::isUlid($id), 404);

        $existing = Workout::withoutGlobalScopes()->find($id);
        abort_if($existing && $existing->user_id !== $request->user()->id, 404);

        $model = $existing ?? new Workout(['id' => $id, 'user_id' => $request->user()->id]);
        $model->fill($request->validated())->save();

        return new WorkoutResource($model);
    }

    public function destroy(string $workout): Response
    {
        Workout::query()->whereKey(strtolower($workout))->delete();

        return response()->noContent();
    }
}
