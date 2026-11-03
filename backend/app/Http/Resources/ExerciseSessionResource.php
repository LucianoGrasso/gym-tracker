<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A WorkoutExercise loaded with `workout_date` and `sets`. */
class ExerciseSessionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'workout_id' => $this->workout_id,
            'date' => substr((string) $this->workout_date, 0, 10),
            'sets' => WorkoutSetResource::collection($this->sets),
        ];
    }
}
