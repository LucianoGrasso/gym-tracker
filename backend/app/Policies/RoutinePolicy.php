<?php

namespace App\Policies;

use App\Models\Routine;
use App\Models\User;

class RoutinePolicy
{
    public function manage(User $user, Routine $routine): bool
    {
        return $routine->user_id === $user->id;
    }
}
