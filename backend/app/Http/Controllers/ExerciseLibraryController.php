<?php

namespace App\Http\Controllers;

use App\Http\Requests\FromLibraryRequest;
use App\Http\Resources\ExerciseResource;
use App\Models\Exercise;
use App\Services\LibraryExerciseResolver;
use App\Support\ExerciseCatalog;
use Illuminate\Http\JsonResponse;

/** La biblioteca de ejercicios y su paso a "Mis ejercicios" al primer uso. */
class ExerciseLibraryController extends Controller
{
    public function __construct(private readonly LibraryExerciseResolver $exercises) {}

    public function index(): JsonResponse
    {
        $owned = Exercise::query()->active()->get(['id', 'name'])
            ->mapWithKeys(fn (Exercise $exercise) => [LibraryExerciseResolver::key($exercise->name) => $exercise->id]);

        return response()->json(['data' => array_map(fn (array $exercise) => [
            ...$exercise,
            'owned_exercise_id' => $owned->get(LibraryExerciseResolver::key($exercise['name'])),
        ], ExerciseCatalog::all())]);
    }

    public function adopt(FromLibraryRequest $request): JsonResponse
    {
        [$exercise, $created] = $this->exercises->resolve($request->user(), $request->libraryExercise()['name']);

        return (new ExerciseResource($exercise->fresh()))->response()->setStatusCode($created ? 201 : 200);
    }
}
