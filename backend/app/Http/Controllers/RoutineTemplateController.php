<?php

namespace App\Http\Controllers;

use App\Http\Resources\RoutineResource;
use App\Services\RoutineTemplateImporter;
use App\Support\RoutineTemplates;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoutineTemplateController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => RoutineTemplates::all()]);
    }

    public function import(Request $request, string $slug, RoutineTemplateImporter $importer): JsonResponse
    {
        $template = RoutineTemplates::find($slug);
        abort_if($template === null, 404);

        return (new RoutineResource($importer->import($request->user(), $template)))
            ->response()
            ->setStatusCode(201);
    }
}
