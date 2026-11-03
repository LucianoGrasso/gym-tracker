<?php

namespace App\Policies;

use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\User;

class RoutineDayPolicy
{
    public function manage(User $user, RoutineDay $routineDay): bool
    {
        $ownerId = Routine::withoutGlobalScopes()->whereKey($routineDay->routine_id)->value('user_id');

        return (int) $ownerId === $user->id;
    }
}
