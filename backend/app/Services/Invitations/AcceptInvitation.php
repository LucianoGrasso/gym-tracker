<?php

namespace App\Services\Invitations;

use App\Models\Invitation;
use App\Models\User;
use Database\Seeders\GymTrackerSeeder;
use Illuminate\Support\Facades\DB;

class AcceptInvitation
{
    public function __construct(private readonly GymTrackerSeeder $seeder) {}

    /** @param array{name: string, email: string, password: string} $data */
    public function handle(string $token, array $data): User
    {
        return DB::transaction(function () use ($token, $data) {
            // lockForUpdate: dos registros simultáneos con el mismo link no pueden usarlo ambos.
            $invitation = Invitation::withoutGlobalScopes()
                ->where('token_hash', hash('sha256', $token))
                ->lockForUpdate()
                ->first();
            abort_if($invitation === null || ! $invitation->isUsable(), 410, 'Este link de invitación ya no es válido.');

            $user = User::create($data); // el cast 'hashed' hashea la contraseña
            $this->seeder->seedExercises($user);
            $invitation->update(['accepted_at' => now(), 'accepted_user_id' => $user->id]);

            return $user;
        });
    }
}
