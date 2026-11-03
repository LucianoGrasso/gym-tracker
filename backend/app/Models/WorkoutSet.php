<?php

namespace App\Models;

use App\Enums\SetType;
use App\Enums\Side;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkoutSet extends Model
{
    use HasFactory, HasUlids;

    protected $fillable = [
        'id', 'workout_exercise_id', 'set_number', 'set_type', 'weight_kg',
        'reps', 'side', 'rir', 'pain_level', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'set_type' => SetType::class,
            'side' => Side::class,
            'weight_kg' => 'decimal:2',
            'set_number' => 'integer',
            'reps' => 'integer',
            'rir' => 'integer',
            'pain_level' => 'integer',
        ];
    }

    public function workoutExercise(): BelongsTo
    {
        return $this->belongsTo(WorkoutExercise::class);
    }
}
