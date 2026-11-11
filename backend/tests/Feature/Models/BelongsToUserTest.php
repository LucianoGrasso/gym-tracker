<?php

use App\Models\BodyMetric;
use App\Models\Exercise;
use App\Models\Routine;
use App\Models\User;
use App\Models\Workout;

it('only returns records of the authenticated user', function (string $model) {
    [$owner, $other] = User::factory()->count(2)->create();
    $model::factory()->count(2)->for($owner)->create();
    $model::factory()->for($other)->create();

    $this->actingAs($owner);

    expect($model::count())->toBe(2)
        ->and($model::pluck('user_id')->unique()->all())->toBe([$owner->id]);
})->with([Exercise::class, Routine::class, Workout::class, BodyMetric::class]);

it('fills user_id with the authenticated user on create', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $exercise = Exercise::create([
        'name' => 'Dominadas',
        'muscle_group' => 'lats',
        'equipment' => 'bodyweight',
        'uses_bodyweight' => true,
    ]);

    expect($exercise->user_id)->toBe($user->id);
});

it('does not filter when nobody is authenticated (console, seeders)', function () {
    Exercise::factory()->count(3)->create();

    expect(Exercise::count())->toBe(3);
});
