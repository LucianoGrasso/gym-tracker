<?php

namespace App\Models;

use App\Enums\SetType;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkoutExercise extends Model
{
    use HasFactory, HasUlids;

    protected $fillable = [
        'id', 'workout_id', 'exercise_id', 'position', 'target_sets',
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

    public function workout(): BelongsTo
    {
        return $this->belongsTo(Workout::class);
    }

    public function exercise(): BelongsTo
    {
        return $this->belongsTo(Exercise::class);
    }

    public function sets(): HasMany
    {
        return $this->hasMany(WorkoutSet::class)->orderBy('set_number');
    }
}
