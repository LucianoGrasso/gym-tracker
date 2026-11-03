<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Routine extends Model
{
    use BelongsToUser, HasFactory;

    protected $fillable = ['user_id', 'name', 'notes', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function days(): HasMany
    {
        return $this->hasMany(RoutineDay::class)->orderBy('position');
    }
}
