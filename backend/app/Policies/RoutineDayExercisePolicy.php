<?php

namespace App\Policies;

use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\User;

class RoutineDayExercisePolicy
{
    public function manage(User $user, RoutineDayExercise $routineDayExercise): bool
    {
        $ownerId = RoutineDay::query()
            ->join('routines', 'routines.id', '=', 'routine_days.routine_id')
            ->where('routine_days.id', $routineDayExercise->routine_day_id)
            ->value('routines.user_id');

        return (int) $ownerId === $user->id;
    }
}
