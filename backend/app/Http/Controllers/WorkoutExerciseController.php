<?php

namespace App\Http\Controllers;

use App\Http\Requests\WorkoutExerciseRequest;
use App\Http\Resources\WorkoutExerciseResource;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class WorkoutExerciseController extends Controller
{
    public function upsert(WorkoutExerciseRequest $request, string $workoutExercise): WorkoutExerciseResource
    {
        $id = strtolower($workoutExercise);
        abort_unless(Str::isUlid($id), 404);

        $existing = WorkoutExercise::find($id);
        abort_if($existing && ! Workout::query()->whereKey($existing->workout_id)->exists(), 404);

        $model = $existing ?? new WorkoutExercise(['id' => $id]);
        $model->fill($request->validated())->save();

        return new WorkoutExerciseResource($model->load('exercise'));
    }

    public function destroy(string $workoutExercise): Response
    {
        WorkoutExercise::query()
            ->whereKey(strtolower($workoutExercise))
            ->whereIn('workout_id', Workout::query()->select('id'))
            ->delete();

        return response()->noContent();
    }
}
