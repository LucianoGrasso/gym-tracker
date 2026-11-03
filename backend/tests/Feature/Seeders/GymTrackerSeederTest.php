<?php

use App\Enums\SetType;
use App\Models\Exercise;
use App\Models\Routine;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;

beforeEach(function () {
    $this->seed(DatabaseSeeder::class);
    $this->user = User::where('email', 'luciano@gymtracker.test')->sole();
});

it('creates the user exercises', function () {
    expect(Exercise::where('user_id', $this->user->id)->count())->toBe(15);

    $pullUps = Exercise::where('name', 'Dominadas')->sole();
    expect($pullUps->uses_bodyweight)->toBeTrue();
});

it('creates the active 4-day routine', function () {
    $routine = Routine::where('user_id', $this->user->id)->sole();

    expect($routine->is_active)->toBeTrue()
        ->and($routine->days->pluck('weekday')->all())->toBe([1, 2, 4, 5])
        ->and($routine->days->map(fn ($day) => $day->exercises->count())->all())->toBe([4, 4, 4, 5]);
});

it('starts monday with the bilbo bench press', function () {
    $monday = Routine::first()->days->firstWhere('weekday', 1);
    $first = $monday->exercises->first();

    expect($first->exercise->name)->toBe('Press de banca')
        ->and($first->default_set_type)->toBe(SetType::Bilbo)
        ->and($first->target_sets)->toBe(1)
        ->and($first->target_text)->toBe('~30 reps explosivas, 40-45 kg');
});

it('is idempotent for the user', function () {
    $this->seed(DatabaseSeeder::class);

    expect(User::count())->toBe(1);
});
