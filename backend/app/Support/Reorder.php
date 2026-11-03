<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class Reorder
{
    /**
     * Sets `position` of each related model to its index in $ids.
     * $ids must contain exactly the ids currently in the relation.
     *
     * @param  list<int>  $ids
     */
    public static function apply(HasMany $relation, array $ids): void
    {
        $ids = array_map('intval', $ids);
        $current = $relation->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        $given = collect($ids)->sort()->values()->all();

        if ($current !== $given) {
            throw ValidationException::withMessages([
                'ids' => 'La lista no coincide con los elementos actuales.',
            ]);
        }

        DB::transaction(function () use ($relation, $ids) {
            foreach ($ids as $position => $id) {
                $relation->getRelated()->newQuery()->whereKey($id)->update(['position' => $position]);
            }
        });
    }
}
