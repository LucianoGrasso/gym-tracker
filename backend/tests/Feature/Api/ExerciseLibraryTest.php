<?php

use App\Models\Exercise;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

it('lists the library marking the exercises the user already has', function () {
    $own = Exercise::factory()->for($this->user)->create(['name' => 'press de banca']);
    Exercise::factory()->for($this->user)->create(['name' => 'Plancha', 'archived_at' => now()]);
    Exercise::factory()->create(['name' => 'Sentadilla']);

    $response = $this->getJson('/api/exercise-library')->assertOk()->assertJsonCount(147, 'data');

    $bySlug = collect($response->json('data'))->keyBy('slug');
    expect($bySlug['press-de-banca'])->toBe([
        'slug' => 'press-de-banca', 'name' => 'Press de banca', 'muscle_group' => 'chest',
        'secondary_muscles' => ['triceps', 'shoulders'], 'equipment' => 'barbell',
        'is_unilateral' => false, 'uses_bodyweight' => false, 'owned_exercise_id' => $own->id,
    ])
        ->and($bySlug['plancha']['owned_exercise_id'])->toBeNull()
        ->and($bySlug['sentadilla']['owned_exercise_id'])->toBeNull();
});

it('adds a library exercise to the user, once', function () {
    $this->postJson('/api/exercises/from-library', ['slug' => 'swing-con-kettlebell'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Swing con kettlebell')
        ->assertJsonPath('data.secondary_muscles', ['hamstrings', 'core']);

    $id = Exercise::sole()->id;
    $this->postJson('/api/exercises/from-library', ['slug' => 'swing-con-kettlebell'])
        ->assertOk()
        ->assertJsonPath('data.id', $id);
    expect(Exercise::count())->toBe(1);
});

it('restores an archived exercise instead of creating a copy', function () {
    $own = Exercise::factory()->for($this->user)->create(['name' => 'Plancha', 'archived_at' => now()]);

    $this->postJson('/api/exercises/from-library', ['slug' => 'plancha'])
        ->assertOk()
        ->assertJsonPath('data.id', $own->id)
        ->assertJsonPath('data.archived_at', null);
});

it('rejects an unknown slug', function () {
    $this->postJson('/api/exercises/from-library', ['slug' => 'no-existe'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['slug']);
});

it('requires authentication', function () {
    $this->app['auth']->forgetGuards();

    $this->getJson('/api/exercise-library')->assertUnauthorized();
});
