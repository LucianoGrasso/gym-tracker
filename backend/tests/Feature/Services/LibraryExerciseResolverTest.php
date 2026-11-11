<?php

use App\Enums\MuscleGroup;
use App\Models\Exercise;
use App\Models\User;
use App\Services\LibraryExerciseResolver;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->resolver = app(LibraryExerciseResolver::class);
});

it('creates the exercise from the library with its secondary muscles', function () {
    [$exercise, $created] = $this->resolver->resolve($this->user, 'Swing con kettlebell');

    expect($created)->toBeTrue()
        ->and($exercise->user_id)->toBe($this->user->id)
        ->and($exercise->muscle_group)->toBe(MuscleGroup::Glutes)
        ->and($exercise->fresh()->secondary_muscles->all())->toBe([MuscleGroup::Hamstrings, MuscleGroup::Core]);
});

it('reuses an exercise with the same name, ignoring case and accents, and restores it if archived', function () {
    $own = Exercise::factory()->for($this->user)->create(['name' => 'JALON AL PECHO', 'archived_at' => now()]);

    [$exercise, $created] = $this->resolver->resolve($this->user, 'Jalón al pecho');

    expect($created)->toBeFalse()
        ->and($exercise->id)->toBe($own->id)
        ->and($exercise->fresh()->archived_at)->toBeNull()
        ->and(Exercise::withoutGlobalScopes()->count())->toBe(1);
});

it('never reuses an exercise of another user', function () {
    Exercise::factory()->create(['name' => 'Plancha']);

    [, $created] = $this->resolver->resolve($this->user, 'Plancha');

    expect($created)->toBeTrue();
});
