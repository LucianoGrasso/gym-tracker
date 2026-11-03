<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReorderRequest;
use App\Http\Requests\RoutineDayExerciseRequest;
use App\Http\Resources\RoutineDayExerciseResource;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Support\Reorder;
use Illuminate\Http\Response;

class RoutineDayExerciseController extends Controller
{
    public function store(RoutineDayExerciseRequest $request, RoutineDay $routineDay): RoutineDayExerciseResource
    {
        $item = $routineDay->exercises()->create([
            ...$request->validated(),
            'position' => (int) ($routineDay->exercises()->max('position') ?? -1) + 1,
        ]);

        return new RoutineDayExerciseResource($item->load('exercise'));
    }

    public function update(RoutineDayExerciseRequest $request, RoutineDayExercise $routineDayExercise): RoutineDayExerciseResource
    {
        $routineDayExercise->update($request->validated());

        return new RoutineDayExerciseResource($routineDayExercise->load('exercise'));
    }

    public function destroy(RoutineDayExercise $routineDayExercise): Response
    {
        $routineDayExercise->delete();

        return response()->noContent();
    }

    public function reorder(ReorderRequest $request, RoutineDay $routineDay): Response
    {
        Reorder::apply($routineDay->exercises(), $request->validated('ids'));

        return response()->noContent();
    }
}
