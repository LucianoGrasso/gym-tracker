<?php

namespace App\Http\Controllers;

use App\Http\Requests\WorkoutSetRequest;
use App\Http\Resources\WorkoutSetResource;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class WorkoutSetController extends Controller
{
    public function upsert(WorkoutSetRequest $request, string $workoutSet): WorkoutSetResource
    {
        $id = strtolower($workoutSet);
        abort_unless(Str::isUlid($id), 404);

        $existing = WorkoutSet::find($id);
        abort_if($existing && ! $this->ownedWorkoutExercises()->whereKey($existing->workout_exercise_id)->exists(), 404);

        $model = $existing ?? new WorkoutSet(['id' => $id]);
        $model->fill($request->validated())->save();

        return new WorkoutSetResource($model);
    }

    public function destroy(string $workoutSet): Response
    {
        WorkoutSet::query()
            ->whereKey(strtolower($workoutSet))
            ->whereIn('workout_exercise_id', $this->ownedWorkoutExercises()->select('id'))
            ->delete();

        return response()->noContent();
    }

    /**
     * Workout exercises that belong to the authenticated user's workouts.
     *
     * @return Builder<WorkoutExercise>
     */
    private function ownedWorkoutExercises(): Builder
    {
        return WorkoutExercise::query()->whereIn('workout_id', Workout::query()->select('id'));
    }
}
