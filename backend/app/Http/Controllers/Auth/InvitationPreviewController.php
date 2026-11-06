<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Invitation;
use Illuminate\Http\JsonResponse;

class InvitationPreviewController extends Controller
{
    public function __invoke(string $token): JsonResponse
    {
        $invitation = Invitation::findByToken($token);
        abort_if($invitation === null, 404, 'Este link de invitación ya no es válido.');
        abort_unless($invitation->isUsable(), 410, 'Este link de invitación ya no es válido.');

        return response()->json(['data' => [
            'inviter_name' => $invitation->user->name,
            'expires_at' => $invitation->expires_at->toIso8601String(),
        ]]);
    }
}
