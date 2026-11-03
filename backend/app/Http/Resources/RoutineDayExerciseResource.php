<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoutineDayExerciseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'routine_day_id' => $this->routine_day_id,
            'exercise' => new ExerciseResource($this->whenLoaded('exercise')),
            'position' => $this->position,
            'target_sets' => $this->target_sets,
            'target_reps_min' => $this->target_reps_min,
            'target_reps_max' => $this->target_reps_max,
            'target_text' => $this->target_text,
            'default_set_type' => $this->default_set_type,
            'rest_seconds' => $this->rest_seconds,
            'notes' => $this->notes,
        ];
    }
}
