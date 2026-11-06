<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InvitationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'expires_at' => $this->expires_at->toIso8601String(),
            'expires_on' => $this->expires_at->timezone('America/Santiago')->toDateString(),
        ];
    }
}
