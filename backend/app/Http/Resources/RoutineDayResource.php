<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoutineDayResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'routine_id' => $this->routine_id,
            'name' => $this->name,
            'weekday' => $this->weekday,
            'position' => $this->position,
            'exercises' => RoutineDayExerciseResource::collection($this->whenLoaded('exercises')),
        ];
    }
}
