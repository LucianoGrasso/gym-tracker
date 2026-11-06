<?php

namespace App\Services;

use App\Models\Exercise;
use App\Models\Routine;
use App\Models\User;
use App\Support\ExerciseCatalog;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Copia una plantilla como rutina del usuario (inactiva), reutilizando sus ejercicios por nombre. */
class RoutineTemplateImporter
{
    /** @param array<string, mixed> $template una entrada de RoutineTemplates::all() */
    public function import(User $user, array $template): Routine
    {
        return DB::transaction(function () use ($user, $template) {
            $routine = Routine::create([
                'user_id' => $user->id,
                'name' => $this->uniqueName($user, $template['name']),
                'notes' => $template['description'].($template['inspired_by'] ? "\nInspirada en {$template['inspired_by']}." : ''),
                'is_active' => false,
            ]);

            $exercises = $this->resolveExercises($user, $template);

            foreach ($template['days'] as $position => $day) {
                $routineDay = $routine->days()->create([
                    'name' => $day['name'],
                    'weekday' => $day['weekday'],
                    'position' => $position,
                ]);
                foreach ($day['exercises'] as $i => $item) {
                    $routineDay->exercises()->create([
                        'exercise_id' => $exercises[$item['name']]->id,
                        'position' => $i,
                        'target_sets' => $item['target_sets'],
                        'target_reps_min' => $item['target_reps_min'],
                        'target_reps_max' => $item['target_reps_max'],
                        'default_set_type' => $item['default_set_type'],
                        'rest_seconds' => $item['rest_seconds'],
                        'target_text' => $item['target_text'],
                    ]);
                }
            }

            return $routine->load('days.exercises.exercise');
        });
    }

    private function uniqueName(User $user, string $name): string
    {
        $taken = Routine::withoutGlobalScopes()->where('user_id', $user->id)->pluck('name')->all();
        $candidate = $name;
        for ($n = 2; in_array($candidate, $taken, true); $n++) {
            $candidate = "{$name} ({$n})";
        }

        return $candidate;
    }

    /** @return Collection<string, Exercise> nombre de la plantilla => ejercicio del usuario */
    private function resolveExercises(User $user, array $template): Collection
    {
        $owned = Exercise::withoutGlobalScopes()->where('user_id', $user->id)->get()
            ->keyBy(fn (Exercise $e) => $this->key($e->name));

        return collect($template['days'])
            ->flatMap(fn (array $day) => array_column($day['exercises'], 'name'))
            ->unique()
            ->mapWithKeys(function (string $name) use ($user, $owned) {
                $exercise = $owned->get($this->key($name));
                if ($exercise === null) {
                    $exercise = Exercise::create(['user_id' => $user->id, 'name' => $name] + ExerciseCatalog::get($name));
                } elseif ($exercise->archived_at !== null) {
                    $exercise->update(['archived_at' => null]);
                }

                return [$name => $exercise];
            });
    }

    private function key(string $name): string
    {
        return Str::lower(trim($name));
    }
}
