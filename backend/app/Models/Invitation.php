<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/** Link de invitación de un solo uso. `user_id` es quien invita; el token solo existe hasheado. */
class Invitation extends Model
{
    use BelongsToUser, HasFactory;

    public const TTL_DAYS = 7;

    public const MAX_PENDING = 5;

    protected $fillable = ['user_id', 'token_hash', 'expires_at', 'accepted_at', 'accepted_user_id'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'accepted_at' => 'datetime'];
    }

    public function scopePending(Builder $query): void
    {
        $query->whereNull('accepted_at')->where('expires_at', '>', now());
    }

    public function isUsable(): bool
    {
        return $this->accepted_at === null && $this->expires_at->isFuture();
    }

    /** Busca por el token en claro (sin el scope de usuario: el link lo abre alguien sin sesión). */
    public static function findByToken(string $token): ?self
    {
        return static::withoutGlobalScopes()->where('token_hash', hash('sha256', $token))->first();
    }
}
