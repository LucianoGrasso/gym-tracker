<?php

use App\Enums\Equipment;
use App\Enums\ExerciseKind;
use App\Enums\MuscleGroup;
use App\Support\ExerciseCatalog;

it('offers a library of 155 exercises with unique names and slugs', function () {
    $library = ExerciseCatalog::all();

    expect($library)->toHaveCount(155)
        ->and(array_unique(array_column($library, 'name')))->toHaveCount(155)
        ->and(array_unique(array_column($library, 'slug')))->toHaveCount(155)
        ->and($library[0]['slug'])->toBe('press-de-banca');
});

it('keeps secondary muscles valid: at most four, unique, never the primary', function () {
    foreach (ExerciseCatalog::all() as $exercise) {
        $secondary = array_map(fn (MuscleGroup $m) => $m->value, $exercise['secondary_muscles']);
        expect(count($secondary))->toBeLessThanOrEqual(4, $exercise['name'])
            ->and(array_unique($secondary))->toHaveCount(count($secondary))
            ->and($secondary)->not->toContain($exercise['muscle_group']->value);
    }
});

it('covers every muscle', function () {
    $primaries = array_unique(array_map(fn (array $e) => $e['muscle_group']->value, ExerciseCatalog::all()));

    expect($primaries)->toHaveCount(count(MuscleGroup::cases()));
});

it('finds an exercise by slug', function () {
    expect(ExerciseCatalog::findBySlug('press-de-banca'))
        ->toMatchArray(['name' => 'Press de banca', 'muscle_group' => MuscleGroup::Chest, 'secondary_muscles' => [MuscleGroup::Triceps, MuscleGroup::Shoulders]])
        ->and(ExerciseCatalog::findBySlug('no-existe'))->toBeNull();
});

it('includes eight cardio exercises without muscles', function () {
    $cardio = array_values(array_filter(ExerciseCatalog::all(), fn (array $e) => $e['kind'] === ExerciseKind::Cardio));

    expect(array_column($cardio, 'name'))->toBe([
        'Caminata inclinada en trotadora', 'Trote en trotadora', 'Bicicleta estática', 'Elíptica',
        'Remoergómetro', 'Escaladora', 'Caminata al aire libre', 'Trote al aire libre',
    ]);
    foreach ($cardio as $exercise) {
        expect($exercise)->toMatchArray([
            'muscle_group' => MuscleGroup::Other, 'secondary_muscles' => [], 'is_unilateral' => false, 'uses_bodyweight' => false,
        ]);
    }
    expect(ExerciseCatalog::get('Trote al aire libre')['equipment'])->toBe(Equipment::Bodyweight)
        ->and(ExerciseCatalog::get('Elíptica')['equipment'])->toBe(Equipment::Machine)
        ->and(ExerciseCatalog::get('Press de banca')['kind'])->toBe(ExerciseKind::Strength);
});
