<?php

namespace App\Models;

use App\Enums\Equipment;
use App\Enums\MuscleGroup;
use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\AsEnumCollection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Exercise extends Model
{
    use BelongsToUser, HasFactory;

    protected $fillable = [
        'user_id', 'name', 'muscle_group', 'secondary_muscles', 'equipment',
        'is_unilateral', 'uses_bodyweight', 'notes', 'archived_at',
    ];

    protected function casts(): array
    {
        return [
            'muscle_group' => MuscleGroup::class,
            'secondary_muscles' => AsEnumCollection::of(MuscleGroup::class),
            'equipment' => Equipment::class,
            'is_unilateral' => 'boolean',
            'uses_bodyweight' => 'boolean',
            'archived_at' => 'datetime',
        ];
    }

    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    public function workoutExercises(): HasMany
    {
        return $this->hasMany(WorkoutExercise::class);
    }

    public function routineDayExercises(): HasMany
    {
        return $this->hasMany(RoutineDayExercise::class);
    }
}
