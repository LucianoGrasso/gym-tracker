<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoutineResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'notes' => $this->notes,
            'is_active' => $this->is_active,
            'days_count' => $this->whenCounted('days'),
            'days' => RoutineDayResource::collection($this->whenLoaded('days')),
        ];
    }
}
