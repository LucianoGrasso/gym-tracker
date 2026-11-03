<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RoutineDay extends Model
{
    use HasFactory;

    protected $fillable = ['routine_id', 'name', 'weekday', 'position'];

    protected function casts(): array
    {
        return ['weekday' => 'integer', 'position' => 'integer'];
    }

    public function routine(): BelongsTo
    {
        return $this->belongsTo(Routine::class);
    }

    public function exercises(): HasMany
    {
        return $this->hasMany(RoutineDayExercise::class)->orderBy('position');
    }
}
