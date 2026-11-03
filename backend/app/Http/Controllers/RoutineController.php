<?php

namespace App\Http\Controllers;

use App\Http\Requests\RoutineRequest;
use App\Http\Resources\RoutineResource;
use App\Models\Routine;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class RoutineController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $routines = Routine::query()
            ->withCount('days')
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get();

        return RoutineResource::collection($routines);
    }

    public function store(RoutineRequest $request): RoutineResource
    {
        return new RoutineResource(Routine::create($request->validated())->refresh());
    }

    public function show(Routine $routine): RoutineResource
    {
        return new RoutineResource($routine->load('days.exercises.exercise'));
    }

    public function update(RoutineRequest $request, Routine $routine): RoutineResource
    {
        $routine->update($request->validated());

        return new RoutineResource($routine);
    }

    public function destroy(Routine $routine): Response
    {
        $routine->delete();

        return response()->noContent();
    }

    public function activate(Routine $routine): RoutineResource
    {
        DB::transaction(function () use ($routine) {
            Routine::query()->whereKeyNot($routine->id)->update(['is_active' => false]);
            $routine->update(['is_active' => true]);
        });

        return new RoutineResource($routine);
    }
}
