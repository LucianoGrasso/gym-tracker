<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BodyMetric extends Model
{
    use BelongsToUser, HasFactory;

    protected $fillable = ['user_id', 'date', 'bodyweight_kg'];

    protected function casts(): array
    {
        return ['date' => 'date', 'bodyweight_kg' => 'decimal:2'];
    }
}
