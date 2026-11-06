<?php

namespace App\Services\Invitations;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CreateInvitation
{
    /** @return array{invitation: Invitation, token: string} el token en claro solo existe aquí */
    public function handle(User $inviter): array
    {
        $pending = Invitation::withoutGlobalScopes()->where('user_id', $inviter->id)->pending()->count();
        if ($pending >= Invitation::MAX_PENDING) {
            throw ValidationException::withMessages([
                'invitation' => 'Tienes 5 invitaciones pendientes. Anula una para crear otra.',
            ]);
        }

        $token = Str::random(40);
        $invitation = Invitation::create([
            'user_id' => $inviter->id,
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addDays(Invitation::TTL_DAYS),
        ]);

        return ['invitation' => $invitation, 'token' => $token];
    }
}
