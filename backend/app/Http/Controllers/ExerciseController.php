<?php

namespace App\Http\Controllers;

use App\Http\Requests\ExerciseRequest;
use App\Http\Requests\ListExercisesRequest;
use App\Http\Resources\ExerciseResource;
use App\Models\Exercise;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class ExerciseController extends Controller
{
    public function index(ListExercisesRequest $request): AnonymousResourceCollection
    {
        $exercises = Exercise::query()
            ->when($request->validated('search'), fn ($query, $search) => $query->whereLike('name', "%{$search}%"))
            ->when($request->validated('muscle_group'), fn ($query, $group) => $query->where('muscle_group', $group))
            ->when(
                $request->boolean('archived'),
                fn ($query) => $query->whereNotNull('archived_at'),
                fn ($query) => $query->whereNull('archived_at'),
            )
            ->withExists('workoutExercises as has_history')
            ->orderBy('name')
            ->get();

        return ExerciseResource::collection($exercises);
    }

    public function store(ExerciseRequest $request): ExerciseResource
    {
        return new ExerciseResource($this->withHistoryFlag(Exercise::create($request->validated())));
    }

    public function show(Exercise $exercise): ExerciseResource
    {
        return new ExerciseResource($this->withHistoryFlag($exercise));
    }

    public function update(ExerciseRequest $request, Exercise $exercise): ExerciseResource
    {
        $exercise->update($request->validated());

        return new ExerciseResource($this->withHistoryFlag($exercise));
    }

    public function destroy(Exercise $exercise): Response
    {
        abort_if(
            $exercise->workoutExercises()->exists(),
            409,
            'El ejercicio tiene historial: archívalo en lugar de eliminarlo.',
        );
        abort_if(
            $exercise->routineDayExercises()->exists(),
            409,
            'El ejercicio está en una rutina: quítalo de la rutina antes de eliminarlo.',
        );

        $exercise->delete();

        return response()->noContent();
    }

    public function archive(Exercise $exercise): ExerciseResource
    {
        $exercise->update(['archived_at' => now()]);

        return new ExerciseResource($this->withHistoryFlag($exercise));
    }

    public function restore(Exercise $exercise): ExerciseResource
    {
        $exercise->update(['archived_at' => null]);

        return new ExerciseResource($this->withHistoryFlag($exercise));
    }

    private function withHistoryFlag(Exercise $exercise): Exercise
    {
        return $exercise->setAttribute('has_history', $exercise->workoutExercises()->exists());
    }
}
