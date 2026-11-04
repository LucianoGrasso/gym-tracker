<?php

namespace App\Http\Controllers;

use App\Http\Requests\BodyMetricRequest;
use App\Http\Requests\ListBodyMetricsRequest;
use App\Http\Resources\BodyMetricResource;
use App\Models\BodyMetric;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class BodyMetricController extends Controller
{
    public function index(ListBodyMetricsRequest $request): AnonymousResourceCollection
    {
        $metrics = BodyMetric::query()
            ->when($request->validated('from'), fn ($query, string $from) => $query->whereDate('date', '>=', $from))
            ->when($request->validated('to'), fn ($query, string $to) => $query->whereDate('date', '<=', $to))
            ->orderBy('date')
            ->get();

        return BodyMetricResource::collection($metrics);
    }

    /** Create or update the bodyweight of a date (idempotent). */
    public function upsert(BodyMetricRequest $request, string $date): BodyMetricResource
    {
        $metric = BodyMetric::query()->whereDate('date', $date)->first() ?? new BodyMetric(['date' => $date]);
        $metric->bodyweight_kg = $request->validated('bodyweight_kg');
        $metric->save();

        return new BodyMetricResource($metric);
    }
}
