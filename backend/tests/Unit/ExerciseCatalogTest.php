<?php

use App\Enums\MuscleGroup;
use App\Support\ExerciseCatalog;

it('offers a library of 147 exercises with unique names and slugs', function () {
    $library = ExerciseCatalog::all();

    expect($library)->toHaveCount(147)
        ->and(array_unique(array_column($library, 'name')))->toHaveCount(147)
        ->and(array_unique(array_column($library, 'slug')))->toHaveCount(147)
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
