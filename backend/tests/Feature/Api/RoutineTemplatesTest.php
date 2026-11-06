<?php

use App\Enums\MuscleGroup;
use App\Models\Exercise;
use App\Models\Routine;
use App\Models\User;
use App\Support\RoutineTemplates;

beforeEach(function () {
    $this->user = User::factory()->create();
});

it('requires authentication', function () {
    $this->getJson('/api/routine-templates')->assertUnauthorized();
    $this->postJson('/api/routine-templates/phul/import')->assertUnauthorized();
});

it('lists the templates with days and exercises', function () {
    $this->actingAs($this->user)->getJson('/api/routine-templates')
        ->assertOk()
        ->assertJsonCount(7, 'data')
        ->assertJsonPath('data.0.slug', 'nippard-ppl')
        ->assertJsonPath('data.0.inspired_by', 'Jeff Nippard')
        ->assertJsonPath('data.0.level', 'intermediate')
        ->assertJsonPath('data.0.goal', 'hypertrophy')
        ->assertJsonPath('data.0.days_per_week', 6)
        ->assertJsonPath('data.0.days.0.exercises.0.name', 'Press de banca')
        ->assertJsonPath('data.0.days.0.exercises.0.muscle_group', 'chest')
        ->assertJsonPath('data.0.days.0.exercises.0.default_set_type', 'heavy');
});

it('imports a template as an inactive routine with ordered days and exercises', function () {
    $active = Routine::factory()->for($this->user)->create(['name' => 'Mi rutina', 'is_active' => true]);

    $response = $this->actingAs($this->user)->postJson('/api/routine-templates/phul/import')
        ->assertCreated()
        ->assertJsonPath('data.name', 'PHUL')
        ->assertJsonPath('data.is_active', false)
        ->assertJsonPath('data.days.*.name', [
            'Lunes – Superior potencia', 'Martes – Inferior potencia',
            'Jueves – Superior hipertrofia', 'Viernes – Inferior hipertrofia',
        ])
        ->assertJsonPath('data.days.0.exercises.0.exercise.name', 'Press de banca')
        ->assertJsonPath('data.days.0.exercises.0.target_text', '3-4 series');

    $routine = Routine::find($response->json('data.id'));
    $template = RoutineTemplates::find('phul');
    expect($routine->days->pluck('weekday')->all())->toBe([1, 2, 4, 5])
        ->and($routine->days[0]->exercises->pluck('position')->all())->toBe(range(0, count($template['days'][0]['exercises']) - 1))
        ->and($active->fresh()->is_active)->toBeTrue()
        ->and($routine->notes)->toBe($template['description']);
});

it('notes who inspired the routine', function () {
    $this->actingAs($this->user)->postJson('/api/routine-templates/cbum/import')
        ->assertCreated()
        ->assertJsonPath('data.notes', RoutineTemplates::find('cbum')['description']."\nInspirada en Chris Bumstead.");
});

it('reuses the user exercises by name, ignoring case and spaces', function () {
    $bench = Exercise::factory()->for($this->user)->create(['name' => '  press DE banca ']);

    $this->actingAs($this->user)->postJson('/api/routine-templates/reg-park-5x5/import')->assertCreated();

    expect(Exercise::where('user_id', $this->user->id)->count())->toBe(3)
        ->and(Routine::where('name', '5×5 de Reg Park')->sole()->days[0]->exercises[1]->exercise_id)->toBe($bench->id);
});

it('restores an archived exercise the template uses', function () {
    $squat = Exercise::factory()->for($this->user)->create(['name' => 'Sentadilla', 'archived_at' => now()]);

    $this->actingAs($this->user)->postJson('/api/routine-templates/reg-park-5x5/import')->assertCreated();

    expect($squat->fresh()->archived_at)->toBeNull();
});

it('creates missing exercises from the catalog', function () {
    $this->actingAs($this->user)->postJson('/api/routine-templates/arnold-golden-six/import')->assertCreated();

    $pullUps = Exercise::where('user_id', $this->user->id)->where('name', 'Dominadas')->sole();
    expect($pullUps->muscle_group)->toBe(MuscleGroup::Back)
        ->and($pullUps->uses_bodyweight)->toBeTrue()
        ->and(Exercise::where('user_id', $this->user->id)->count())->toBe(6);
});

it('adds a suffix when the routine name is taken', function () {
    $this->actingAs($this->user);
    $this->postJson('/api/routine-templates/phul/import')->assertJsonPath('data.name', 'PHUL');
    $this->postJson('/api/routine-templates/phul/import')->assertJsonPath('data.name', 'PHUL (2)');
    $this->postJson('/api/routine-templates/phul/import')->assertJsonPath('data.name', 'PHUL (3)');

    expect(Exercise::where('user_id', $this->user->id)->where('name', 'Press de banca')->count())->toBe(1);
});

it('returns 404 for an unknown template', function () {
    $this->actingAs($this->user)->postJson('/api/routine-templates/no-existe/import')->assertNotFound();
});

it('never uses another user exercises or routine names', function () {
    $other = User::factory()->create();
    Exercise::factory()->for($other)->create(['name' => 'Sentadilla']);
    Routine::factory()->for($other)->create(['name' => '5×5 de Reg Park']);

    $this->actingAs($this->user)->postJson('/api/routine-templates/reg-park-5x5/import')
        ->assertJsonPath('data.name', '5×5 de Reg Park');

    expect(Exercise::where('user_id', $this->user->id)->where('name', 'Sentadilla')->count())->toBe(1)
        ->and(Exercise::withoutGlobalScopes()->where('user_id', $other->id)->count())->toBe(1);
});
