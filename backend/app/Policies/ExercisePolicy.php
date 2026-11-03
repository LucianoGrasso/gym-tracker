<?php

namespace App\Policies;

use App\Models\Exercise;
use App\Models\User;

class ExercisePolicy
{
    public function manage(User $user, Exercise $exercise): bool
    {
        return $exercise->user_id === $user->id;
    }
}
