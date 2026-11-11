<?php

use App\Models\Exercise;
use App\Models\RoutineDayExercise;
use App\Models\User;
use App\Models\WorkoutExercise;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

function exercisePayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Press militar',
        'muscle_group' => 'shoulders',
        'equipment' => 'barbell',
        'is_unilateral' => false,
        'uses_bodyweight' => false,
        'notes' => null,
    ], $overrides);
}

it('lists the active exercises of the user ordered by name', function () {
    Exercise::factory()->for($this->user)->create(['name' => 'B']);
    Exercise::factory()->for($this->user)->create(['name' => 'A']);
    Exercise::factory()->for($this->user)->create(['name' => 'C', 'archived_at' => now()]);
    Exercise::factory()->create(['name' => 'Z']);

    $this->getJson('/api/exercises')
        ->assertOk()
        ->assertJsonPath('data.*.name', ['A', 'B']);
});

it('lists archived exercises when asked', function () {
    Exercise::factory()->for($this->user)->create(['name' => 'A']);
    Exercise::factory()->for($this->user)->create(['name' => 'C', 'archived_at' => now()]);

    $this->getJson('/api/exercises?archived=1')
        ->assertOk()
        ->assertJsonPath('data.*.name', ['C']);
});

it('filters by search and muscle group', function () {
    Exercise::factory()->for($this->user)->create(['name' => 'Press de banca', 'muscle_group' => 'chest']);
    Exercise::factory()->for($this->user)->create(['name' => 'Press militar', 'muscle_group' => 'shoulders']);
    Exercise::factory()->for($this->user)->create(['name' => 'Sentadilla', 'muscle_group' => 'quads']);

    $this->getJson('/api/exercises?search=press')->assertJsonCount(2, 'data');
    $this->getJson('/api/exercises?search=press&muscle_group=chest')
        ->assertJsonPath('data.*.name', ['Press de banca']);
});

it('creates an exercise for the user', function () {
    $this->postJson('/api/exercises', exercisePayload())
        ->assertCreated()
        ->assertJsonPath('data.name', 'Press militar')
        ->assertJsonPath('data.muscle_group', 'shoulders')
        ->assertJsonPath('data.has_history', false);

    expect(Exercise::sole()->user_id)->toBe($this->user->id);
});

it('validates the exercise payload', function () {
    $this->postJson('/api/exercises', exercisePayload([
        'name' => '',
        'muscle_group' => 'neck',
        'equipment' => 'trx',
    ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name', 'muscle_group', 'equipment']);
});

it('rejects a duplicated name for the same user only', function () {
    Exercise::factory()->for($this->user)->create(['name' => 'Press militar']);
    Exercise::factory()->create(['name' => 'Remo']);

    $this->postJson('/api/exercises', exercisePayload())
        ->assertStatus(422)
        ->assertJsonPath('errors.name.0', 'Ya tienes un ejercicio con ese nombre.');

    $this->postJson('/api/exercises', exercisePayload(['name' => 'Remo']))->assertCreated();
});

it('shows an exercise with its history flag', function () {
    $exercise = Exercise::factory()->for($this->user)->create();
    WorkoutExercise::factory()->create(['exercise_id' => $exercise->id]);

    $this->getJson("/api/exercises/{$exercise->id}")
        ->assertOk()
        ->assertJsonPath('data.id', $exercise->id)
        ->assertJsonPath('data.has_history', true);
});

it('updates an exercise keeping its own name', function () {
    $exercise = Exercise::factory()->for($this->user)->create(['name' => 'Press militar']);

    $this->putJson("/api/exercises/{$exercise->id}", exercisePayload(['notes' => 'De pie']))
        ->assertOk()
        ->assertJsonPath('data.notes', 'De pie');
});

it('archives and restores an exercise', function () {
    $exercise = Exercise::factory()->for($this->user)->create();

    $this->postJson("/api/exercises/{$exercise->id}/archive")->assertOk();
    expect($exercise->fresh()->archived_at)->not->toBeNull();

    $this->postJson("/api/exercises/{$exercise->id}/restore")
        ->assertOk()
        ->assertJsonPath('data.archived_at', null);
});

it('deletes an exercise without history', function () {
    $exercise = Exercise::factory()->for($this->user)->create();

    $this->deleteJson("/api/exercises/{$exercise->id}")->assertNoContent();

    expect(Exercise::count())->toBe(0);
});

it('refuses to delete an exercise with history', function () {
    $exercise = Exercise::factory()->for($this->user)->create();
    WorkoutExercise::factory()->create(['exercise_id' => $exercise->id]);

    $this->deleteJson("/api/exercises/{$exercise->id}")
        ->assertStatus(409)
        ->assertJsonPath('message', 'El ejercicio tiene historial: archívalo en lugar de eliminarlo.');
});

it('refuses to delete an exercise used in a routine', function () {
    $exercise = Exercise::factory()->for($this->user)->create();
    RoutineDayExercise::factory()->create(['exercise_id' => $exercise->id]);

    $this->deleteJson("/api/exercises/{$exercise->id}")
        ->assertStatus(409)
        ->assertJsonPath('message', 'El ejercicio está en una rutina: quítalo de la rutina antes de eliminarlo.');
});

it('hides exercises of other users', function () {
    $foreign = Exercise::factory()->create();

    $this->getJson("/api/exercises/{$foreign->id}")->assertNotFound();
    $this->putJson("/api/exercises/{$foreign->id}", exercisePayload())->assertNotFound();
    $this->deleteJson("/api/exercises/{$foreign->id}")->assertNotFound();
});

it('requires authentication', function () {
    $this->app['auth']->forgetGuards();

    $this->getJson('/api/exercises')->assertUnauthorized();
});

it('saves the secondary muscles and the new equipment', function () {
    $this->postJson('/api/exercises', exercisePayload([
        'name' => 'Swing', 'muscle_group' => 'glutes', 'equipment' => 'kettlebell',
        'secondary_muscles' => ['hamstrings', 'core'],
    ]))
        ->assertCreated()
        ->assertJsonPath('data.equipment', 'kettlebell')
        ->assertJsonPath('data.secondary_muscles', ['hamstrings', 'core']);

    $exercise = Exercise::where('name', 'Swing')->first();
    $this->putJson("/api/exercises/{$exercise->id}", exercisePayload(['name' => 'Swing', 'muscle_group' => 'glutes', 'secondary_muscles' => []]))
        ->assertOk()
        ->assertJsonPath('data.secondary_muscles', []);
});

it('returns no secondary muscles by default', function () {
    $this->postJson('/api/exercises', exercisePayload())->assertCreated()->assertJsonPath('data.secondary_muscles', []);
});

it('validates the secondary muscles', function (array $secondary) {
    $this->postJson('/api/exercises', exercisePayload(['secondary_muscles' => $secondary]))
        ->assertStatus(422)
        ->assertJsonValidationErrorFor('secondary_muscles'.(count($secondary) > 4 ? '' : '.0'));
})->with([
    'the primary muscle' => [['shoulders']],
    'an unknown muscle' => [['neck']],
    'more than four' => [['chest', 'triceps', 'core', 'lats', 'biceps']],
]);

it('rejects repeated secondary muscles', function () {
    $this->postJson('/api/exercises', exercisePayload(['secondary_muscles' => ['triceps', 'triceps']]))
        ->assertStatus(422)
        ->assertJsonValidationErrorFor('secondary_muscles.0');
});
