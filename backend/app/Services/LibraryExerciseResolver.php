<?php

namespace App\Services;

use App\Models\Exercise;
use App\Models\User;
use App\Support\ExerciseCatalog;
use Illuminate\Support\Str;

/** El ejercicio del usuario para un nombre de la biblioteca: el suyo si ya existe, o uno nuevo con los datos del catálogo. */
class LibraryExerciseResolver
{
    /** @return array{0: Exercise, 1: bool} the exercise and whether it was created */
    public function resolve(User $user, string $name): array
    {
        $exercise = $this->find($user, $name);
        if ($exercise === null) {
            return [Exercise::create(['user_id' => $user->id, 'name' => $name] + ExerciseCatalog::get($name)), true];
        }
        if ($exercise->archived_at !== null) {
            $exercise->update(['archived_at' => null]);
        }

        return [$exercise, false];
    }

    /** Ejercicio del usuario (archivado o no) con ese nombre, sin distinguir mayúsculas ni tildes. */
    public function find(User $user, string $name): ?Exercise
    {
        $key = self::key($name);

        return Exercise::withoutGlobalScopes()
            ->where('user_id', $user->id)
            ->get()
            ->first(fn (Exercise $exercise) => self::key($exercise->name) === $key);
    }

    public static function key(string $name): string
    {
        return Str::lower(Str::ascii(trim($name)));
    }
}
