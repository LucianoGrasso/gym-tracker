<?php

namespace App\Models;

use App\Enums\SetType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoutineDayExercise extends Model
{
    use HasFactory;

    protected $fillable = [
        'routine_day_id', 'exercise_id', 'position', 'target_sets',
        'target_reps_min', 'target_reps_max', 'target_text',
        'default_set_type', 'rest_seconds', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'default_set_type' => SetType::class,
            'position' => 'integer',
            'target_sets' => 'integer',
            'target_reps_min' => 'integer',
            'target_reps_max' => 'integer',
            'rest_seconds' => 'integer',
        ];
    }

    public function routineDay(): BelongsTo
    {
        return $this->belongsTo(RoutineDay::class);
    }

    public function exercise(): BelongsTo
    {
        return $this->belongsTo(Exercise::class);
    }
}
