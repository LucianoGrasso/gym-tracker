<?php

use App\Enums\MuscleGroup;
use App\Models\User;
use App\Support\ExerciseCatalog;
use Illuminate\Support\Facades\DB;

function splitMuscleGroupsMigration(): object
{
    return require database_path('migrations/2026_11_11_000001_split_muscle_groups.php');
}

function insertExercise(int $userId, string $name, string $group): void
{
    DB::table('exercises')->insert([
        'user_id' => $userId, 'name' => $name, 'muscle_group' => $group, 'equipment' => 'barbell',
        'is_unilateral' => false, 'uses_bodyweight' => false, 'created_at' => now(), 'updated_at' => now(),
    ]);
}

/** @return array<string, string> name => muscle_group */
function muscleGroupsByName(): array
{
    return DB::table('exercises')->orderBy('id')->pluck('muscle_group', 'name')->all();
}

it('moves old back and legs exercises to the new muscles', function () {
    $user = User::factory()->create();
    foreach ([
        ['Jalón al pecho', 'back'], ['Remo con barra', 'back'], ['Peso muerto', 'back'], ['Mi remo raro', 'back'],
        ['Sentadilla', 'legs'], ['Curl femoral', 'legs'], ['Hip thrust', 'legs'], ['Gemelos en máquina', 'legs'],
        ['Mi máquina de piernas', 'legs'], ['Press de banca', 'chest'], ['Plancha', 'core'],
    ] as [$name, $group]) {
        insertExercise($user->id, $name, $group);
    }

    splitMuscleGroupsMigration()->up();

    expect(muscleGroupsByName())->toBe([
        'Jalón al pecho' => 'lats', 'Remo con barra' => 'upper_back', 'Peso muerto' => 'hamstrings',
        'Mi remo raro' => 'lats', 'Sentadilla' => 'quads', 'Curl femoral' => 'hamstrings', 'Hip thrust' => 'glutes',
        'Gemelos en máquina' => 'calves', 'Mi máquina de piernas' => 'quads', 'Press de banca' => 'chest', 'Plancha' => 'core',
    ]);
});

it('rolls the new muscles back to back and legs', function () {
    $user = User::factory()->create();
    foreach ([['A', 'lats'], ['B', 'upper_back'], ['C', 'quads'], ['D', 'hamstrings'], ['E', 'glutes'], ['F', 'calves'], ['G', 'chest']] as [$name, $group]) {
        insertExercise($user->id, $name, $group);
    }

    splitMuscleGroupsMigration()->down();

    expect(muscleGroupsByName())->toBe([
        'A' => 'back', 'B' => 'back', 'C' => 'legs', 'D' => 'legs', 'E' => 'legs', 'F' => 'legs', 'G' => 'chest',
    ]);
});

it('uses the twelve muscles, without the old back and legs groups', function () {
    expect(array_map(fn (MuscleGroup $g) => $g->value, MuscleGroup::cases()))->toBe([
        'chest', 'lats', 'upper_back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'other',
    ])
        ->and(ExerciseCatalog::get('Remo en T')['muscle_group'])->toBe(MuscleGroup::UpperBack)
        ->and(ExerciseCatalog::get('Dominadas')['muscle_group'])->toBe(MuscleGroup::Lats)
        ->and(ExerciseCatalog::get('Peso muerto rumano')['muscle_group'])->toBe(MuscleGroup::Hamstrings)
        ->and(ExerciseCatalog::get('Sentadilla búlgara')['muscle_group'])->toBe(MuscleGroup::Quads);
});
