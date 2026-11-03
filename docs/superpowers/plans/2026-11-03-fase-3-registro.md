# Fase 3 — Registro de entrenamientos (offline-first): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar un entrenamiento completo desde el celular en pocos segundos por serie, sin perder nada al cerrar la pestaña o quedarse sin señal, y poder revisar, editar o borrar sesiones pasadas.

**Architecture:** El teléfono es la fuente de verdad durante la sesión: cada acción se guarda primero en IndexedDB (Dexie) y se encola en una *outbox* que `SyncService` envía en orden (FIFO) a endpoints `PUT/DELETE` idempotentes por ULID. La sesión en curso (`Session`) es un documento local con sus ejercicios y series; `WorkoutSessionService` la muta y genera las operaciones. En Laravel, los upserts validan propiedad (usuario → workout → workout_exercise → set) y devuelven `404` si el ULID pertenece a otro usuario.

**Tech Stack:** Laravel 13 + Pest; Angular 22, Dexie 4, ulid 3, fake-indexeddb (tests), spartan/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-gymtracker-design.md` (secciones 5, 6 "Sesiones", 7.2-7.4).

## Global Constraints

- IDs de `workouts`, `workout_exercises`, `workout_sets`: ULID **en minúsculas** generados en el cliente (`newId()`); el servidor normaliza a minúsculas.
- `PUT /{ulid}` = crear o actualizar (idempotente); ULID ajeno → `404`. `DELETE /{ulid}` → siempre `204` (solo borra si es propio).
- Orden de la outbox: workout → workout_exercises → sets (FIFO por `seq`). Errores de red/5xx/408/419/429 → reintento con backoff exponencial (1 s … 5 min); `401` → detener y pedir login; otros 4xx → marcar fallida y seguir.
- `weight_kg` = peso por mano en mancuerna, peso extra en ejercicios con peso corporal; pasos de 2,5 kg y 1 rep.
- Bilbo: objetivo = mejor reps Bilbo de la última vez + 1; sugerir subir 2,5-5 kg con ≥ 35 reps.
- Textos de UI en español (Chile); objetivos táctiles ≥ 48 px; formato `42,5 kg`, `dd/mm/aaaa`.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

```
backend/
├── app/Models/Workout.php                         + sets() HasManyThrough
├── app/Http/Requests/{Workout,WorkoutExercise,WorkoutSet}Request.php
├── app/Http/Resources/{Workout,WorkoutExercise}Resource.php, WorkoutSetResource.php (+workout_exercise_id)
├── app/Http/Controllers/{Workout,WorkoutExercise,WorkoutSet}Controller.php
├── routes/api.php
└── tests/Feature/Api/{Workouts,WorkoutExercises,WorkoutSets}Test.php

frontend/src/app/
├── app.ts                                         arranque: sync, sesión activa, ping /api/health
├── app.routes.ts                                  /entrenamiento/:id, /entrenamientos
├── core/local-db/{local-db,ids,cached-fetch}.ts   Dexie, ULID, caché con respaldo local
├── core/sync/{sync.service,sync-label}.ts         outbox → API
├── core/models/workout.ts                         Session, SessionExercise, WorkoutSummary, WorkoutDetail
├── core/workout/{session-mapping,set-suggestions}.ts   funciones puras
├── core/workout/{workout-session.service,rest-timer.service}.ts
├── core/api/workouts-api.ts
├── layout/shell.ts                                + indicador de sincronización y temporizador
├── shared/ui/{sync-indicator,rest-timer-bar}.ts
└── features/
    ├── workout/{workout-page,exercise-card,workouts-page}.ts
    ├── today/today-page.ts                        empezar / continuar / sesión libre
    └── auth/login-page.ts                         sincroniza tras iniciar sesión
```

---

### Task 1: API de sesiones (`workouts`)

**Files:**
- Modify: `backend/app/Models/Workout.php`, `backend/app/Http/Resources/WorkoutSetResource.php`, `backend/routes/api.php`
- Create: `backend/app/Http/Requests/WorkoutRequest.php`
- Create: `backend/app/Http/Resources/WorkoutResource.php`, `WorkoutExerciseResource.php`
- Create: `backend/app/Http/Controllers/WorkoutController.php`
- Test: `backend/tests/Feature/Api/WorkoutsTest.php`

**Interfaces:**
- Produces:
  - `GET /api/workouts?page=` → paginado (20), más reciente primero, con `routine_day_name`, `exercises_count`, `sets_count`.
  - `GET /api/workouts/{ulid}` → detalle con `exercises[].exercise` y `exercises[].sets`.
  - `PUT /api/workouts/{ulid}` `{routine_day_id, date, started_at, finished_at, bodyweight_kg, notes}` → `201` al crear, `200` al actualizar.
  - `DELETE /api/workouts/{ulid}` → `204`.
  - `WorkoutResource`: `{id, routine_day_id, routine_day_name?, date, started_at, finished_at, bodyweight_kg, notes, exercises_count?, sets_count?, exercises?}`.
  - `WorkoutExerciseResource`: `{id, workout_id, exercise?, position, target_sets, target_reps_min, target_reps_max, target_text, default_set_type, rest_seconds, notes, sets?}`.
  - `WorkoutSetResource` agrega `workout_exercise_id`.
  - `Workout::sets(): HasManyThrough`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/Feature/Api/WorkoutsTest.php`:

```php
<?php

use App\Models\Exercise;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->day = RoutineDay::factory()->for(Routine::factory()->for($this->user))->create(['name' => 'Martes – Espalda']);
});

function workoutPayload(array $overrides = []): array
{
    return array_merge([
        'routine_day_id' => null,
        'date' => '2026-11-03',
        'started_at' => '2026-11-03T22:00:00.000Z',
        'finished_at' => null,
        'bodyweight_kg' => null,
        'notes' => null,
    ], $overrides);
}

it('creates a workout with a client ULID and is idempotent', function () {
    $id = strtolower((string) Str::ulid());
    $payload = workoutPayload(['routine_day_id' => $this->day->id]);

    $this->putJson("/api/workouts/{$id}", $payload)
        ->assertCreated()
        ->assertJsonPath('data.id', $id)
        ->assertJsonPath('data.date', '2026-11-03')
        ->assertJsonPath('data.finished_at', null);

    $this->putJson("/api/workouts/{$id}", $payload)->assertOk();

    expect(Workout::count())->toBe(1)
        ->and(Workout::sole()->user_id)->toBe($this->user->id);
});

it('updates a workout when finishing it', function () {
    $workout = Workout::factory()->for($this->user)->create();

    $this->putJson("/api/workouts/{$workout->id}", workoutPayload([
        'started_at' => '2026-11-03T22:00:00Z',
        'finished_at' => '2026-11-03T23:15:00Z',
        'bodyweight_kg' => 78.5,
    ]))
        ->assertOk()
        ->assertJsonPath('data.bodyweight_kg', 78.5)
        ->assertJsonPath('data.finished_at', '2026-11-03T23:15:00+00:00');
});

it('refuses to touch a workout of another user', function () {
    $foreign = Workout::factory()->create(['notes' => 'ajeno']);

    $this->putJson("/api/workouts/{$foreign->id}", workoutPayload(['notes' => 'mío']))->assertNotFound();
    $this->deleteJson("/api/workouts/{$foreign->id}")->assertNoContent();

    expect(Workout::withoutGlobalScopes()->find($foreign->id)->notes)->toBe('ajeno');
});

it('validates the workout payload', function () {
    $foreignDay = RoutineDay::factory()->create();

    $this->putJson('/api/workouts/'.strtolower((string) Str::ulid()), workoutPayload([
        'routine_day_id' => $foreignDay->id,
        'date' => '03/11/2026',
        'finished_at' => '2026-11-03T21:00:00Z',
    ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['routine_day_id', 'date', 'finished_at']);
});

it('rejects an id that is not a ULID', function () {
    $this->putJson('/api/workouts/not-a-ulid', workoutPayload())->assertNotFound();
});

it('deletes idempotently with its exercises and sets', function () {
    $set = WorkoutSet::factory()->create();
    $workout = $set->workoutExercise->workout;
    $workout->update(['user_id' => $this->user->id]);

    $this->deleteJson("/api/workouts/{$workout->id}")->assertNoContent();
    $this->deleteJson("/api/workouts/{$workout->id}")->assertNoContent();

    expect(Workout::count())->toBe(0)->and(WorkoutSet::count())->toBe(0);
});

it('lists workouts newest first with counts', function () {
    $old = Workout::factory()->for($this->user)->create(['date' => '2026-10-01', 'routine_day_id' => $this->day->id]);
    $new = Workout::factory()->for($this->user)->create(['date' => '2026-10-08']);
    $exercise = WorkoutExercise::factory()->create(['workout_id' => $old->id]);
    WorkoutSet::factory()->count(3)->sequence(fn ($s) => ['set_number' => $s->index + 1])->create(['workout_exercise_id' => $exercise->id]);
    Workout::factory()->create();

    $this->getJson('/api/workouts')
        ->assertOk()
        ->assertJsonPath('data.*.id', [$new->id, $old->id])
        ->assertJsonPath('data.1.routine_day_name', 'Martes – Espalda')
        ->assertJsonPath('data.1.exercises_count', 1)
        ->assertJsonPath('data.1.sets_count', 3)
        ->assertJsonPath('meta.current_page', 1);
});

it('shows a workout with exercises and sets', function () {
    $workout = Workout::factory()->for($this->user)->create();
    $exercise = Exercise::factory()->for($this->user)->create(['name' => 'Dominadas']);
    $item = WorkoutExercise::factory()->create(['workout_id' => $workout->id, 'exercise_id' => $exercise->id]);
    WorkoutSet::factory()->create(['workout_exercise_id' => $item->id, 'weight_kg' => 0, 'reps' => 6]);

    $this->getJson("/api/workouts/{$workout->id}")
        ->assertOk()
        ->assertJsonPath('data.exercises.0.exercise.name', 'Dominadas')
        ->assertJsonPath('data.exercises.0.sets.0.reps', 6)
        ->assertJsonPath('data.exercises.0.sets.0.workout_exercise_id', $item->id);

    $this->getJson('/api/workouts/'.Workout::factory()->create()->id)->assertNotFound();
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/WorkoutsTest.php`
Expected: FAIL.

- [ ] **Step 3: Relación, request y resources**

En `backend/app/Models/Workout.php` agregar (con `use Illuminate\Database\Eloquent\Relations\HasManyThrough;`):

```php
public function sets(): HasManyThrough
{
    return $this->hasManyThrough(WorkoutSet::class, WorkoutExercise::class);
}
```

`backend/app/Http/Requests/WorkoutRequest.php`:

```php
<?php

namespace App\Http\Requests;

use App\Models\Routine;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class WorkoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'routine_day_id' => [
                'nullable', 'integer',
                Rule::exists('routine_days', 'id')->where(
                    fn ($query) => $query->whereIn('routine_id', Routine::query()->select('id'))
                ),
            ],
            'date' => ['required', 'date_format:Y-m-d'],
            'started_at' => ['required', 'date'],
            'finished_at' => ['nullable', 'date', 'after_or_equal:started_at'],
            'bodyweight_kg' => ['nullable', 'numeric', 'between:20,400'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
```

`backend/app/Http/Resources/WorkoutResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkoutResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'routine_day_id' => $this->routine_day_id,
            'routine_day_name' => $this->whenLoaded('routineDay', fn () => $this->routineDay?->name),
            'date' => $this->date->toDateString(),
            'started_at' => $this->started_at->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),
            'bodyweight_kg' => $this->bodyweight_kg === null ? null : (float) $this->bodyweight_kg,
            'notes' => $this->notes,
            'exercises_count' => $this->whenCounted('exercises'),
            'sets_count' => $this->whenCounted('sets'),
            'exercises' => WorkoutExerciseResource::collection($this->whenLoaded('exercises')),
        ];
    }
}
```

`backend/app/Http/Resources/WorkoutExerciseResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkoutExerciseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'workout_id' => $this->workout_id,
            'exercise' => new ExerciseResource($this->whenLoaded('exercise')),
            'position' => $this->position,
            'target_sets' => $this->target_sets,
            'target_reps_min' => $this->target_reps_min,
            'target_reps_max' => $this->target_reps_max,
            'target_text' => $this->target_text,
            'default_set_type' => $this->default_set_type,
            'rest_seconds' => $this->rest_seconds,
            'notes' => $this->notes,
            'sets' => WorkoutSetResource::collection($this->whenLoaded('sets')),
        ];
    }
}
```

En `backend/app/Http/Resources/WorkoutSetResource.php`, agregar después de `'id' => $this->id,`:

```php
'workout_exercise_id' => $this->workout_exercise_id,
```

- [ ] **Step 4: Controlador y rutas**

`backend/app/Http/Controllers/WorkoutController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\WorkoutRequest;
use App\Http\Resources\WorkoutResource;
use App\Models\Workout;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class WorkoutController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $workouts = Workout::query()
            ->with('routineDay')
            ->withCount(['exercises', 'sets'])
            ->orderByDesc('date')
            ->orderByDesc('started_at')
            ->paginate(20);

        return WorkoutResource::collection($workouts);
    }

    public function show(string $workout): WorkoutResource
    {
        $model = Workout::query()
            ->with(['routineDay', 'exercises.exercise', 'exercises.sets'])
            ->findOrFail(strtolower($workout));

        return new WorkoutResource($model);
    }

    /** Create or update by client-generated ULID (idempotent). */
    public function upsert(WorkoutRequest $request, string $workout): WorkoutResource
    {
        $id = strtolower($workout);
        abort_unless(Str::isUlid($id), 404);

        $existing = Workout::withoutGlobalScopes()->find($id);
        abort_if($existing && $existing->user_id !== $request->user()->id, 404);

        $model = $existing ?? new Workout(['id' => $id, 'user_id' => $request->user()->id]);
        $model->fill($request->validated())->save();

        return new WorkoutResource($model);
    }

    public function destroy(string $workout): Response
    {
        Workout::query()->whereKey(strtolower($workout))->delete();

        return response()->noContent();
    }
}
```

En `backend/routes/api.php`, dentro de `auth:sanctum` (con su `use`):

```php
Route::get('/workouts', [WorkoutController::class, 'index']);
Route::get('/workouts/{workout}', [WorkoutController::class, 'show']);
Route::put('/workouts/{workout}', [WorkoutController::class, 'upsert']);
Route::delete('/workouts/{workout}', [WorkoutController::class, 'destroy']);
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(api): add idempotent workout upsert, list, detail and delete"
```

---

### Task 2: API de ejercicios y series de una sesión

**Files:**
- Create: `backend/app/Http/Requests/WorkoutExerciseRequest.php`, `WorkoutSetRequest.php`
- Create: `backend/app/Http/Controllers/WorkoutExerciseController.php`, `WorkoutSetController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/WorkoutExercisesTest.php`, `backend/tests/Feature/Api/WorkoutSetsTest.php`

**Interfaces:**
- Consumes: `WorkoutExerciseResource`, `WorkoutSetResource` (Task 1).
- Produces:
  - `PUT /api/workout-exercises/{ulid}` `{workout_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_text, default_set_type, rest_seconds, notes}`; `DELETE` → `204`.
  - `PUT /api/workout-sets/{ulid}` `{workout_exercise_id, set_number, set_type, weight_kg, reps, side, rir, pain_level, notes}`; `DELETE` → `204`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/Feature/Api/WorkoutExercisesTest.php`:

```php
<?php

use App\Models\Exercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->workout = Workout::factory()->for($this->user)->create();
    $this->exercise = Exercise::factory()->for($this->user)->create(['name' => 'Dominadas']);
});

function workoutExercisePayload(array $overrides = []): array
{
    return array_merge([
        'position' => 0,
        'target_sets' => 6,
        'target_reps_min' => 5,
        'target_reps_max' => 6,
        'target_text' => null,
        'default_set_type' => 'normal',
        'rest_seconds' => 150,
        'notes' => null,
    ], $overrides);
}

it('creates and updates a workout exercise idempotently', function () {
    $id = strtolower((string) Str::ulid());
    $payload = workoutExercisePayload(['workout_id' => $this->workout->id, 'exercise_id' => $this->exercise->id]);

    $this->putJson("/api/workout-exercises/{$id}", $payload)
        ->assertCreated()
        ->assertJsonPath('data.exercise.name', 'Dominadas');
    $this->putJson("/api/workout-exercises/{$id}", [...$payload, 'position' => 2])
        ->assertOk()
        ->assertJsonPath('data.position', 2);

    expect(WorkoutExercise::count())->toBe(1);
});

it('allows a free-form exercise without targets', function () {
    $this->putJson('/api/workout-exercises/'.strtolower((string) Str::ulid()), workoutExercisePayload([
        'workout_id' => $this->workout->id,
        'exercise_id' => $this->exercise->id,
        'target_sets' => null,
        'target_reps_min' => null,
        'target_reps_max' => null,
    ]))->assertCreated();
});

it('validates ownership of the workout and the exercise', function () {
    $this->putJson('/api/workout-exercises/'.strtolower((string) Str::ulid()), workoutExercisePayload([
        'workout_id' => Workout::factory()->create()->id,
        'exercise_id' => Exercise::factory()->create()->id,
    ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['workout_id', 'exercise_id']);
});

it('refuses to overwrite a workout exercise of another user', function () {
    $foreign = WorkoutExercise::factory()->create();

    $this->putJson("/api/workout-exercises/{$foreign->id}", workoutExercisePayload([
        'workout_id' => $this->workout->id,
        'exercise_id' => $this->exercise->id,
    ]))->assertNotFound();

    $this->deleteJson("/api/workout-exercises/{$foreign->id}")->assertNoContent();
    expect(WorkoutExercise::find($foreign->id))->not->toBeNull();
});

it('deletes a workout exercise idempotently', function () {
    $item = WorkoutExercise::factory()->create(['workout_id' => $this->workout->id]);

    $this->deleteJson("/api/workout-exercises/{$item->id}")->assertNoContent();
    $this->deleteJson("/api/workout-exercises/{$item->id}")->assertNoContent();

    expect(WorkoutExercise::count())->toBe(0);
});
```

`backend/tests/Feature/Api/WorkoutSetsTest.php`:

```php
<?php

use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->item = WorkoutExercise::factory()->create([
        'workout_id' => Workout::factory()->for($this->user)->create()->id,
    ]);
});

function setPayload(array $overrides = []): array
{
    return array_merge([
        'set_number' => 1,
        'set_type' => 'bilbo',
        'weight_kg' => 42.5,
        'reps' => 31,
        'side' => 'both',
        'rir' => null,
        'pain_level' => 2,
        'notes' => 'Muñeca derecha',
    ], $overrides);
}

it('creates and updates a set idempotently', function () {
    $id = strtolower((string) Str::ulid());

    $this->putJson("/api/workout-sets/{$id}", setPayload(['workout_exercise_id' => $this->item->id]))
        ->assertCreated()
        ->assertJsonPath('data.weight_kg', 42.5)
        ->assertJsonPath('data.set_type', 'bilbo')
        ->assertJsonPath('data.pain_level', 2);

    $this->putJson("/api/workout-sets/{$id}", setPayload(['workout_exercise_id' => $this->item->id, 'reps' => 32]))
        ->assertOk()
        ->assertJsonPath('data.reps', 32);

    expect(WorkoutSet::count())->toBe(1);
});

it('validates the set', function () {
    $this->putJson('/api/workout-sets/'.strtolower((string) Str::ulid()), setPayload([
        'workout_exercise_id' => WorkoutExercise::factory()->create()->id,
        'weight_kg' => -5,
        'reps' => 1000,
        'side' => 'up',
        'pain_level' => 11,
    ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['workout_exercise_id', 'weight_kg', 'reps', 'side', 'pain_level']);
});

it('refuses to overwrite a set of another user', function () {
    $foreign = WorkoutSet::factory()->create();

    $this->putJson("/api/workout-sets/{$foreign->id}", setPayload(['workout_exercise_id' => $this->item->id]))
        ->assertNotFound();
    $this->deleteJson("/api/workout-sets/{$foreign->id}")->assertNoContent();

    expect(WorkoutSet::find($foreign->id))->not->toBeNull();
});

it('deletes a set idempotently', function () {
    $set = WorkoutSet::factory()->create(['workout_exercise_id' => $this->item->id]);

    $this->deleteJson("/api/workout-sets/{$set->id}")->assertNoContent();
    $this->deleteJson("/api/workout-sets/{$set->id}")->assertNoContent();

    expect(WorkoutSet::count())->toBe(0);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/WorkoutExercisesTest.php tests/Feature/Api/WorkoutSetsTest.php`
Expected: FAIL.

- [ ] **Step 3: Requests**

`backend/app/Http/Requests/WorkoutExerciseRequest.php`:

```php
<?php

namespace App\Http\Requests;

use App\Enums\SetType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class WorkoutExerciseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $userId = $this->user()->id;

        return [
            'workout_id' => ['required', 'string', Rule::exists('workouts', 'id')->where('user_id', $userId)],
            'exercise_id' => ['required', 'integer', Rule::exists('exercises', 'id')->where('user_id', $userId)],
            'position' => ['required', 'integer', 'between:0,100'],
            'target_sets' => ['nullable', 'integer', 'between:1,20'],
            'target_reps_min' => ['nullable', 'integer', 'between:1,100'],
            'target_reps_max' => ['nullable', 'integer', 'between:1,100'],
            'target_text' => ['nullable', 'string', 'max:150'],
            'default_set_type' => ['required', Rule::enum(SetType::class)],
            'rest_seconds' => ['required', 'integer', 'between:0,900'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
```

`backend/app/Http/Requests/WorkoutSetRequest.php`:

```php
<?php

namespace App\Http\Requests;

use App\Enums\SetType;
use App\Enums\Side;
use App\Models\Workout;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class WorkoutSetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'workout_exercise_id' => [
                'required', 'string',
                Rule::exists('workout_exercises', 'id')->where(
                    fn ($query) => $query->whereIn('workout_id', Workout::query()->select('id'))
                ),
            ],
            'set_number' => ['required', 'integer', 'between:1,100'],
            'set_type' => ['required', Rule::enum(SetType::class)],
            'weight_kg' => ['required', 'numeric', 'between:0,999.99'],
            'reps' => ['required', 'integer', 'between:0,999'],
            'side' => ['required', Rule::enum(Side::class)],
            'rir' => ['nullable', 'integer', 'between:0,10'],
            'pain_level' => ['nullable', 'integer', 'between:0,10'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
```

- [ ] **Step 4: Controladores y rutas**

`backend/app/Http/Controllers/WorkoutExerciseController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\WorkoutExerciseRequest;
use App\Http\Resources\WorkoutExerciseResource;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class WorkoutExerciseController extends Controller
{
    public function upsert(WorkoutExerciseRequest $request, string $workoutExercise): WorkoutExerciseResource
    {
        $id = strtolower($workoutExercise);
        abort_unless(Str::isUlid($id), 404);

        $existing = WorkoutExercise::find($id);
        abort_if($existing && ! Workout::query()->whereKey($existing->workout_id)->exists(), 404);

        $model = $existing ?? new WorkoutExercise(['id' => $id]);
        $model->fill($request->validated())->save();

        return new WorkoutExerciseResource($model->load('exercise'));
    }

    public function destroy(string $workoutExercise): Response
    {
        WorkoutExercise::query()
            ->whereKey(strtolower($workoutExercise))
            ->whereIn('workout_id', Workout::query()->select('id'))
            ->delete();

        return response()->noContent();
    }
}
```

`backend/app/Http/Controllers/WorkoutSetController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\WorkoutSetRequest;
use App\Http\Resources\WorkoutSetResource;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class WorkoutSetController extends Controller
{
    public function upsert(WorkoutSetRequest $request, string $workoutSet): WorkoutSetResource
    {
        $id = strtolower($workoutSet);
        abort_unless(Str::isUlid($id), 404);

        $existing = WorkoutSet::find($id);
        abort_if($existing && ! $this->ownedWorkoutExercises()->whereKey($existing->workout_exercise_id)->exists(), 404);

        $model = $existing ?? new WorkoutSet(['id' => $id]);
        $model->fill($request->validated())->save();

        return new WorkoutSetResource($model);
    }

    public function destroy(string $workoutSet): Response
    {
        WorkoutSet::query()
            ->whereKey(strtolower($workoutSet))
            ->whereIn('workout_exercise_id', $this->ownedWorkoutExercises()->select('id'))
            ->delete();

        return response()->noContent();
    }

    private function ownedWorkoutExercises()
    {
        return WorkoutExercise::query()->whereIn('workout_id', Workout::query()->select('id'));
    }
}
```

En `backend/routes/api.php`, dentro de `auth:sanctum` (con sus `use`):

```php
Route::put('/workout-exercises/{workoutExercise}', [WorkoutExerciseController::class, 'upsert']);
Route::delete('/workout-exercises/{workoutExercise}', [WorkoutExerciseController::class, 'destroy']);
Route::put('/workout-sets/{workoutSet}', [WorkoutSetController::class, 'upsert']);
Route::delete('/workout-sets/{workoutSet}', [WorkoutSetController::class, 'destroy']);
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(api): add idempotent workout exercise and set upserts"
```

---

### Task 3: Base local (Dexie), IDs, caché y `SyncService`

**Files:**
- Modify: `frontend/package.json` (dependencias)
- Create: `frontend/src/app/core/local-db/local-db.ts`, `ids.ts`, `cached-fetch.ts`
- Create: `frontend/src/app/core/sync/sync.service.ts`, `sync-label.ts`
- Test: `frontend/src/app/core/local-db/cached-fetch.spec.ts`, `frontend/src/app/core/sync/sync.service.spec.ts`, `frontend/src/app/core/sync/sync-label.spec.ts`

**Interfaces:**
- Produces:
  - `LocalDb` (Dexie) con tablas `outbox` (`++seq`), `sessions` (`id`), `cache` (`key`); token `LOCAL_DB`.
  - `OutboxOp { seq?, method: 'PUT' | 'DELETE', url, body, createdAt, attempts, failed, lastError }`.
  - `newId(): string` (ULID en minúsculas).
  - `cachedFetch<T>(db, key, fetcher): Promise<T>`.
  - `SyncService`: `state: Signal<SyncState>` (`'idle' | 'syncing' | 'offline' | 'error' | 'auth'`), `pending: Signal<number>`, `failed: Signal<number>`, `enqueue(method, url, body?)`, `flush()`, `start()`, `retryFailed()`.
  - `syncLabel(state, pending, failed): string`.

- [ ] **Step 1: Dependencias**

```bash
cd frontend
npm install dexie ulid
npm install -D fake-indexeddb
```

- [ ] **Step 2: Escribir los tests que fallan**

`frontend/src/app/core/local-db/cached-fetch.spec.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { cachedFetch } from './cached-fetch';
import { LocalDb } from './local-db';

describe('cachedFetch', () => {
  it('stores fresh values and falls back to them when the fetch fails', async () => {
    const db = new LocalDb(`test-${crypto.randomUUID()}`);

    expect(await cachedFetch(db, 'today', async () => ({ day: 'Lunes' }))).toEqual({ day: 'Lunes' });
    expect(await cachedFetch(db, 'today', async () => { throw new Error('offline'); })).toEqual({ day: 'Lunes' });
  });

  it('rethrows when there is nothing cached', async () => {
    const db = new LocalDb(`test-${crypto.randomUUID()}`);

    await expect(cachedFetch(db, 'none', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  });
});
```

`frontend/src/app/core/sync/sync-label.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { syncLabel } from './sync-label';

describe('syncLabel', () => {
  it('describes each state in spanish', () => {
    expect(syncLabel('idle', 0, 0)).toBe('Sincronizado');
    expect(syncLabel('syncing', 3, 0)).toBe('Sincronizando 3…');
    expect(syncLabel('offline', 2, 0)).toBe('Sin conexión · 2 pendientes');
    expect(syncLabel('offline', 1, 0)).toBe('Sin conexión · 1 pendiente');
    expect(syncLabel('error', 4, 0)).toBe('Error al sincronizar · reintentando');
    expect(syncLabel('error', 0, 2)).toBe('2 cambios no se pudieron guardar');
    expect(syncLabel('auth', 5, 0)).toBe('Inicia sesión para sincronizar');
  });
});
```

`frontend/src/app/core/sync/sync.service.spec.ts`:

```ts
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_DB, LocalDb } from '../local-db/local-db';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  let sync: SyncService;
  let db: LocalDb;
  let mock: HttpTestingController;

  beforeEach(() => {
    db = new LocalDb(`test-${crypto.randomUUID()}`);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: LOCAL_DB, useValue: db }],
    });
    sync = TestBed.inject(SyncService);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  const next = (url: string) => vi.waitFor(() => mock.expectOne(url));

  it('sends queued operations in order and empties the outbox', async () => {
    await sync.enqueue('PUT', '/api/workouts/a', { date: '2026-11-03' });
    await sync.enqueue('PUT', '/api/workout-sets/b', { reps: 5 });

    const first = await next('/api/workouts/a');
    expect(first.request.method).toBe('PUT');
    expect(first.request.body).toEqual({ date: '2026-11-03' });
    first.flush({ data: {} });
    (await next('/api/workout-sets/b')).flush({ data: {} });

    await vi.waitFor(async () => expect(await db.outbox.count()).toBe(0));
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    expect(sync.pending()).toBe(0);
  });

  it('keeps the operation and reports offline on network errors', async () => {
    await sync.enqueue('DELETE', '/api/workout-sets/x');

    (await next('/api/workout-sets/x')).error(new ProgressEvent('error'), { status: 0 });

    await vi.waitFor(() => expect(sync.state()).toBe('offline'));
    expect(sync.pending()).toBe(1);
    const [op] = await db.outbox.toArray();
    expect(op.attempts).toBe(1);
    expect(op.failed).toBe(false);
  });

  it('marks validation errors as failed and continues', async () => {
    await sync.enqueue('PUT', '/api/workout-sets/bad', { reps: -1 });
    await sync.enqueue('PUT', '/api/workout-sets/good', { reps: 5 });

    (await next('/api/workout-sets/bad')).flush(
      { message: 'x', errors: { reps: ['Reps inválidas.'] } },
      { status: 422, statusText: 'Unprocessable' },
    );
    (await next('/api/workout-sets/good')).flush({ data: {} });

    await vi.waitFor(() => expect(sync.state()).toBe('error'));
    expect(sync.failed()).toBe(1);
    const [op] = await db.outbox.toArray();
    expect(op.url).toBe('/api/workout-sets/bad');
    expect(op.lastError).toBe('Reps inválidas.');
  });

  it('stops and asks for login on 401', async () => {
    await sync.enqueue('PUT', '/api/workouts/a', {});
    await sync.enqueue('PUT', '/api/workouts/b', {});

    (await next('/api/workouts/a')).flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });

    await vi.waitFor(() => expect(sync.state()).toBe('auth'));
    expect(sync.pending()).toBe(2);
  });
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 4: Base local, IDs y caché**

`frontend/src/app/core/local-db/local-db.ts`:

```ts
import { InjectionToken } from '@angular/core';
import Dexie, { type EntityTable } from 'dexie';
import type { Session } from '../models/workout';

export interface OutboxOp {
  seq?: number;
  method: 'PUT' | 'DELETE';
  url: string;
  body: unknown;
  createdAt: number;
  attempts: number;
  failed: boolean;
  lastError: string | null;
}

export interface CacheEntry {
  key: string;
  value: unknown;
  updatedAt: number;
}

export class LocalDb extends Dexie {
  outbox!: EntityTable<OutboxOp, 'seq'>;
  sessions!: EntityTable<Session, 'id'>;
  cache!: EntityTable<CacheEntry, 'key'>;

  constructor(name = 'gymtracker') {
    super(name);
    this.version(1).stores({ outbox: '++seq', sessions: 'id', cache: 'key' });
  }
}

export const LOCAL_DB = new InjectionToken<LocalDb>('LOCAL_DB', {
  providedIn: 'root',
  factory: () => new LocalDb(),
});
```

`frontend/src/app/core/local-db/ids.ts`:

```ts
import { ulid } from 'ulid';

/** ULID en minúsculas (Laravel también los guarda así). */
export function newId(): string {
  return ulid().toLowerCase();
}
```

`frontend/src/app/core/local-db/cached-fetch.ts`:

```ts
import type { LocalDb } from './local-db';

/** Pide datos frescos y los guarda; si falla (sin señal), usa la última copia guardada. */
export async function cachedFetch<T>(db: LocalDb, key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const value = await fetcher();
    await db.cache.put({ key, value, updatedAt: Date.now() });
    return value;
  } catch (error) {
    const hit = await db.cache.get(key);
    if (hit) {
      return hit.value as T;
    }
    throw error;
  }
}
```

- [ ] **Step 5: Etiqueta y servicio de sincronización**

`frontend/src/app/core/sync/sync-label.ts`:

```ts
export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'auth';

export function syncLabel(state: SyncState, pending: number, failed: number): string {
  switch (state) {
    case 'auth':
      return 'Inicia sesión para sincronizar';
    case 'offline':
      return `Sin conexión · ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}`;
    case 'error':
      return failed > 0 && pending === 0
        ? `${failed} ${failed === 1 ? 'cambio no se pudo guardar' : 'cambios no se pudieron guardar'}`
        : 'Error al sincronizar · reintentando';
    case 'syncing':
      return pending > 0 ? `Sincronizando ${pending}…` : 'Sincronizado';
    default:
      return 'Sincronizado';
  }
}
```

`frontend/src/app/core/sync/sync.service.ts`:

```ts
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../api/api-error';
import { LOCAL_DB, type OutboxOp } from '../local-db/local-db';
import type { SyncState } from './sync-label';

const MAX_BACKOFF_MS = 5 * 60_000;
const RETRYABLE_4XX = new Set([408, 419, 429]);

/** Envía la outbox (IndexedDB) a la API en orden FIFO. */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly db = inject(LOCAL_DB);
  private readonly http = inject(HttpClient);

  readonly state = signal<SyncState>('idle');
  readonly pending = signal(0);
  readonly failed = signal(0);

  private running = false;
  private rerun = false;
  private backoffMs = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  async enqueue(method: OutboxOp['method'], url: string, body: unknown = null): Promise<void> {
    await this.db.outbox.add({ method, url, body, createdAt: Date.now(), attempts: 0, failed: false, lastError: null });
    await this.refreshCounts();
    void this.flush();
  }

  /** Escucha reconexión y regreso a la app; procesa lo pendiente. */
  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('online', () => void this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.flush();
    });
    void this.refreshCounts().then(() => this.flush());
  }

  async retryFailed(): Promise<void> {
    await this.db.outbox.filter((op) => op.failed).modify({ failed: false, attempts: 0 });
    await this.refreshCounts();
    await this.flush();
  }

  async flush(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    this.clearRetry();
    try {
      await this.processQueue();
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        void this.flush();
      }
    }
  }

  private async processQueue(): Promise<void> {
    for (;;) {
      const op = await this.db.outbox.filter((o) => !o.failed).first();
      if (!op) {
        this.backoffMs = 0;
        this.state.set(this.failed() > 0 ? 'error' : 'idle');
        return;
      }
      this.state.set('syncing');
      try {
        await firstValueFrom(this.http.request(op.method, op.url, { body: op.body ?? undefined }));
        await this.db.outbox.delete(op.seq!);
        this.backoffMs = 0;
      } catch (error) {
        const status = error instanceof HttpErrorResponse ? error.status : -1;
        if (status === 401) {
          this.state.set('auth');
          return;
        }
        if (status >= 400 && status < 500 && !RETRYABLE_4XX.has(status)) {
          await this.db.outbox.update(op.seq!, { failed: true, attempts: op.attempts + 1, lastError: apiErrorMessage(error) });
          await this.refreshCounts();
          continue;
        }
        await this.db.outbox.update(op.seq!, { attempts: op.attempts + 1, lastError: apiErrorMessage(error) });
        this.state.set(status === 0 ? 'offline' : 'error');
        this.scheduleRetry();
        return;
      } finally {
        await this.refreshCounts();
      }
    }
  }

  private scheduleRetry(): void {
    this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : 1000, MAX_BACKOFF_MS);
    this.retryTimer = setTimeout(() => void this.flush(), this.backoffMs);
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async refreshCounts(): Promise<void> {
    const all = await this.db.outbox.toArray();
    this.failed.set(all.filter((op) => op.failed).length);
    this.pending.set(all.filter((op) => !op.failed).length);
  }
}
```

`core/models/workout.ts` todavía no existe: crear en este paso un archivo mínimo para que compile `local-db.ts` (la Task 4 lo completa):

`frontend/src/app/core/models/workout.ts`:

```ts
export interface Session {
  id: string;
}
```

- [ ] **Step 6: Correr y verificar que pasan**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build exitoso.

- [ ] **Step 7: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): add IndexedDB outbox and sync service"
```

---

### Task 4: Modelos de sesión, mapeos y sugerencias de series

**Files:**
- Modify: `frontend/src/app/core/models/workout.ts` (reemplazar)
- Create: `frontend/src/app/core/workout/session-mapping.ts`, `set-suggestions.ts`
- Create: `frontend/src/app/core/api/workouts-api.ts`
- Test: `frontend/src/app/core/workout/session-mapping.spec.ts`, `frontend/src/app/core/workout/set-suggestions.spec.ts`

**Interfaces:**
- Consumes: modelos de fase 2 (`Exercise`, `WorkoutSet`, `ExerciseSession`, `Today`, `Paginated`), `formatKg`, `SET_TYPE_LABELS`.
- Produces:
  - `ExerciseRef`, `WorkoutSetInput`, `SessionExercise`, `Session`, `WorkoutSummary`, `WorkoutExerciseDetail`, `WorkoutDetail`.
  - `sessionFromDay(today, makeId, now)`, `freeSession(id, date, now)`, `sessionExerciseFrom(exercise, id, position, lastPerformance)`, `sessionFromDetail(detail)`.
  - `workoutPayload(session)`, `workoutExercisePayload(workoutId, exercise)`, `setPayload(workoutExerciseId, set)`.
  - `suggestNextSet(exercise)`, `toSetInput(set)`, `stepWeight(value, delta)`, `stepReps(value, delta)`, `parseDecimal(text, fallback)`, `formatNumber(value)`, `bilboHint(exercise)`, `formatSetLine(set, usesBodyweight)`, `BILBO_INCREASE_REPS = 35`.
  - `WorkoutsApi.list(page)`, `WorkoutsApi.get(id)`.

- [ ] **Step 1: Escribir los tests que fallan**

`frontend/src/app/core/workout/session-mapping.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Today } from '../models/routine';
import type { WorkoutDetail } from '../models/workout';
import { freeSession, sessionFromDay, sessionFromDetail, setPayload, workoutExercisePayload, workoutPayload } from './session-mapping';

const bench = {
  id: 1, name: 'Press de banca', muscle_group: 'chest' as const, equipment: 'barbell' as const,
  is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null,
};

const today: Today = {
  date: '2026-11-02', weekday: 1, routine: { id: 1, name: 'Rutina' },
  day: {
    id: 10, routine_id: 1, name: 'Lunes – Pecho', weekday: 1, position: 0,
    exercises: [{
      id: 100, routine_day_id: 10, exercise: bench, position: 0, target_sets: 1, target_reps_min: null,
      target_reps_max: null, target_text: '~30', default_set_type: 'bilbo', rest_seconds: 180, notes: null,
      last_performance: null,
    }],
  },
  days: [],
};

describe('session mapping', () => {
  it('builds a session from the routine day, copying the targets', () => {
    let n = 0;
    const session = sessionFromDay(today, () => `id${n++}`, '2026-11-02T22:00:00.000Z');

    expect(session).toEqual({
      id: 'id0', routine_day_id: 10, name: 'Lunes – Pecho', date: '2026-11-02',
      started_at: '2026-11-02T22:00:00.000Z', finished_at: null, bodyweight_kg: null, notes: null,
      exercises: [{
        id: 'id1', exercise: { id: 1, name: 'Press de banca', uses_bodyweight: false, is_unilateral: false },
        position: 0, target_sets: 1, target_reps_min: null, target_reps_max: null, target_text: '~30',
        default_set_type: 'bilbo', rest_seconds: 180, notes: null, last_performance: null, sets: [],
      }],
    });
  });

  it('builds an empty free session', () => {
    expect(freeSession('w1', '2026-11-04', '2026-11-04T12:00:00.000Z')).toMatchObject({
      id: 'w1', routine_day_id: null, name: 'Sesión libre', exercises: [],
    });
  });

  it('creates the API payloads', () => {
    const session = sessionFromDay(today, () => 'x', '2026-11-02T22:00:00.000Z');
    expect(workoutPayload(session)).toEqual({
      routine_day_id: 10, date: '2026-11-02', started_at: '2026-11-02T22:00:00.000Z',
      finished_at: null, bodyweight_kg: null, notes: null,
    });
    expect(workoutExercisePayload('w', session.exercises[0])).toEqual({
      workout_id: 'w', exercise_id: 1, position: 0, target_sets: 1, target_reps_min: null, target_reps_max: null,
      target_text: '~30', default_set_type: 'bilbo', rest_seconds: 180, notes: null,
    });
    expect(setPayload('we', {
      id: 's', set_number: 2, set_type: 'normal', weight_kg: 30, reps: 8, side: 'left', rir: 2, pain_level: null, notes: null,
    })).toEqual({
      workout_exercise_id: 'we', set_number: 2, set_type: 'normal', weight_kg: 30, reps: 8, side: 'left', rir: 2, pain_level: null, notes: null,
    });
  });

  it('maps a server workout into a session', () => {
    const detail: WorkoutDetail = {
      id: 'w', routine_day_id: null, routine_day_name: null, date: '2026-10-01', started_at: 'a', finished_at: 'b',
      bodyweight_kg: 79, notes: null,
      exercises: [{
        id: 'we', workout_id: 'w', exercise: bench, position: 0, target_sets: null, target_reps_min: null,
        target_reps_max: null, target_text: null, default_set_type: 'normal', rest_seconds: 120, notes: null,
        sets: [{ id: 's', set_number: 1, set_type: 'normal', weight_kg: 80, reps: 3, side: 'both', rir: null, pain_level: null, notes: null }],
      }],
    };
    const session = sessionFromDetail(detail);
    expect(session.name).toBe('Sesión libre');
    expect(session.exercises[0].exercise).toEqual({ id: 1, name: 'Press de banca', uses_bodyweight: false, is_unilateral: false });
    expect(session.exercises[0].sets).toHaveLength(1);
    expect(session.exercises[0].last_performance).toBeNull();
  });
});
```

`frontend/src/app/core/workout/set-suggestions.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from '../models/exercise';
import type { SessionExercise } from '../models/workout';
import { bilboHint, formatNumber, formatSetLine, parseDecimal, stepReps, stepWeight, suggestNextSet } from './set-suggestions';

const set = (weight_kg: number, reps: number, set_type: WorkoutSet['set_type'] = 'normal', extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: crypto.randomUUID(), set_number: 1, set_type, weight_kg, reps, side: 'both', rir: null, pain_level: null, notes: null, ...extra,
});

const exercise = (overrides: Partial<SessionExercise> = {}): SessionExercise => ({
  id: 'we', exercise: { id: 1, name: 'Press', uses_bodyweight: false, is_unilateral: false }, position: 0,
  target_sets: 3, target_reps_min: 8, target_reps_max: 12, target_text: null, default_set_type: 'normal',
  rest_seconds: 120, notes: null, last_performance: null, sets: [], ...overrides,
});

describe('suggestNextSet', () => {
  it('copies the last set of this session without notes or pain', () => {
    const s = suggestNextSet(exercise({ sets: [set(30, 10, 'normal', { side: 'left', pain_level: 4, notes: 'x', rir: 2 })] }));
    expect(s).toEqual({ weight_kg: 30, reps: 10, set_type: 'normal', side: 'left', rir: 2, pain_level: null, notes: null });
  });
  it('uses the first working set of last time when the session has no sets', () => {
    const s = suggestNextSet(exercise({
      last_performance: { workout_id: 'w', date: '2026-10-26', sets: [set(20, 10, 'warmup'), set(42.5, 30, 'bilbo')] },
      default_set_type: 'bilbo',
    }));
    expect(s).toMatchObject({ weight_kg: 42.5, reps: 30, set_type: 'bilbo' });
  });
  it('falls back to the target reps', () => {
    expect(suggestNextSet(exercise())).toMatchObject({ weight_kg: 0, reps: 12, set_type: 'normal' });
  });
});

describe('steppers and parsing', () => {
  it('steps weight by 2.5 kg and never below zero', () => {
    expect(stepWeight(40, 2.5)).toBe(42.5);
    expect(stepWeight(1, -2.5)).toBe(0);
  });
  it('steps reps by one and never below zero', () => {
    expect(stepReps(5, 1)).toBe(6);
    expect(stepReps(0, -1)).toBe(0);
  });
  it('parses decimals with comma or point', () => {
    expect(parseDecimal('42,5', 0)).toBe(42.5);
    expect(parseDecimal('30.25', 0)).toBe(30.25);
    expect(parseDecimal('abc', 7)).toBe(7);
    expect(parseDecimal('-3', 7)).toBe(7);
  });
  it('formats numbers with a decimal comma', () => {
    expect(formatNumber(42.5)).toBe('42,5');
    expect(formatNumber(40)).toBe('40');
  });
});

describe('bilboHint', () => {
  it('targets one more rep than the best bilbo set last time', () => {
    const hint = bilboHint(exercise({
      default_set_type: 'bilbo',
      last_performance: { workout_id: 'w', date: 'd', sets: [set(42.5, 31, 'bilbo')] },
    }));
    expect(hint).toEqual({ target: 32, suggestIncrease: false });
  });
  it('suggests increasing the load from 35 reps', () => {
    expect(bilboHint(exercise({ default_set_type: 'bilbo', sets: [set(42.5, 36, 'bilbo')] })).suggestIncrease).toBe(true);
  });
  it('is empty for non bilbo exercises', () => {
    expect(bilboHint(exercise())).toEqual({ target: null, suggestIncrease: false });
  });
});

describe('formatSetLine', () => {
  it('describes a set', () => {
    expect(formatSetLine(set(42.5, 30, 'bilbo'), false)).toBe('42,5 kg × 30 · Bilbo');
    expect(formatSetLine(set(0, 6), true)).toBe('6 reps');
    expect(formatSetLine(set(10, 5, 'normal', { side: 'right', pain_level: 3 }), true)).toBe('+10 kg × 5 · der. · molestia 3');
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Modelos**

`frontend/src/app/core/models/workout.ts` (reemplazar):

```ts
import type { Exercise, ExerciseSession, SetType, WorkoutSet } from './exercise';

export type ExerciseRef = Pick<Exercise, 'id' | 'name' | 'uses_bodyweight' | 'is_unilateral'>;

export type WorkoutSetInput = Omit<WorkoutSet, 'id' | 'set_number'>;

export interface SessionExercise {
  id: string;
  exercise: ExerciseRef;
  position: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_text: string | null;
  default_set_type: SetType;
  rest_seconds: number;
  notes: string | null;
  /** Lo que se hizo la última vez (solo informativo, no se sincroniza). */
  last_performance: ExerciseSession | null;
  sets: WorkoutSet[];
}

/** Documento local de una sesión (en curso o pasada). */
export interface Session {
  id: string;
  routine_day_id: number | null;
  name: string;
  date: string;
  started_at: string;
  finished_at: string | null;
  bodyweight_kg: number | null;
  notes: string | null;
  exercises: SessionExercise[];
}

export interface WorkoutSummary {
  id: string;
  routine_day_id: number | null;
  routine_day_name: string | null;
  date: string;
  started_at: string;
  finished_at: string | null;
  bodyweight_kg: number | null;
  notes: string | null;
  exercises_count: number;
  sets_count: number;
}

export interface WorkoutExerciseDetail extends Omit<SessionExercise, 'exercise' | 'last_performance'> {
  workout_id: string;
  exercise: Exercise;
}

export interface WorkoutDetail extends Omit<WorkoutSummary, 'exercises_count' | 'sets_count'> {
  exercises: WorkoutExerciseDetail[];
}
```

- [ ] **Step 4: Mapeos y sugerencias**

`frontend/src/app/core/workout/session-mapping.ts`:

```ts
import type { Exercise, ExerciseSession, WorkoutSet } from '../models/exercise';
import type { Today } from '../models/routine';
import type { ExerciseRef, Session, SessionExercise, WorkoutDetail } from '../models/workout';

const ref = (exercise: Exercise | ExerciseRef): ExerciseRef => ({
  id: exercise.id,
  name: exercise.name,
  uses_bodyweight: exercise.uses_bodyweight,
  is_unilateral: exercise.is_unilateral,
});

/** Copia la plantilla del día (ejercicios + objetivos) a una sesión nueva. */
export function sessionFromDay(today: Today, makeId: () => string, now: string): Session {
  const day = today.day!;
  const id = makeId();
  return {
    id,
    routine_day_id: day.id,
    name: day.name,
    date: today.date,
    started_at: now,
    finished_at: null,
    bodyweight_kg: null,
    notes: null,
    exercises: day.exercises.map((item, position) => ({
      id: makeId(),
      exercise: ref(item.exercise),
      position,
      target_sets: item.target_sets,
      target_reps_min: item.target_reps_min,
      target_reps_max: item.target_reps_max,
      target_text: item.target_text,
      default_set_type: item.default_set_type,
      rest_seconds: item.rest_seconds,
      notes: item.notes,
      last_performance: item.last_performance,
      sets: [],
    })),
  };
}

export function freeSession(id: string, date: string, now: string): Session {
  return { id, routine_day_id: null, name: 'Sesión libre', date, started_at: now, finished_at: null, bodyweight_kg: null, notes: null, exercises: [] };
}

/** Ejercicio agregado solo para esta sesión (sin objetivos de rutina). */
export function sessionExerciseFrom(
  exercise: Exercise,
  id: string,
  position: number,
  lastPerformance: ExerciseSession | null,
): SessionExercise {
  return {
    id,
    exercise: ref(exercise),
    position,
    target_sets: null,
    target_reps_min: null,
    target_reps_max: null,
    target_text: null,
    default_set_type: 'normal',
    rest_seconds: 150,
    notes: null,
    last_performance: lastPerformance,
    sets: [],
  };
}

export function sessionFromDetail(detail: WorkoutDetail): Session {
  return {
    id: detail.id,
    routine_day_id: detail.routine_day_id,
    name: detail.routine_day_name ?? 'Sesión libre',
    date: detail.date,
    started_at: detail.started_at,
    finished_at: detail.finished_at,
    bodyweight_kg: detail.bodyweight_kg,
    notes: detail.notes,
    exercises: detail.exercises.map(({ workout_id: _w, exercise, ...item }) => ({
      ...item,
      exercise: ref(exercise),
      last_performance: null,
    })),
  };
}

export function workoutPayload(session: Session) {
  const { routine_day_id, date, started_at, finished_at, bodyweight_kg, notes } = session;
  return { routine_day_id, date, started_at, finished_at, bodyweight_kg, notes };
}

export function workoutExercisePayload(workoutId: string, item: SessionExercise) {
  return {
    workout_id: workoutId,
    exercise_id: item.exercise.id,
    position: item.position,
    target_sets: item.target_sets,
    target_reps_min: item.target_reps_min,
    target_reps_max: item.target_reps_max,
    target_text: item.target_text,
    default_set_type: item.default_set_type,
    rest_seconds: item.rest_seconds,
    notes: item.notes,
  };
}

export function setPayload(workoutExerciseId: string, set: WorkoutSet) {
  const { id: _id, ...rest } = set;
  return { workout_exercise_id: workoutExerciseId, ...rest };
}
```

`frontend/src/app/core/workout/set-suggestions.ts`:

```ts
import { formatKg } from '../format/format';
import type { WorkoutSet } from '../models/exercise';
import { SET_TYPE_LABELS } from '../models/labels';
import type { SessionExercise, WorkoutSetInput } from '../models/workout';

export const BILBO_INCREASE_REPS = 35;

export function toSetInput(set: WorkoutSet): WorkoutSetInput {
  const { id: _id, set_number: _n, ...input } = set;
  return input;
}

/** Valores iniciales de la próxima serie: la anterior de hoy, o la primera efectiva de la última vez. */
export function suggestNextSet(item: SessionExercise): WorkoutSetInput {
  const lastHere = item.sets.at(-1);
  if (lastHere) {
    return { ...toSetInput(lastHere), pain_level: null, notes: null };
  }
  const previous = item.last_performance?.sets;
  const reference = previous?.find((s) => s.set_type !== 'warmup') ?? previous?.[0];
  return {
    weight_kg: reference?.weight_kg ?? 0,
    reps: reference?.reps ?? item.target_reps_max ?? item.target_reps_min ?? 10,
    set_type: item.default_set_type,
    side: 'both',
    rir: null,
    pain_level: null,
    notes: null,
  };
}

export function stepWeight(value: number, delta: number): number {
  return Math.max(0, Math.round((value + delta) * 100) / 100);
}

export function stepReps(value: number, delta: number): number {
  return Math.max(0, Math.round(value + delta));
}

/** "42,5" o "42.5" → 42.5; texto inválido o negativo → fallback. */
export function parseDecimal(text: string, fallback: number): number {
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : fallback;
}

const numberFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2, useGrouping: false });

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function bilboHint(item: SessionExercise): { target: number | null; suggestIncrease: boolean } {
  if (item.default_set_type !== 'bilbo') {
    return { target: null, suggestIncrease: false };
  }
  const bestReps = (sets: WorkoutSet[] | undefined) => {
    const bilbo = (sets ?? []).filter((s) => s.set_type === 'bilbo').map((s) => s.reps);
    return bilbo.length ? Math.max(...bilbo) : null;
  };
  const last = bestReps(item.last_performance?.sets);
  const today = bestReps(item.sets);
  return {
    target: last === null ? null : last + 1,
    suggestIncrease: (today ?? last ?? 0) >= BILBO_INCREASE_REPS,
  };
}

const SIDE_SHORT = { both: '', left: 'izq.', right: 'der.' } as const;

export function formatSetLine(set: WorkoutSet, usesBodyweight: boolean): string {
  const load = usesBodyweight
    ? set.weight_kg > 0 ? `+${formatKg(set.weight_kg)} × ${set.reps}` : `${set.reps} reps`
    : `${formatKg(set.weight_kg)} × ${set.reps}`;
  const parts = [load];
  if (set.set_type !== 'normal') parts.push(SET_TYPE_LABELS[set.set_type]);
  if (set.side !== 'both') parts.push(SIDE_SHORT[set.side]);
  if (set.rir !== null) parts.push(`RIR ${set.rir}`);
  if (set.pain_level) parts.push(`molestia ${set.pain_level}`);
  return parts.join(' · ');
}
```

`frontend/src/app/core/api/workouts-api.ts`:

```ts
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Paginated } from '../models/exercise';
import type { WorkoutDetail, WorkoutSummary } from '../models/workout';

@Injectable({ providedIn: 'root' })
export class WorkoutsApi {
  private readonly http = inject(HttpClient);

  list(page = 1): Promise<Paginated<WorkoutSummary>> {
    const params = new HttpParams().set('page', page);
    return firstValueFrom(this.http.get<Paginated<WorkoutSummary>>('/api/workouts', { params }));
  }

  async get(id: string): Promise<WorkoutDetail> {
    return (await firstValueFrom(this.http.get<{ data: WorkoutDetail }>(`/api/workouts/${id}`))).data;
  }
}
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): add session models, payload mapping and set suggestions"
```

---

### Task 5: `WorkoutSessionService`

**Files:**
- Create: `frontend/src/app/core/workout/workout-session.service.ts`
- Test: `frontend/src/app/core/workout/workout-session.service.spec.ts`

**Interfaces:**
- Consumes: `LOCAL_DB`, `SyncService.enqueue`, `newId`, mapeos (Task 4), `WorkoutsApi.get`.
- Produces: `WorkoutSessionService` con
  - `session: Signal<Session | null>` (sesión abierta), `activeId: Signal<string | null>` (sesión en curso).
  - `restoreActive(): Promise<Session | null>`, `open(id): Promise<Session>`.
  - `startFromDay(today): Promise<Session>`, `startFree(date): Promise<Session>`.
  - `addExercise(exercise, lastPerformance?)`, `removeExercise(workoutExerciseId)`.
  - `addSet(workoutExerciseId, input): Promise<WorkoutSet>`, `updateSet(workoutExerciseId, setId, input)`, `deleteSet(workoutExerciseId, setId)`.
  - `finish(bodyweightKg: number | null)`, `remove()`.

- [ ] **Step 1: Escribir el test que falla**

`frontend/src/app/core/workout/workout-session.service.spec.ts`:

```ts
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_DB, LocalDb } from '../local-db/local-db';
import type { Today } from '../models/routine';
import { SyncService } from '../sync/sync.service';
import { WorkoutSessionService } from './workout-session.service';

const bench = {
  id: 1, name: 'Press de banca', muscle_group: 'chest' as const, equipment: 'barbell' as const,
  is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null,
};
const pullUps = { ...bench, id: 2, name: 'Dominadas', uses_bodyweight: true };

const today: Today = {
  date: '2026-11-02', weekday: 1, routine: { id: 1, name: 'Rutina' },
  day: {
    id: 10, routine_id: 1, name: 'Lunes', weekday: 1, position: 0,
    exercises: [{
      id: 100, routine_day_id: 10, exercise: bench, position: 0, target_sets: 3, target_reps_min: 8,
      target_reps_max: 12, target_text: null, default_set_type: 'normal', rest_seconds: 120, notes: null,
      last_performance: null,
    }],
  },
  days: [],
};

const setInput = { weight_kg: 30, reps: 10, set_type: 'normal' as const, side: 'both' as const, rir: null, pain_level: null, notes: null };

describe('WorkoutSessionService', () => {
  let db: LocalDb;
  let enqueue: ReturnType<typeof vi.fn>;

  function create(): WorkoutSessionService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: LOCAL_DB, useValue: db }, { provide: SyncService, useValue: { enqueue } }],
    });
    return TestBed.inject(WorkoutSessionService);
  }

  beforeEach(() => {
    db = new LocalDb(`test-${crypto.randomUUID()}`);
    enqueue = vi.fn().mockResolvedValue(undefined);
  });

  it('starts from the routine day and queues the workout before its exercises', async () => {
    const service = create();
    const session = await service.startFromDay(today);

    expect(service.activeId()).toBe(session.id);
    expect(enqueue.mock.calls.map(([method, url]) => `${method} ${url}`)).toEqual([
      `PUT /api/workouts/${session.id}`,
      `PUT /api/workout-exercises/${session.exercises[0].id}`,
    ]);
    expect(enqueue.mock.calls[0][2]).toMatchObject({ routine_day_id: 10, date: '2026-11-02' });
  });

  it('numbers sets, persists them and restores the active session after a reload', async () => {
    const service = create();
    const session = await service.startFromDay(today);
    const exerciseId = session.exercises[0].id;

    const first = await service.addSet(exerciseId, setInput);
    const second = await service.addSet(exerciseId, { ...setInput, reps: 8 });
    expect([first.set_number, second.set_number]).toEqual([1, 2]);
    expect(enqueue).toHaveBeenLastCalledWith('PUT', `/api/workout-sets/${second.id}`, expect.objectContaining({
      workout_exercise_id: exerciseId, set_number: 2, reps: 8,
    }));

    const reloaded = create();
    const restored = await reloaded.restoreActive();
    expect(restored?.exercises[0].sets.map((s) => s.reps)).toEqual([10, 8]);
  });

  it('updates and deletes sets', async () => {
    const service = create();
    const session = await service.startFromDay(today);
    const exerciseId = session.exercises[0].id;
    const set = await service.addSet(exerciseId, setInput);

    await service.updateSet(exerciseId, set.id, { ...setInput, reps: 12 });
    expect(service.session()!.exercises[0].sets[0]).toMatchObject({ id: set.id, set_number: 1, reps: 12 });

    await service.deleteSet(exerciseId, set.id);
    expect(service.session()!.exercises[0].sets).toEqual([]);
    expect(enqueue).toHaveBeenLastCalledWith('DELETE', `/api/workout-sets/${set.id}`);
  });

  it('adds and removes exercises only for this session', async () => {
    const service = create();
    const session = await service.startFree('2026-11-04');

    const added = await service.addExercise(pullUps);
    expect(added.position).toBe(0);
    expect(enqueue).toHaveBeenLastCalledWith('PUT', `/api/workout-exercises/${added.id}`, expect.objectContaining({
      workout_id: session.id, exercise_id: 2,
    }));

    await service.removeExercise(added.id);
    expect(service.session()!.exercises).toEqual([]);
    expect(enqueue).toHaveBeenLastCalledWith('DELETE', `/api/workout-exercises/${added.id}`);
  });

  it('finishes the session and clears the active one', async () => {
    const service = create();
    const session = await service.startFromDay(today);

    await service.finish(78.5);

    expect(service.activeId()).toBeNull();
    expect(enqueue).toHaveBeenLastCalledWith('PUT', `/api/workouts/${session.id}`, expect.objectContaining({
      bodyweight_kg: 78.5, finished_at: expect.any(String),
    }));
    expect(await create().restoreActive()).toBeNull();
  });

  it('removes a session', async () => {
    const service = create();
    const session = await service.startFromDay(today);

    await service.remove();

    expect(service.activeId()).toBeNull();
    expect(service.session()).toBeNull();
    expect(await db.sessions.get(session.id)).toBeUndefined();
    expect(enqueue).toHaveBeenLastCalledWith('DELETE', `/api/workouts/${session.id}`);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`frontend/src/app/core/workout/workout-session.service.ts`:

```ts
import { Injectable, inject, signal } from '@angular/core';
import { WorkoutsApi } from '../api/workouts-api';
import { newId } from '../local-db/ids';
import { LOCAL_DB } from '../local-db/local-db';
import type { Exercise, ExerciseSession, WorkoutSet } from '../models/exercise';
import type { Today } from '../models/routine';
import type { Session, SessionExercise, WorkoutSetInput } from '../models/workout';
import { SyncService } from '../sync/sync.service';
import {
  freeSession,
  sessionExerciseFrom,
  sessionFromDay,
  sessionFromDetail,
  setPayload,
  workoutExercisePayload,
  workoutPayload,
} from './session-mapping';

const ACTIVE_KEY = 'activeSessionId';

/** Mantiene la sesión abierta en IndexedDB y encola cada cambio para la API. */
@Injectable({ providedIn: 'root' })
export class WorkoutSessionService {
  private readonly db = inject(LOCAL_DB);
  private readonly sync = inject(SyncService);
  private readonly workoutsApi = inject(WorkoutsApi);

  readonly session = signal<Session | null>(null);
  readonly activeId = signal<string | null>(null);

  async restoreActive(): Promise<Session | null> {
    const entry = await this.db.cache.get(ACTIVE_KEY);
    const id = (entry?.value as string | undefined) ?? null;
    const session = id ? ((await this.db.sessions.get(id)) ?? null) : null;
    this.activeId.set(session ? session.id : null);
    if (session) this.session.set(session);
    return session;
  }

  /** Abre una sesión: la copia local si existe; si no, la descarga del servidor. */
  async open(id: string): Promise<Session> {
    const current = this.session();
    if (current?.id === id) return current;
    const local = await this.db.sessions.get(id);
    const session = local ?? sessionFromDetail(await this.workoutsApi.get(id));
    if (!local) await this.db.sessions.put(session);
    this.session.set(session);
    return session;
  }

  async startFromDay(today: Today): Promise<Session> {
    const session = sessionFromDay(today, newId, new Date().toISOString());
    await this.begin(session);
    for (const item of session.exercises) {
      await this.sync.enqueue('PUT', `/api/workout-exercises/${item.id}`, workoutExercisePayload(session.id, item));
    }
    return session;
  }

  async startFree(date: string): Promise<Session> {
    const session = freeSession(newId(), date, new Date().toISOString());
    await this.begin(session);
    return session;
  }

  async addExercise(exercise: Exercise, lastPerformance: ExerciseSession | null = null): Promise<SessionExercise> {
    const session = this.require();
    const item = sessionExerciseFrom(exercise, newId(), session.exercises.length, lastPerformance);
    await this.save({ ...session, exercises: [...session.exercises, item] });
    await this.sync.enqueue('PUT', `/api/workout-exercises/${item.id}`, workoutExercisePayload(session.id, item));
    return item;
  }

  async removeExercise(workoutExerciseId: string): Promise<void> {
    const session = this.require();
    await this.save({ ...session, exercises: session.exercises.filter((e) => e.id !== workoutExerciseId) });
    await this.sync.enqueue('DELETE', `/api/workout-exercises/${workoutExerciseId}`);
  }

  async addSet(workoutExerciseId: string, input: WorkoutSetInput): Promise<WorkoutSet> {
    const item = this.exercise(workoutExerciseId);
    const set: WorkoutSet = {
      id: newId(),
      set_number: Math.max(0, ...item.sets.map((s) => s.set_number)) + 1,
      ...input,
    };
    await this.replaceExercise({ ...item, sets: [...item.sets, set] });
    await this.sync.enqueue('PUT', `/api/workout-sets/${set.id}`, setPayload(item.id, set));
    return set;
  }

  async updateSet(workoutExerciseId: string, setId: string, input: WorkoutSetInput): Promise<void> {
    const item = this.exercise(workoutExerciseId);
    const sets = item.sets.map((s) => (s.id === setId ? { ...s, ...input } : s));
    await this.replaceExercise({ ...item, sets });
    const updated = sets.find((s) => s.id === setId)!;
    await this.sync.enqueue('PUT', `/api/workout-sets/${setId}`, setPayload(item.id, updated));
  }

  async deleteSet(workoutExerciseId: string, setId: string): Promise<void> {
    const item = this.exercise(workoutExerciseId);
    await this.replaceExercise({ ...item, sets: item.sets.filter((s) => s.id !== setId) });
    await this.sync.enqueue('DELETE', `/api/workout-sets/${setId}`);
  }

  async finish(bodyweightKg: number | null): Promise<void> {
    const session = this.require();
    const finished = { ...session, finished_at: new Date().toISOString(), bodyweight_kg: bodyweightKg };
    await this.save(finished);
    await this.sync.enqueue('PUT', `/api/workouts/${session.id}`, workoutPayload(finished));
    await this.clearActive(session.id);
  }

  async remove(): Promise<void> {
    const session = this.require();
    await this.db.sessions.delete(session.id);
    this.session.set(null);
    await this.sync.enqueue('DELETE', `/api/workouts/${session.id}`);
    await this.clearActive(session.id);
  }

  private async begin(session: Session): Promise<void> {
    await this.save(session);
    await this.db.cache.put({ key: ACTIVE_KEY, value: session.id, updatedAt: Date.now() });
    this.activeId.set(session.id);
    await this.sync.enqueue('PUT', `/api/workouts/${session.id}`, workoutPayload(session));
  }

  private async clearActive(id: string): Promise<void> {
    if (this.activeId() === id) {
      await this.db.cache.delete(ACTIVE_KEY);
      this.activeId.set(null);
    }
  }

  private require(): Session {
    const session = this.session();
    if (!session) throw new Error('No hay una sesión abierta.');
    return session;
  }

  private exercise(id: string): SessionExercise {
    const item = this.require().exercises.find((e) => e.id === id);
    if (!item) throw new Error('El ejercicio no pertenece a la sesión.');
    return item;
  }

  private replaceExercise(item: SessionExercise): Promise<void> {
    const session = this.require();
    return this.save({ ...session, exercises: session.exercises.map((e) => (e.id === item.id ? item : e)) });
  }

  private async save(session: Session): Promise<void> {
    this.session.set(session);
    await this.db.sessions.put(session);
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): add workout session service backed by IndexedDB and the outbox"
```

---

### Task 6: Temporizador de descanso, indicador de sincronización y arranque de la app

**Files:**
- Create: `frontend/src/app/core/workout/rest-timer.service.ts`
- Create: `frontend/src/app/shared/ui/rest-timer-bar.ts`, `frontend/src/app/shared/ui/sync-indicator.ts`
- Modify: `frontend/src/app/layout/shell.ts`, `frontend/src/app/app.ts`, `frontend/src/app/features/auth/login-page.ts`
- Test: `frontend/src/app/core/workout/rest-timer.service.spec.ts`

**Interfaces:**
- Consumes: `SyncService`, `syncLabel`, `WorkoutSessionService.restoreActive`.
- Produces:
  - `remainingSeconds(endsAt, now)`.
  - `RestTimerService`: `remaining: Signal<number>`, `running: Signal<boolean>`, `start(seconds)`, `add(seconds)`, `stop()`. Persiste `endsAt` en `localStorage` (`gymtracker.restEndsAt`) y vibra al terminar.
  - `<app-rest-timer-bar />`, `<app-sync-indicator />` en el shell.

- [ ] **Step 1: Escribir el test que falla**

`frontend/src/app/core/workout/rest-timer.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestTimerService, remainingSeconds } from './rest-timer.service';

describe('remainingSeconds', () => {
  it('rounds up and never goes below zero', () => {
    expect(remainingSeconds(10_500, 0)).toBe(11);
    expect(remainingSeconds(1_000, 5_000)).toBe(0);
    expect(remainingSeconds(null, 0)).toBe(0);
  });
});

describe('RestTimerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T22:00:00Z'));
    localStorage.clear();
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true });
  });

  afterEach(() => vi.useRealTimers());

  it('counts down, survives a reload and vibrates at the end', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(90);
    expect(timer.remaining()).toBe(90);

    vi.advanceTimersByTime(30_000);
    expect(timer.remaining()).toBe(60);

    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(RestTimerService);
    expect(reloaded.remaining()).toBe(60);

    vi.advanceTimersByTime(61_000);
    expect(reloaded.running()).toBe(false);
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it('adds time and stops', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(60);
    timer.add(30);
    expect(timer.remaining()).toBe(90);

    timer.stop();
    expect(timer.running()).toBe(false);
    expect(localStorage.getItem('gymtracker.restEndsAt')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Temporizador**

`frontend/src/app/core/workout/rest-timer.service.ts`:

```ts
import { Injectable, computed, signal } from '@angular/core';

const STORAGE_KEY = 'gymtracker.restEndsAt';

export function remainingSeconds(endsAt: number | null, now: number): number {
  return endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function readStored(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return value > Date.now() ? value : null;
  } catch {
    return null;
  }
}

/** Basado en la hora de término: sigue correcto aunque se recargue la página o se bloquee el teléfono. */
@Injectable({ providedIn: 'root' })
export class RestTimerService {
  private readonly endsAt = signal<number | null>(readStored());
  private readonly now = signal(Date.now());
  private handle: ReturnType<typeof setInterval> | null = null;

  readonly remaining = computed(() => remainingSeconds(this.endsAt(), this.now()));
  readonly running = computed(() => this.remaining() > 0);

  constructor() {
    if (this.endsAt() !== null) this.tick();
  }

  start(seconds: number): void {
    this.setEndsAt(Date.now() + seconds * 1000);
  }

  add(seconds: number): void {
    this.setEndsAt(Math.max(this.endsAt() ?? 0, Date.now()) + seconds * 1000);
  }

  stop(): void {
    this.setEndsAt(null);
  }

  private setEndsAt(value: number | null): void {
    this.endsAt.set(value);
    this.now.set(Date.now());
    try {
      if (value === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Sin almacenamiento disponible: el temporizador sigue funcionando en memoria.
    }
    if (value !== null) this.tick();
  }

  private tick(): void {
    if (this.handle !== null) return;
    this.handle = setInterval(() => {
      this.now.set(Date.now());
      if (this.remaining() === 0) {
        clearInterval(this.handle!);
        this.handle = null;
        if (this.endsAt() !== null) {
          navigator.vibrate?.([300, 150, 300]);
          this.setEndsAt(null);
        }
      }
    }, 250);
  }
}
```

- [ ] **Step 4: Barra del temporizador e indicador de sincronización**

`frontend/src/app/shared/ui/rest-timer-bar.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { RestTimerService } from '../../core/workout/rest-timer.service';

@Component({
  selector: 'app-rest-timer-bar',
  imports: [HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (timer.running()) {
      <div class="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-secondary"
           role="timer" aria-live="off">
        <div class="mx-auto flex max-w-lg items-center gap-2 px-4 py-2">
          <span class="flex-1 text-lg font-semibold tabular-nums">Descanso {{ label() }}</span>
          <button hlmBtn variant="outline" class="h-12" (click)="timer.add(30)">+30 s</button>
          <button hlmBtn variant="ghost" class="h-12" (click)="timer.stop()">Saltar</button>
        </div>
      </div>
    }
  `,
})
export class RestTimerBar {
  protected readonly timer = inject(RestTimerService);
  protected readonly label = computed(() => {
    const total = this.timer.remaining();
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  });
}
```

`frontend/src/app/shared/ui/sync-indicator.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SyncService } from '../../core/sync/sync.service';
import { syncLabel } from '../../core/sync/sync-label';

@Component({
  selector: 'app-sync-indicator',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="flex items-center gap-2 text-xs" [class.text-muted-foreground]="ok()" [class.text-destructive]="!ok()" aria-live="polite">
      <span class="size-2 rounded-full" [class.bg-emerald-500]="ok()" [class.bg-amber-500]="!ok()"></span>
      {{ label() }}
      @if (sync.state() === 'auth') {
        <a routerLink="/login" class="underline">Entrar</a>
      } @else if (sync.failed() > 0) {
        <button type="button" class="underline" (click)="sync.retryFailed()">Reintentar</button>
      }
    </p>
  `,
})
export class SyncIndicator {
  protected readonly sync = inject(SyncService);
  protected readonly label = computed(() => syncLabel(this.sync.state(), this.sync.pending(), this.sync.failed()));
  protected readonly ok = computed(() => ['idle', 'syncing'].includes(this.sync.state()) && this.sync.failed() === 0);
}
```

- [ ] **Step 5: Shell, arranque y login**

`frontend/src/app/layout/shell.ts` (reemplazar):

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNav } from '../shared/ui/bottom-nav';
import { RestTimerBar } from '../shared/ui/rest-timer-bar';
import { SyncIndicator } from '../shared/ui/sync-indicator';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, BottomNav, RestTimerBar, SyncIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sticky top-0 z-10 bg-background/90 backdrop-blur">
      <div class="mx-auto flex max-w-lg justify-end px-4 py-2"><app-sync-indicator /></div>
    </div>
    <main class="mx-auto max-w-lg px-4 pb-40 pt-2">
      <router-outlet />
    </main>
    <app-rest-timer-bar />
    <app-bottom-nav />
  `,
})
export class Shell {}
```

`frontend/src/app/app.ts` (reemplazar):

```ts
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SyncService } from './core/sync/sync.service';
import { WorkoutSessionService } from './core/workout/workout-session.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  constructor() {
    // Despierta la BD (Aurora) mientras el usuario mira la pantalla.
    inject(HttpClient).get('/api/health').subscribe({ error: () => undefined });
    inject(SyncService).start();
    void inject(WorkoutSessionService).restoreActive();
  }
}
```

En `frontend/src/app/features/auth/login-page.ts`: inyectar `SyncService` (`private readonly sync = inject(SyncService);`) y, justo después de `await this.auth.login(email, password);`, agregar `void this.sync.flush();`.

- [ ] **Step 6: Correr y verificar que pasan**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): add rest timer, sync indicator and app startup wiring"
```

---

### Task 7: Pantalla de registro (`/entrenamiento/:id`)

**Files:**
- Create: `frontend/src/app/features/workout/exercise-card.ts`, `frontend/src/app/features/workout/workout-page.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Test: `frontend/src/app/features/workout/exercise-card.spec.ts`

**Interfaces:**
- Consumes: `WorkoutSessionService`, `RestTimerService`, `set-suggestions`, `formatTargets`, `formatBestSet`, `formatDate`, `cachedFetch`, `ExercisesApi`, labels, `apiErrorMessage`, `SELECT_CLASS`.
- Produces: `<app-exercise-card [item] [finished]>`; ruta `/entrenamiento/:id`.

- [ ] **Step 1: Escribir el test que falla**

`frontend/src/app/features/workout/exercise-card.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { SessionExercise } from '../../core/models/workout';
import { RestTimerService } from '../../core/workout/rest-timer.service';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import { ExerciseCard } from './exercise-card';

const item: SessionExercise = {
  id: 'we1', exercise: { id: 1, name: 'Press de banca', uses_bodyweight: false, is_unilateral: false }, position: 0,
  target_sets: 1, target_reps_min: null, target_reps_max: null, target_text: '~30 reps', default_set_type: 'bilbo',
  rest_seconds: 180, notes: null,
  last_performance: {
    workout_id: 'w0', date: '2026-10-26',
    sets: [{ id: 's0', set_number: 1, set_type: 'bilbo', weight_kg: 42.5, reps: 31, side: 'both', rir: null, pain_level: null, notes: null }],
  },
  sets: [],
};

async function render(finished = false) {
  const sessions = { addSet: vi.fn().mockResolvedValue(undefined), updateSet: vi.fn(), deleteSet: vi.fn(), removeExercise: vi.fn() };
  const timer = { start: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkoutSessionService, useValue: sessions },
      { provide: RestTimerService, useValue: timer },
    ],
  });
  const fixture = TestBed.createComponent(ExerciseCard);
  fixture.componentRef.setInput('item', item);
  fixture.componentRef.setInput('finished', finished);
  await fixture.whenStable();
  return { fixture, sessions, timer, el: fixture.nativeElement as HTMLElement };
}

const button = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;

describe('ExerciseCard', () => {
  it('shows last time and the bilbo target', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('Última vez: 42,5 kg × 31 · 26/10/2026');
    expect(el.textContent).toContain('Objetivo Bilbo: 32 reps');
  });

  it('prefills from last time, steps the weight and saves the set starting the rest timer', async () => {
    const { el, fixture, sessions, timer } = await render();

    button(el, '+').click();
    await fixture.whenStable();
    button(el, 'Guardar serie').click();
    await fixture.whenStable();

    expect(sessions.addSet).toHaveBeenCalledWith('we1', {
      weight_kg: 45, reps: 31, set_type: 'bilbo', side: 'both', rir: null, pain_level: null, notes: null,
    });
    expect(timer.start).toHaveBeenCalledWith(180);
  });

  it('does not start the timer when editing a finished session', async () => {
    const { el, fixture, timer } = await render(true);
    button(el, 'Guardar serie').click();
    await fixture.whenStable();
    expect(timer.start).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Tarjeta de ejercicio**

`frontend/src/app/features/workout/exercise-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTrash2, lucideX } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { formatDate } from '../../core/format/format';
import { formatBestSet, formatRest, formatTargets } from '../../core/format/training';
import type { SetType, Side, WorkoutSet } from '../../core/models/exercise';
import { SET_TYPES, SET_TYPE_LABELS } from '../../core/models/labels';
import type { SessionExercise, WorkoutSetInput } from '../../core/models/workout';
import { RestTimerService } from '../../core/workout/rest-timer.service';
import {
  bilboHint,
  formatNumber,
  formatSetLine,
  parseDecimal,
  stepReps,
  stepWeight,
  suggestNextSet,
  toSetInput,
} from '../../core/workout/set-suggestions';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import { SELECT_CLASS } from '../../shared/ui/form-styles';

@Component({
  selector: 'app-exercise-card',
  imports: [NgIcon, HlmButton, HlmInput],
  providers: [provideIcons({ lucideTrash2, lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let ex = item();
    <article class="rounded-lg border border-border p-4">
      <header class="mb-2 flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h2 class="text-lg font-semibold">{{ ex.exercise.name }}</h2>
          @if (targetLine()) { <p class="text-sm text-muted-foreground">{{ targetLine() }}</p> }
          <p class="text-sm">{{ lastLine() }}</p>
          @if (hint().target) { <p class="text-sm font-medium text-primary">Objetivo Bilbo: {{ hint().target }} reps</p> }
          @if (hint().suggestIncrease) {
            <p class="text-sm font-medium text-primary">35+ reps limpias: sube 2,5-5 kg y vuelve a ~30.</p>
          }
        </div>
        @if (!finished()) {
          <button hlmBtn variant="ghost" size="icon-lg" (click)="removeExercise()" aria-label="Quitar ejercicio de esta sesión">
            <ng-icon name="lucideTrash2" />
          </button>
        }
      </header>

      @if (ex.sets.length) {
        <ol class="mb-3">
          @for (set of ex.sets; track set.id; let i = $index) {
            <li class="flex min-h-12 items-center border-b border-border last:border-0" [class.text-primary]="editingSetId() === set.id">
              <button type="button" class="flex-1 py-2 text-left text-base" (click)="edit(set)">
                {{ i + 1 }}. {{ setLine(set) }}
              </button>
              <button hlmBtn variant="ghost" size="icon-lg" (click)="removeSet(set)" aria-label="Borrar serie">
                <ng-icon name="lucideX" />
              </button>
            </li>
          }
        </ol>
      }

      <div class="grid grid-cols-2 gap-3">
        <div>
          <span class="mb-1 block text-xs text-muted-foreground">{{ ex.exercise.uses_bodyweight ? 'Peso extra (kg)' : 'Peso (kg)' }}</span>
          <div class="flex items-center gap-1">
            <button hlmBtn variant="outline" class="size-12 shrink-0 p-0 text-xl" (click)="patch({ weight_kg: stepWeight(entry().weight_kg, -2.5) })" aria-label="Restar 2,5 kg">−</button>
            <input hlmInput class="h-12 w-full min-w-0 text-center text-lg" inputmode="decimal" aria-label="Peso"
                   [value]="formatNumber(entry().weight_kg)"
                   (change)="patch({ weight_kg: parseDecimal($any($event.target).value, entry().weight_kg) })" />
            <button hlmBtn variant="outline" class="size-12 shrink-0 p-0 text-xl" (click)="patch({ weight_kg: stepWeight(entry().weight_kg, 2.5) })" aria-label="Sumar 2,5 kg">+</button>
          </div>
        </div>
        <div>
          <span class="mb-1 block text-xs text-muted-foreground">Reps</span>
          <div class="flex items-center gap-1">
            <button hlmBtn variant="outline" class="size-12 shrink-0 p-0 text-xl" (click)="patch({ reps: stepReps(entry().reps, -1) })" aria-label="Restar 1 rep">−</button>
            <input hlmInput class="h-12 w-full min-w-0 text-center text-lg" inputmode="numeric" aria-label="Repeticiones"
                   [value]="entry().reps"
                   (change)="patch({ reps: Math.round(parseDecimal($any($event.target).value, entry().reps)) })" />
            <button hlmBtn variant="outline" class="size-12 shrink-0 p-0 text-xl" (click)="patch({ reps: stepReps(entry().reps, 1) })" aria-label="Sumar 1 rep">+1</button>
          </div>
        </div>
      </div>

      @if (showMore()) {
        <div class="mt-3 grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-xs text-muted-foreground">Tipo
            <select [class]="selectClass" [value]="entry().set_type" (change)="patch({ set_type: $any($event.target).value })">
              @for (type of setTypes; track type) { <option [value]="type">{{ setTypeLabels[type] }}</option> }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-xs text-muted-foreground">Lado
            <select [class]="selectClass" [value]="entry().side" (change)="patch({ side: $any($event.target).value })">
              <option value="both">Ambos</option>
              <option value="left">Izquierdo</option>
              <option value="right">Derecho</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-xs text-muted-foreground">RIR
            <select [class]="selectClass" [value]="entry().rir ?? ''" (change)="patch({ rir: toNullableInt($any($event.target).value) })">
              <option value="">—</option>
              @for (n of zeroToFive; track n) { <option [value]="n">{{ n }}</option> }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-xs text-muted-foreground">Molestia (0-10)
            <select [class]="selectClass" [value]="entry().pain_level ?? ''" (change)="patch({ pain_level: toNullableInt($any($event.target).value) })">
              <option value="">—</option>
              @for (n of zeroToTen; track n) { <option [value]="n">{{ n }}</option> }
            </select>
          </label>
          <label class="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground">Nota
            <input hlmInput class="h-12 text-base" [value]="entry().notes ?? ''" (change)="patch({ notes: $any($event.target).value || null })" />
          </label>
        </div>
      }

      <div class="mt-3 flex gap-2">
        <button hlmBtn variant="ghost" class="h-12" (click)="showMore.set(!showMore())">{{ showMore() ? 'Menos' : 'Más' }}</button>
        <button hlmBtn variant="outline" class="h-12" (click)="copyPrevious()" [disabled]="!ex.sets.length">Copiar anterior</button>
        <button hlmBtn class="h-12 flex-1 text-base" (click)="save()">{{ editingSetId() ? 'Actualizar' : 'Guardar serie' }}</button>
      </div>
      @if (editingSetId()) {
        <button type="button" class="mt-2 text-sm text-muted-foreground underline" (click)="cancelEdit()">Cancelar edición</button>
      }
    </article>
  `,
})
export class ExerciseCard {
  private readonly sessions = inject(WorkoutSessionService);
  private readonly timer = inject(RestTimerService);

  readonly item = input.required<SessionExercise>();
  readonly finished = input(false);

  protected readonly Math = Math;
  protected readonly selectClass = SELECT_CLASS;
  protected readonly setTypes = SET_TYPES;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly zeroToFive = [0, 1, 2, 3, 4, 5];
  protected readonly zeroToTen = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  protected readonly stepWeight = stepWeight;
  protected readonly stepReps = stepReps;
  protected readonly parseDecimal = parseDecimal;
  protected readonly formatNumber = formatNumber;

  protected readonly entry = linkedSignal<WorkoutSetInput>(() => suggestNextSet(this.item()));
  protected readonly editingSetId = signal<string | null>(null);
  protected readonly showMore = signal(false);
  protected readonly hint = computed(() => bilboHint(this.item()));

  protected readonly targetLine = computed(() => {
    const ex = this.item();
    const parts = [
      ex.target_sets !== null ? formatTargets({ ...ex, target_sets: ex.target_sets }) : null,
      ex.target_text,
      `descanso ${formatRest(ex.rest_seconds)}`,
    ];
    return parts.filter(Boolean).join(' · ');
  });

  protected readonly lastLine = computed(() => {
    const ex = this.item();
    const last = ex.last_performance;
    const best = last ? formatBestSet(last.sets, ex.exercise.uses_bodyweight) : null;
    return last && best ? `Última vez: ${best} · ${formatDate(last.date)}` : 'Sin registros anteriores';
  });

  protected setLine(set: WorkoutSet): string {
    return formatSetLine(set, this.item().exercise.uses_bodyweight);
  }

  protected patch(changes: Partial<WorkoutSetInput>): void {
    this.entry.update((current) => ({ ...current, ...changes }));
  }

  protected toNullableInt(value: string): number | null {
    return value === '' ? null : Number(value);
  }

  protected copyPrevious(): void {
    const last = this.item().sets.at(-1);
    if (last) this.entry.set(toSetInput(last));
  }

  protected edit(set: WorkoutSet): void {
    this.editingSetId.set(set.id);
    this.entry.set(toSetInput(set));
  }

  protected cancelEdit(): void {
    this.editingSetId.set(null);
    this.entry.set(suggestNextSet(this.item()));
  }

  protected async save(): Promise<void> {
    const input = this.entry();
    const editing = this.editingSetId();
    if (editing) {
      await this.sessions.updateSet(this.item().id, editing, input);
      this.editingSetId.set(null);
      return;
    }
    await this.sessions.addSet(this.item().id, input);
    if (!this.finished()) this.timer.start(this.item().rest_seconds);
  }

  protected async removeSet(set: WorkoutSet): Promise<void> {
    if (!confirm('¿Borrar esta serie?')) return;
    await this.sessions.deleteSet(this.item().id, set.id);
    if (this.editingSetId() === set.id) this.editingSetId.set(null);
  }

  protected async removeExercise(): Promise<void> {
    const ex = this.item();
    const warning = ex.sets.length ? ` Se borrarán sus ${ex.sets.length} series.` : '';
    if (!confirm(`¿Quitar ${ex.exercise.name} de esta sesión?${warning}`)) return;
    await this.sessions.removeExercise(ex.id);
  }
}
```

Nota: `SetType` y `Side` se usan vía `$any` en el template; si el linter marca los imports `SetType`/`Side` como no usados, eliminarlos.

- [ ] **Step 4: Página de la sesión**

`frontend/src/app/features/workout/workout-page.ts`:

```ts
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { apiErrorMessage } from '../../core/api/api-error';
import { ExercisesApi } from '../../core/api/exercises-api';
import { formatDate } from '../../core/format/format';
import { cachedFetch } from '../../core/local-db/cached-fetch';
import { LOCAL_DB } from '../../core/local-db/local-db';
import type { Exercise } from '../../core/models/exercise';
import { RestTimerService } from '../../core/workout/rest-timer.service';
import { parseDecimal } from '../../core/workout/set-suggestions';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import { SELECT_CLASS } from '../../shared/ui/form-styles';
import { ExerciseCard } from './exercise-card';

@Component({
  selector: 'app-workout-page',
  imports: [RouterLink, HlmButton, HlmInput, ExerciseCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session(); as s) {
      <header class="mb-4">
        <p class="text-sm text-muted-foreground">{{ formatDate(s.date) }} · {{ isActive() ? 'En curso' : 'Terminada' }}</p>
        <h1 class="text-2xl font-bold">{{ s.name }}</h1>
      </header>

      @if (error()) { <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p> }

      <div class="flex flex-col gap-4">
        @for (item of s.exercises; track item.id) {
          <app-exercise-card [item]="item" [finished]="!isActive()" />
        } @empty {
          <p class="text-muted-foreground">Agrega un ejercicio para empezar.</p>
        }
      </div>

      <section class="mt-4">
        @if (picking()) {
          <div class="flex gap-2">
            <select [class]="selectClass" #pick aria-label="Ejercicio a agregar">
              @for (exercise of available(); track exercise.id) { <option [value]="exercise.id">{{ exercise.name }}</option> }
            </select>
            <button hlmBtn class="h-12" (click)="addExercise(+pick.value)">Agregar</button>
          </div>
          <button type="button" class="mt-2 text-sm text-muted-foreground underline" (click)="picking.set(false)">Cancelar</button>
        } @else {
          <button hlmBtn variant="outline" class="h-12 w-full" (click)="startPicking()">Agregar ejercicio</button>
        }
      </section>

      @if (isActive()) {
        <section class="mt-8 rounded-lg border border-border p-4">
          <label class="mb-3 flex flex-col gap-1 text-sm">Peso corporal hoy (opcional, kg)
            <input hlmInput class="h-12 text-base" inputmode="decimal" #bw placeholder="Ej.: 78,5" />
          </label>
          <button hlmBtn class="h-14 w-full text-base" (click)="finish(bw.value)">Terminar entrenamiento</button>
        </section>
      }

      <div class="mt-6 flex flex-col gap-2">
        <a hlmBtn variant="ghost" class="h-12" routerLink="/entrenamientos">Ver entrenamientos anteriores</a>
        <button hlmBtn variant="destructive" class="h-12" (click)="remove()">Eliminar entrenamiento</button>
      </div>
    } @else if (error()) {
      <p class="text-destructive">{{ error() }}</p>
    } @else {
      <p class="text-muted-foreground">Cargando…</p>
    }
  `,
})
export class WorkoutPage implements OnInit {
  private readonly sessions = inject(WorkoutSessionService);
  private readonly timer = inject(RestTimerService);
  private readonly exercisesApi = inject(ExercisesApi);
  private readonly db = inject(LOCAL_DB);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly selectClass = SELECT_CLASS;
  protected readonly formatDate = formatDate;
  protected readonly session = this.sessions.session;
  protected readonly isActive = computed(() => this.session()?.id === this.sessions.activeId());
  protected readonly error = signal<string | null>(null);
  protected readonly picking = signal(false);
  private readonly exercises = signal<Exercise[]>([]);
  protected readonly available = computed(() => {
    const used = new Set(this.session()?.exercises.map((e) => e.exercise.id));
    return this.exercises().filter((e) => !used.has(e.id));
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.sessions.open(this.id());
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected async startPicking(): Promise<void> {
    try {
      this.exercises.set(await cachedFetch(this.db, 'exercises', () => this.exercisesApi.list()));
      this.picking.set(true);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected async addExercise(id: number): Promise<void> {
    const exercise = this.exercises().find((e) => e.id === id);
    if (!exercise) return;
    await this.sessions.addExercise(exercise);
    this.picking.set(false);
  }

  protected async finish(bodyweightText: string): Promise<void> {
    const bodyweight = bodyweightText.trim() ? parseDecimal(bodyweightText, 0) || null : null;
    await this.sessions.finish(bodyweight);
    this.timer.stop();
    await this.router.navigateByUrl('/hoy');
  }

  protected async remove(): Promise<void> {
    if (!confirm('¿Eliminar este entrenamiento y todas sus series?')) return;
    await this.sessions.remove();
    this.timer.stop();
    await this.router.navigateByUrl('/hoy');
  }
}
```

- [ ] **Step 5: Ruta**

En `frontend/src/app/app.routes.ts`, dentro de `children` del shell:

```ts
{
  path: 'entrenamiento/:id',
  title: 'Entrenamiento · GymTracker',
  loadComponent: () => import('./features/workout/workout-page').then((m) => m.WorkoutPage),
},
```

- [ ] **Step 6: Correr y verificar**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build sin errores ni avisos.

- [ ] **Step 7: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): add workout logging screen with steppers, set editing and rest timer"
```

---

### Task 8: "Hoy" conectado al registro e historial de sesiones

**Files:**
- Modify: `frontend/src/app/features/today/today-page.ts`, `frontend/src/app/features/today/today-page.spec.ts`
- Create: `frontend/src/app/features/workout/workouts-page.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Test: `frontend/src/app/features/today/today-page.spec.ts`

**Interfaces:**
- Consumes: `WorkoutSessionService` (`activeId`, `startFromDay`, `startFree`), `cachedFetch`, `LOCAL_DB`, `WorkoutsApi.list`.
- Produces: botones "Empezar entrenamiento" / "Continuar entrenamiento" / "Sesión libre"; ruta `/entrenamientos`.

- [ ] **Step 1: Actualizar el test (falla)**

En `frontend/src/app/features/today/today-page.spec.ts`:

1. Agregar al inicio `import 'fake-indexeddb/auto';` y los imports `signal` (`@angular/core`), `vi` (`vitest`), `Component`, `Router`, `LOCAL_DB`, `LocalDb`, `WorkoutSessionService`.
2. Reemplazar la función `render` por:

```ts
@Component({ template: '' })
class Blank {}

async function render(data: Today, activeId: string | null = null) {
  const sessions = {
    activeId: signal(activeId),
    startFromDay: vi.fn().mockResolvedValue({ id: 'new-session' }),
    startFree: vi.fn().mockResolvedValue({ id: 'free-session' }),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'entrenamiento/:id', component: Blank }]),
      { provide: TodayApi, useValue: { get: () => Promise.resolve(data) } },
      { provide: WorkoutSessionService, useValue: sessions },
      { provide: LOCAL_DB, useValue: new LocalDb(`test-${crypto.randomUUID()}`) },
    ],
  });
  const fixture = TestBed.createComponent(TodayPage);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, sessions, el, text: el.textContent as string };
}
```

3. En los tests existentes, cambiar `const text = await render(...)` por `const { text } = await render(...)`.
4. Agregar:

```ts
it('starts a workout from the day', async () => {
  const { el, fixture, sessions } = await render(today);
  const start = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Empezar entrenamiento'))!;
  expect(start.disabled).toBe(false);

  start.click();
  await fixture.whenStable();

  expect(sessions.startFromDay).toHaveBeenCalledWith(today);
  expect(TestBed.inject(Router).url).toBe('/entrenamiento/new-session');
});

it('offers to continue the active workout', async () => {
  const { el } = await render(today, 'abc');
  const link = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.includes('Continuar entrenamiento'))!;
  expect(link.getAttribute('href')).toBe('/entrenamiento/abc');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (el botón está deshabilitado y no existe "Continuar").

- [ ] **Step 3: Implementar "Hoy"**

En `frontend/src/app/features/today/today-page.ts`:

1. Imports nuevos: `signal` (`@angular/core`), `Router` (`@angular/router`), `cachedFetch`, `LOCAL_DB`, `WorkoutSessionService`, `type Today`.
2. Reemplazar el bloque del botón deshabilitado y su nota:

```html
<button hlmBtn class="h-14 w-full text-base" disabled>Empezar entrenamiento</button>
<p class="mt-2 text-center text-xs text-muted-foreground">El registro de series llega en la fase 3.</p>
```

por:

```html
@if (sessions.activeId(); as activeId) {
  <a hlmBtn class="h-14 w-full text-base" [routerLink]="['/entrenamiento', activeId]">Continuar entrenamiento</a>
} @else {
  <button hlmBtn class="h-14 w-full text-base" [disabled]="starting()" (click)="start(t)">Empezar entrenamiento</button>
}
```

3. En la rama de día de descanso (después de la lista de días) y en la de "sin rutina" (después del enlace a rutinas), agregar:

```html
@if (sessions.activeId(); as activeId) {
  <a hlmBtn class="mt-4 h-12 w-full" [routerLink]="['/entrenamiento', activeId]">Continuar entrenamiento</a>
} @else {
  <button hlmBtn variant="outline" class="mt-4 h-12 w-full" [disabled]="starting()" (click)="startFree(t)">Sesión libre</button>
}
```

4. Al final del bloque `@if (today.value(); as t)` (antes de `} @else if (today.error())`), agregar:

```html
<a routerLink="/entrenamientos" class="mt-6 block text-center text-sm text-muted-foreground underline">Ver entrenamientos anteriores</a>
```

5. En la clase:

```ts
private readonly db = inject(LOCAL_DB);
private readonly router = inject(Router);
protected readonly sessions = inject(WorkoutSessionService);
protected readonly starting = signal(false);

protected readonly today = resource({ loader: () => cachedFetch(this.db, 'today', () => this.api.get()) });

protected async start(today: Today): Promise<void> {
  this.starting.set(true);
  try {
    const session = await this.sessions.startFromDay(today);
    await this.router.navigate(['/entrenamiento', session.id]);
  } finally {
    this.starting.set(false);
  }
}

protected async startFree(today: Today): Promise<void> {
  this.starting.set(true);
  try {
    const session = await this.sessions.startFree(today.date);
    await this.router.navigate(['/entrenamiento', session.id]);
  } finally {
    this.starting.set(false);
  }
}
```

(reemplazando la declaración anterior de `today`).

- [ ] **Step 4: Historial de sesiones**

`frontend/src/app/features/workout/workouts-page.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { apiErrorMessage } from '../../core/api/api-error';
import { WorkoutsApi } from '../../core/api/workouts-api';
import { formatDate } from '../../core/format/format';
import type { WorkoutSummary } from '../../core/models/workout';

@Component({
  selector: 'app-workouts-page',
  imports: [RouterLink, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/hoy" class="mb-4 inline-block text-sm text-muted-foreground">← Hoy</a>
    <h1 class="mb-4 text-2xl font-bold">Entrenamientos</h1>

    @if (error()) { <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p> }

    <ul class="flex flex-col gap-2">
      @for (w of workouts(); track w.id) {
        <li>
          <a [routerLink]="['/entrenamiento', w.id]" class="block rounded-lg border border-border p-4">
            <span class="block font-medium">{{ w.routine_day_name ?? 'Sesión libre' }}</span>
            <span class="text-sm text-muted-foreground">
              {{ formatDate(w.date) }} · {{ w.exercises_count }} ejercicios · {{ w.sets_count }} series
              @if (!w.finished_at) { · sin terminar }
            </span>
          </a>
        </li>
      } @empty {
        @if (!loading()) { <li class="text-muted-foreground">Todavía no hay entrenamientos sincronizados.</li> }
      }
    </ul>

    @if (hasMore()) {
      <button hlmBtn variant="outline" class="mt-4 h-12 w-full" [disabled]="loading()" (click)="load()">Cargar más</button>
    }
  `,
})
export class WorkoutsPage {
  private readonly api = inject(WorkoutsApi);

  protected readonly formatDate = formatDate;
  protected readonly workouts = signal<WorkoutSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly error = signal<string | null>(null);
  private page = 0;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.list(this.page + 1);
      this.page = result.meta.current_page;
      this.workouts.update((list) => [...list, ...result.data]);
      this.hasMore.set(result.meta.current_page < result.meta.last_page);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
```

En `frontend/src/app/app.routes.ts`, dentro de `children` del shell:

```ts
{
  path: 'entrenamientos',
  title: 'Entrenamientos · GymTracker',
  loadComponent: () => import('./features/workout/workouts-page').then((m) => m.WorkoutsPage),
},
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): start, continue and free workouts from today, plus workout history"
```

---

### Task 9: Verificación de punta a punta

- [ ] **Step 1: Suites completas**

Run: `(cd backend && ./vendor/bin/pest) && (cd frontend && npx ng test --watch=false && npx ng build)`
Expected: todo PASS.

- [ ] **Step 2: API real vía proxy (Postgres)**

Reiniciar backend y dev server (ver CLAUDE.md), `migrate:fresh --seed`, iniciar sesión con curl y ejecutar en orden: `PUT /api/workouts/{ulid}`, `PUT /api/workout-exercises/{ulid}` (Dominadas), dos `PUT /api/workout-sets/{ulid}`, repetir un `PUT` (idempotente), `GET /api/workouts` (`sets_count` = 2) y `GET /api/today` (si hoy usa Dominadas, `last_performance` refleja la sesión).

- [ ] **Step 3: Verificación manual (usuario, en el celular o vista móvil)**

1. "Hoy" → "Empezar entrenamiento": se abren los ejercicios del día con "Última vez" y objetivos.
2. Guardar una serie con `+`/`−`: aparece al instante, arranca el temporizador, el indicador pasa a "Sincronizado".
3. Recargar la página: la sesión sigue ahí ("Continuar entrenamiento") y el temporizador sigue contando.
4. Modo avión (o DevTools → Network → Offline): guardar 2 series → indicador "Sin conexión · 2 pendientes"; volver a conectar → "Sincronizado".
5. Editar una serie tocándola, borrar otra, agregar un ejercicio extra y quitar otro.
6. "Terminar entrenamiento" con peso corporal → vuelve a "Hoy"; "Ver entrenamientos anteriores" lo lista; abrirlo y editar una serie.

- [ ] **Step 4: Commit (si hubo ajustes)**

```bash
git add -A
git commit -m "chore: phase 3 verification"
```
