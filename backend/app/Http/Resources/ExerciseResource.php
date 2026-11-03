<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExerciseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'muscle_group' => $this->muscle_group,
            'equipment' => $this->equipment,
            'is_unilateral' => $this->is_unilateral,
            'uses_bodyweight' => $this->uses_bodyweight,
            'notes' => $this->notes,
            'archived_at' => $this->archived_at?->toIso8601String(),
            'has_history' => $this->whenHas('has_history', fn ($value) => (bool) $value),
        ];
    }
}
