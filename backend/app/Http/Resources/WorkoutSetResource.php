<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkoutSetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'set_number' => $this->set_number,
            'set_type' => $this->set_type,
            'weight_kg' => (float) $this->weight_kg,
            'reps' => $this->reps,
            'side' => $this->side,
            'rir' => $this->rir,
            'pain_level' => $this->pain_level,
            'notes' => $this->notes,
        ];
    }
}
