<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReorderRequest;
use App\Http\Requests\RoutineDayRequest;
use App\Http\Resources\RoutineDayResource;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Support\Reorder;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RoutineDayController extends Controller
{
    public function store(RoutineDayRequest $request, Routine $routine): RoutineDayResource
    {
        $day = $routine->days()->create([
            ...$request->validated(),
            'position' => $this->nextPosition($routine),
        ]);

        return new RoutineDayResource($day->load('exercises.exercise'));
    }

    public function update(RoutineDayRequest $request, RoutineDay $routineDay): RoutineDayResource
    {
        $routineDay->update($request->validated());

        return new RoutineDayResource($routineDay->load('exercises.exercise'));
    }

    public function destroy(RoutineDay $routineDay): Response
    {
        $routineDay->delete();

        return response()->noContent();
    }

    public function reorder(ReorderRequest $request, Routine $routine): Response
    {
        Reorder::apply($routine->days(), $request->validated('ids'));

        return response()->noContent();
    }

    public function duplicate(RoutineDay $routineDay): RoutineDayResource
    {
        $copy = DB::transaction(function () use ($routineDay) {
            $copy = $routineDay->replicate();
            $copy->name = Str::limit($routineDay->name.' (copia)', 100, '');
            $copy->weekday = null;
            $copy->position = $this->nextPosition($routineDay->routine);
            $copy->save();

            foreach ($routineDay->exercises as $exercise) {
                $exercise->replicate()->fill(['routine_day_id' => $copy->id])->save();
            }

            return $copy;
        });

        return new RoutineDayResource($copy->load('exercises.exercise'));
    }

    private function nextPosition(Routine $routine): int
    {
        return (int) ($routine->days()->max('position') ?? -1) + 1;
    }
}
