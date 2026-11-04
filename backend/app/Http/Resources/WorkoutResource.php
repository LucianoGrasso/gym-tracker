<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkoutResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'routine_day_id' => $this->routine_day_id,
            'routine_day_name' => $this->whenLoaded('routineDay', fn () => $this->routineDay?->name),
            'date' => $this->date->toDateString(),
            'started_at' => $this->started_at->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),
            'bodyweight_kg' => $this->bodyweight_kg === null ? null : (float) $this->bodyweight_kg,
            'notes' => $this->notes,
            'exercises_count' => $this->whenCounted('exercises'),
            'sets_count' => $this->whenCounted('sets'),
            'exercises' => WorkoutExerciseResource::collection($this->whenLoaded('exercises')),
        ];
    }
}
