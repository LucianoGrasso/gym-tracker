# Fase 2 — Ejercicios, rutinas y "Hoy": plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario pueda gestionar ejercicios (CRUD, buscar, filtrar, archivar, ver historial) y rutinas (días, ejercicios con objetivos, reordenar arrastrando, duplicar, activar), y ver en "Hoy" el día que le toca con lo que hizo la última vez.

**Architecture:** API REST en Laravel con Policies (`manage`) por recurso, Form Requests y API Resources; la lógica de "última vez" vive en `App\Services\LastPerformanceService`. En Angular, servicios HTTP tipados (`core/api`) que devuelven Promises, páginas standalone con Signals y `resource()`, Angular CDK para drag & drop, y un interceptor que reintenta una vez ante `419` (CSRF expirado).

**Tech Stack:** Laravel 13, Pest, Angular 22, spartan/ui (button, input, label, textarea, badge), @ng-icons/lucide, Angular CDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-gymtracker-design.md` (secciones 5, 6, 7.1-7.2 y 11).

## Global Constraints

- Código en inglés; textos de UI y mensajes de validación visibles en **español (Chile)**.
- Toda ruta `/api/*` (salvo `/api/health`) bajo `auth:sanctum`; cada recurso con Policy `manage`. Recursos ajenos: `404` si el modelo tiene `BelongsToUser` (lo filtra el scope), `403` en los demás.
- Respuestas JSON envueltas en `{"data": ...}` (API Resources). Crear → `201`, borrar → `204`, conflicto → `409 {"message"}`, validación → `422`.
- Ejercicios con historial **no se borran** (409); se archivan. Archivar no toca rutinas ni historial.
- `weekday`: 1 = lunes … 7 = domingo, único por rutina, nullable. Zona del usuario `config('app.user_timezone')` = `America/Santiago`.
- `weight_kg` se serializa como número (`float`).
- UI mobile-first, tema oscuro, objetivos táctiles ≥ 48 px (`h-12`), formato `42,5 kg` y `dd/mm/aaaa` (usar `core/format`).
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

```
backend/
├── config/app.php                                   + user_timezone
├── routes/api.php                                   rutas de la fase
├── app/Policies/{Exercise,Routine,RoutineDay,RoutineDayExercise}Policy.php
├── app/Support/Reorder.php                          reordenar por lista de ids
├── app/Services/LastPerformanceService.php          última sesión con series por ejercicio
├── app/Http/Requests/{ListExercisesRequest,ExerciseRequest,RoutineRequest,
│                      RoutineDayRequest,RoutineDayExerciseRequest,ReorderRequest}.php
├── app/Http/Resources/{Exercise,Routine,RoutineDay,RoutineDayExercise,
│                       ExerciseSession,WorkoutSet}Resource.php
├── app/Http/Controllers/{ExerciseController,ExerciseHistoryController,RoutineController,
│                         RoutineDayController,RoutineDayExerciseController,TodayController}.php
└── tests/Feature/Api/{Exercises,ExerciseHistory,Routines,RoutineDays,
                       RoutineDayExercises,Today}Test.php

frontend/src/app/
├── app.config.ts                                    + withComponentInputBinding, interceptor
├── app.routes.ts                                    rutas anidadas de ejercicios y rutinas
├── core/models/{exercise,routine,labels}.ts
├── core/format/training.ts                          formatTargets, formatBestSet, formatRest
├── core/api/{api-error,exercises-api,routines-api,today-api}.ts
├── core/auth/csrf-retry.interceptor.ts
├── shared/ui/form-styles.ts                         clases para <select> nativo
└── features/
    ├── exercises/{exercises-page,exercise-form-page,exercise-detail-page,filter-exercises}.ts
    ├── routines/{routines-page,routine-detail-page,routine-day-page,routine-exercise-form}.ts
    └── today/today-page.ts
```

---

### Task 1: Policies y API de ejercicios

**Files:**
- Modify: `backend/config/app.php`, `backend/app/Models/Exercise.php`, `backend/routes/api.php`, `backend/.env.example`
- Create: `backend/app/Policies/ExercisePolicy.php`, `RoutinePolicy.php`, `RoutineDayPolicy.php`, `RoutineDayExercisePolicy.php`
- Create: `backend/app/Http/Requests/ListExercisesRequest.php`, `ExerciseRequest.php`
- Create: `backend/app/Http/Resources/ExerciseResource.php`
- Create: `backend/app/Http/Controllers/ExerciseController.php`
- Test: `backend/tests/Feature/Api/ExercisesTest.php`

**Interfaces:**
- Produces:
  - `GET /api/exercises?search=&muscle_group=&archived=0|1` → lista ordenada por nombre (por defecto solo activos).
  - `POST /api/exercises`, `GET|PUT|DELETE /api/exercises/{id}`, `POST /api/exercises/{id}/archive|restore`.
  - `ExerciseResource`: `{id, name, muscle_group, equipment, is_unilateral, uses_bodyweight, notes, archived_at (ISO|null), has_history? (bool, solo si se cargó)}`.
  - Policies con habilidad `manage` para `Exercise`, `Routine`, `RoutineDay`, `RoutineDayExercise`.
  - `Exercise::routineDayExercises(): HasMany`.
  - `config('app.user_timezone')`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/Feature/Api/ExercisesTest.php`:

```php
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
    Exercise::factory()->for($this->user)->create(['name' => 'Sentadilla', 'muscle_group' => 'legs']);

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
        'equipment' => 'kettlebell',
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
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/ExercisesTest.php`
Expected: FAIL (404 en las rutas).

- [ ] **Step 3: Zona horaria del usuario y relación**

En `backend/config/app.php`, debajo de `'timezone' => ...`:

```php
'user_timezone' => env('APP_USER_TIMEZONE', 'America/Santiago'),
```

En `backend/.env.example` y `backend/.env` agregar `APP_USER_TIMEZONE=America/Santiago`.

En `backend/app/Models/Exercise.php` agregar:

```php
public function routineDayExercises(): HasMany
{
    return $this->hasMany(RoutineDayExercise::class);
}
```

- [ ] **Step 4: Policies**

`backend/app/Policies/ExercisePolicy.php`:

```php
<?php

namespace App\Policies;

use App\Models\Exercise;
use App\Models\User;

class ExercisePolicy
{
    public function manage(User $user, Exercise $exercise): bool
    {
        return $exercise->user_id === $user->id;
    }
}
```

`backend/app/Policies/RoutinePolicy.php`:

```php
<?php

namespace App\Policies;

use App\Models\Routine;
use App\Models\User;

class RoutinePolicy
{
    public function manage(User $user, Routine $routine): bool
    {
        return $routine->user_id === $user->id;
    }
}
```

`backend/app/Policies/RoutineDayPolicy.php`:

```php
<?php

namespace App\Policies;

use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\User;

class RoutineDayPolicy
{
    public function manage(User $user, RoutineDay $routineDay): bool
    {
        $ownerId = Routine::withoutGlobalScopes()->whereKey($routineDay->routine_id)->value('user_id');

        return (int) $ownerId === $user->id;
    }
}
```

`backend/app/Policies/RoutineDayExercisePolicy.php`:

```php
<?php

namespace App\Policies;

use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\User;

class RoutineDayExercisePolicy
{
    public function manage(User $user, RoutineDayExercise $routineDayExercise): bool
    {
        $ownerId = RoutineDay::query()
            ->join('routines', 'routines.id', '=', 'routine_days.routine_id')
            ->where('routine_days.id', $routineDayExercise->routine_day_id)
            ->value('routines.user_id');

        return (int) $ownerId === $user->id;
    }
}
```

Laravel descubre las policies por convención (`App\Policies\{Model}Policy`).

- [ ] **Step 5: Requests y Resource**

`backend/app/Http/Requests/ListExercisesRequest.php`:

```php
<?php

namespace App\Http\Requests;

use App\Enums\MuscleGroup;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListExercisesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:100'],
            'muscle_group' => ['nullable', Rule::enum(MuscleGroup::class)],
            'archived' => ['nullable', 'boolean'],
        ];
    }
}
```

`backend/app/Http/Requests/ExerciseRequest.php`:

```php
<?php

namespace App\Http\Requests;

use App\Enums\Equipment;
use App\Enums\MuscleGroup;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ExerciseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => [
                'required', 'string', 'max:100',
                Rule::unique('exercises', 'name')
                    ->where('user_id', $this->user()->id)
                    ->ignore($this->route('exercise')),
            ],
            'muscle_group' => ['required', Rule::enum(MuscleGroup::class)],
            'equipment' => ['required', Rule::enum(Equipment::class)],
            'is_unilateral' => ['required', 'boolean'],
            'uses_bodyweight' => ['required', 'boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'El nombre es obligatorio.',
            'name.unique' => 'Ya tienes un ejercicio con ese nombre.',
        ];
    }
}
```

`backend/app/Http/Resources/ExerciseResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExerciseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'muscle_group' => $this->muscle_group,
            'equipment' => $this->equipment,
            'is_unilateral' => $this->is_unilateral,
            'uses_bodyweight' => $this->uses_bodyweight,
            'notes' => $this->notes,
            'archived_at' => $this->archived_at?->toIso8601String(),
            'has_history' => $this->whenHas('has_history', fn ($value) => (bool) $value),
        ];
    }
}
```

- [ ] **Step 6: Controlador y rutas**

`backend/app/Http/Controllers/ExerciseController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\ExerciseRequest;
use App\Http\Requests\ListExercisesRequest;
use App\Http\Resources\ExerciseResource;
use App\Models\Exercise;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class ExerciseController extends Controller
{
    public function index(ListExercisesRequest $request): AnonymousResourceCollection
    {
        $exercises = Exercise::query()
            ->when($request->validated('search'), fn ($query, $search) => $query->whereLike('name', "%{$search}%"))
            ->when($request->validated('muscle_group'), fn ($query, $group) => $query->where('muscle_group', $group))
            ->when(
                $request->boolean('archived'),
                fn ($query) => $query->whereNotNull('archived_at'),
                fn ($query) => $query->whereNull('archived_at'),
            )
            ->withExists('workoutExercises as has_history')
            ->orderBy('name')
            ->get();

        return ExerciseResource::collection($exercises);
    }

    public function store(ExerciseRequest $request): ExerciseResource
    {
        return new ExerciseResource($this->withHistoryFlag(Exercise::create($request->validated())));
    }

    public function show(Exercise $exercise): ExerciseResource
    {
        return new ExerciseResource($this->withHistoryFlag($exercise));
    }

    public function update(ExerciseRequest $request, Exercise $exercise): ExerciseResource
    {
        $exercise->update($request->validated());

        return new ExerciseResource($this->withHistoryFlag($exercise));
    }

    public function destroy(Exercise $exercise): Response
    {
        abort_if(
            $exercise->workoutExercises()->exists(),
            409,
            'El ejercicio tiene historial: archívalo en lugar de eliminarlo.',
        );
        abort_if(
            $exercise->routineDayExercises()->exists(),
            409,
            'El ejercicio está en una rutina: quítalo de la rutina antes de eliminarlo.',
        );

        $exercise->delete();

        return response()->noContent();
    }

    public function archive(Exercise $exercise): ExerciseResource
    {
        $exercise->update(['archived_at' => now()]);

        return new ExerciseResource($this->withHistoryFlag($exercise));
    }

    public function restore(Exercise $exercise): ExerciseResource
    {
        $exercise->update(['archived_at' => null]);

        return new ExerciseResource($this->withHistoryFlag($exercise));
    }

    private function withHistoryFlag(Exercise $exercise): Exercise
    {
        return $exercise->setAttribute('has_history', $exercise->workoutExercises()->exists());
    }
}
```

Reemplazar `backend/routes/api.php`:

```php
<?php

use App\Http\Controllers\ExerciseController;
use App\Http\Controllers\HealthController;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', fn (Request $request) => new UserResource($request->user()));

    Route::get('/exercises', [ExerciseController::class, 'index']);
    Route::post('/exercises', [ExerciseController::class, 'store']);
    Route::middleware('can:manage,exercise')->group(function () {
        Route::get('/exercises/{exercise}', [ExerciseController::class, 'show']);
        Route::put('/exercises/{exercise}', [ExerciseController::class, 'update']);
        Route::delete('/exercises/{exercise}', [ExerciseController::class, 'destroy']);
        Route::post('/exercises/{exercise}/archive', [ExerciseController::class, 'archive']);
        Route::post('/exercises/{exercise}/restore', [ExerciseController::class, 'restore']);
    });
});
```

- [ ] **Step 7: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS (suite completa).

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat(api): add policies and exercises endpoints"
```

---

### Task 2: Historial por ejercicio y servicio "última vez"

**Files:**
- Create: `backend/app/Services/LastPerformanceService.php`
- Create: `backend/app/Http/Resources/WorkoutSetResource.php`, `ExerciseSessionResource.php`
- Create: `backend/app/Http/Controllers/ExerciseHistoryController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/ExerciseHistoryTest.php`, `backend/tests/Feature/Services/LastPerformanceServiceTest.php`

**Interfaces:**
- Consumes: modelos de Task 3 (fase 1), `can:manage,exercise` (Task 1).
- Produces:
  - `LastPerformanceService::forExercises(array $exerciseIds): array<int, WorkoutExercise>` (clave = `exercise_id`; cada `WorkoutExercise` trae `sets` cargados y el atributo `workout_date`).
  - `ExerciseSessionResource`: `{workout_id, date ('aaaa-mm-dd'), sets: WorkoutSetResource[]}`.
  - `WorkoutSetResource`: `{id, set_number, set_type, weight_kg (float), reps, side, rir, pain_level, notes}`.
  - `GET /api/exercises/{id}/history?page=` → paginado (20), sesión más reciente primero, solo sesiones con series.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/Feature/Services/LastPerformanceServiceTest.php`:

```php
<?php

use App\Models\Exercise;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use App\Services\LastPerformanceService;

function sessionWith(Exercise $exercise, string $date, array $sets): WorkoutExercise
{
    $workout = Workout::factory()->create(['user_id' => $exercise->user_id, 'date' => $date]);
    $workoutExercise = WorkoutExercise::factory()->create([
        'workout_id' => $workout->id,
        'exercise_id' => $exercise->id,
    ]);
    foreach ($sets as $i => [$weight, $reps]) {
        WorkoutSet::factory()->create([
            'workout_exercise_id' => $workoutExercise->id,
            'set_number' => $i + 1,
            'weight_kg' => $weight,
            'reps' => $reps,
        ]);
    }

    return $workoutExercise;
}

it('returns the most recent session with sets per exercise', function () {
    $bench = Exercise::factory()->create();
    $pullUps = Exercise::factory()->create(['user_id' => $bench->user_id]);
    sessionWith($bench, '2026-10-20', [[40, 30]]);
    $latest = sessionWith($bench, '2026-10-27', [[42.5, 31], [42.5, 10]]);
    sessionWith($bench, '2026-10-30', []);
    $pull = sessionWith($pullUps, '2026-10-28', [[0, 6]]);

    $result = app(LastPerformanceService::class)->forExercises([$bench->id, $pullUps->id]);

    expect($result)->toHaveKeys([$bench->id, $pullUps->id])
        ->and($result[$bench->id]->id)->toBe($latest->id)
        ->and($result[$bench->id]->sets)->toHaveCount(2)
        ->and(substr($result[$bench->id]->workout_date, 0, 10))->toBe('2026-10-27')
        ->and($result[$pullUps->id]->id)->toBe($pull->id);
});

it('returns an empty array for no exercises or no history', function () {
    $exercise = Exercise::factory()->create();

    expect(app(LastPerformanceService::class)->forExercises([]))->toBe([])
        ->and(app(LastPerformanceService::class)->forExercises([$exercise->id]))->toBe([]);
});
```

`backend/tests/Feature/Api/ExerciseHistoryTest.php`:

```php
<?php

use App\Models\Exercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;

it('returns the sessions of an exercise newest first', function () {
    $user = User::factory()->create();
    $exercise = Exercise::factory()->for($user)->create();
    foreach (['2026-10-01' => 2, '2026-10-08' => 1, '2026-10-10' => 0] as $date => $setCount) {
        $workout = Workout::factory()->for($user)->create(['date' => $date]);
        $workoutExercise = WorkoutExercise::factory()->create(['workout_id' => $workout->id, 'exercise_id' => $exercise->id]);
        WorkoutSet::factory()->count($setCount)->sequence(fn ($s) => ['set_number' => $s->index + 1])
            ->create(['workout_exercise_id' => $workoutExercise->id, 'weight_kg' => 42.5, 'reps' => 30]);
    }

    $this->actingAs($user)
        ->getJson("/api/exercises/{$exercise->id}/history")
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.date', '2026-10-08')
        ->assertJsonPath('data.1.date', '2026-10-01')
        ->assertJsonCount(2, 'data.1.sets')
        ->assertJsonPath('data.1.sets.0.weight_kg', 42.5)
        ->assertJsonPath('data.1.sets.0.reps', 30)
        ->assertJsonPath('meta.current_page', 1);
});

it('hides the history of other users exercises', function () {
    $this->actingAs(User::factory()->create())
        ->getJson('/api/exercises/'.Exercise::factory()->create()->id.'/history')
        ->assertNotFound();
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Services tests/Feature/Api/ExerciseHistoryTest.php`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`backend/app/Services/LastPerformanceService.php`:

```php
<?php

namespace App\Services;

use App\Models\WorkoutExercise;

class LastPerformanceService
{
    /**
     * Most recent session (by workout date, then start time) that has at least one set,
     * for each given exercise.
     *
     * @param  list<int>  $exerciseIds
     * @return array<int, WorkoutExercise> keyed by exercise_id
     */
    public function forExercises(array $exerciseIds): array
    {
        if ($exerciseIds === []) {
            return [];
        }

        return WorkoutExercise::query()
            ->select('workout_exercises.*', 'workouts.date as workout_date')
            ->join('workouts', 'workouts.id', '=', 'workout_exercises.workout_id')
            ->whereIn('workout_exercises.exercise_id', $exerciseIds)
            ->whereHas('sets')
            ->orderByDesc('workouts.date')
            ->orderByDesc('workouts.started_at')
            ->with('sets')
            ->get()
            ->unique('exercise_id')
            ->keyBy('exercise_id')
            ->all();
    }
}
```

`backend/app/Http/Resources/WorkoutSetResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkoutSetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'set_number' => $this->set_number,
            'set_type' => $this->set_type,
            'weight_kg' => (float) $this->weight_kg,
            'reps' => $this->reps,
            'side' => $this->side,
            'rir' => $this->rir,
            'pain_level' => $this->pain_level,
            'notes' => $this->notes,
        ];
    }
}
```

`backend/app/Http/Resources/ExerciseSessionResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A WorkoutExercise loaded with `workout_date` and `sets`. */
class ExerciseSessionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'workout_id' => $this->workout_id,
            'date' => substr((string) $this->workout_date, 0, 10),
            'sets' => WorkoutSetResource::collection($this->sets),
        ];
    }
}
```

`backend/app/Http/Controllers/ExerciseHistoryController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Resources\ExerciseSessionResource;
use App\Models\Exercise;
use App\Models\WorkoutExercise;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ExerciseHistoryController extends Controller
{
    public function __invoke(Exercise $exercise): AnonymousResourceCollection
    {
        $sessions = WorkoutExercise::query()
            ->select('workout_exercises.*', 'workouts.date as workout_date')
            ->join('workouts', 'workouts.id', '=', 'workout_exercises.workout_id')
            ->where('workout_exercises.exercise_id', $exercise->id)
            ->whereHas('sets')
            ->orderByDesc('workouts.date')
            ->orderByDesc('workouts.started_at')
            ->with('sets')
            ->paginate(20);

        return ExerciseSessionResource::collection($sessions);
    }
}
```

En `backend/routes/api.php`, dentro del grupo `can:manage,exercise`, agregar (con su `use`):

```php
Route::get('/exercises/{exercise}/history', ExerciseHistoryController::class);
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(api): add exercise history and last performance service"
```

---

### Task 3: API de rutinas y días

**Files:**
- Create: `backend/app/Support/Reorder.php`
- Create: `backend/app/Http/Requests/RoutineRequest.php`, `RoutineDayRequest.php`, `ReorderRequest.php`
- Create: `backend/app/Http/Resources/RoutineResource.php`, `RoutineDayResource.php`, `RoutineDayExerciseResource.php`
- Create: `backend/app/Http/Controllers/RoutineController.php`, `RoutineDayController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/RoutinesTest.php`, `backend/tests/Feature/Api/RoutineDaysTest.php`

**Interfaces:**
- Consumes: `RoutinePolicy`, `RoutineDayPolicy` (Task 1), `ExerciseResource`.
- Produces:
  - `GET|POST /api/routines`, `GET|PUT|DELETE /api/routines/{id}`, `POST /api/routines/{id}/activate`.
  - `POST /api/routines/{id}/days`, `PUT /api/routines/{id}/days/reorder` `{ids}`, `PUT|DELETE /api/routine-days/{id}`, `POST /api/routine-days/{id}/duplicate`.
  - `RoutineResource`: `{id, name, notes, is_active, days_count?, days?: RoutineDayResource[]}`.
  - `RoutineDayResource`: `{id, routine_id, name, weekday, position, exercises?: RoutineDayExerciseResource[]}`.
  - `RoutineDayExerciseResource`: `{id, routine_day_id, exercise?: ExerciseResource, position, target_sets, target_reps_min, target_reps_max, target_text, default_set_type, rest_seconds, notes}`.
  - `App\Support\Reorder::apply(HasMany $relation, array $ids): void` (lanza `ValidationException` en `ids` si no coincide el conjunto).

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/Feature/Api/RoutinesTest.php`:

```php
<?php

use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

it('lists the user routines with day count, active first', function () {
    Routine::factory()->for($this->user)->create(['name' => 'A']);
    $active = Routine::factory()->for($this->user)->create(['name' => 'B', 'is_active' => true]);
    RoutineDay::factory()->count(2)->for($active)->create();
    Routine::factory()->create(['name' => 'Ajena']);

    $this->getJson('/api/routines')
        ->assertOk()
        ->assertJsonPath('data.*.name', ['B', 'A'])
        ->assertJsonPath('data.0.days_count', 2);
});

it('creates and validates a routine', function () {
    $this->postJson('/api/routines', ['name' => 'Torso/pierna'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Torso/pierna')
        ->assertJsonPath('data.is_active', false);

    $this->postJson('/api/routines', ['name' => ''])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name']);
});

it('shows a routine with ordered days and exercises', function () {
    $routine = Routine::factory()->for($this->user)->create();
    $tuesday = RoutineDay::factory()->for($routine)->create(['name' => 'Martes', 'position' => 1]);
    RoutineDay::factory()->for($routine)->create(['name' => 'Lunes', 'position' => 0]);
    RoutineDayExercise::factory()->for($tuesday, 'routineDay')->create(['position' => 0]);

    $this->getJson("/api/routines/{$routine->id}")
        ->assertOk()
        ->assertJsonPath('data.days.*.name', ['Lunes', 'Martes'])
        ->assertJsonCount(1, 'data.days.1.exercises')
        ->assertJsonStructure(['data' => ['days' => [1 => ['exercises' => [['exercise' => ['id', 'name']]]]]]]);
});

it('updates and deletes a routine', function () {
    $routine = Routine::factory()->for($this->user)->create();
    RoutineDay::factory()->for($routine)->create();

    $this->putJson("/api/routines/{$routine->id}", ['name' => 'Nueva', 'notes' => 'x'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Nueva');

    $this->deleteJson("/api/routines/{$routine->id}")->assertNoContent();
    expect(Routine::count())->toBe(0)->and(RoutineDay::count())->toBe(0);
});

it('activates one routine and deactivates the other routines of the user', function () {
    $old = Routine::factory()->for($this->user)->create(['is_active' => true]);
    $new = Routine::factory()->for($this->user)->create();
    $foreign = Routine::factory()->create(['is_active' => true]);

    $this->postJson("/api/routines/{$new->id}/activate")
        ->assertOk()
        ->assertJsonPath('data.is_active', true);

    expect($old->fresh()->is_active)->toBeFalse()
        ->and(Routine::withoutGlobalScopes()->find($foreign->id)->is_active)->toBeTrue();
});

it('hides routines of other users', function () {
    $foreign = Routine::factory()->create();

    $this->getJson("/api/routines/{$foreign->id}")->assertNotFound();
    $this->postJson("/api/routines/{$foreign->id}/activate")->assertNotFound();
});
```

`backend/tests/Feature/Api/RoutineDaysTest.php`:

```php
<?php

use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->routine = Routine::factory()->for($this->user)->create();
});

it('adds a day at the end', function () {
    RoutineDay::factory()->for($this->routine)->create(['position' => 0]);

    $this->postJson("/api/routines/{$this->routine->id}/days", ['name' => 'Viernes – Piernas', 'weekday' => 5])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Viernes – Piernas')
        ->assertJsonPath('data.weekday', 5)
        ->assertJsonPath('data.position', 1)
        ->assertJsonPath('data.exercises', []);
});

it('rejects a weekday already used in the same routine only', function () {
    RoutineDay::factory()->for($this->routine)->create(['weekday' => 1]);
    $other = Routine::factory()->for($this->user)->create();

    $this->postJson("/api/routines/{$this->routine->id}/days", ['name' => 'Otro lunes', 'weekday' => 1])
        ->assertStatus(422)
        ->assertJsonPath('errors.weekday.0', 'Ya hay un día de esta rutina asignado a ese día de la semana.');

    $this->postJson("/api/routines/{$other->id}/days", ['name' => 'Lunes', 'weekday' => 1])->assertCreated();
});

it('updates a day keeping its own weekday', function () {
    $day = RoutineDay::factory()->for($this->routine)->create(['weekday' => 1]);

    $this->putJson("/api/routine-days/{$day->id}", ['name' => 'Lunes – Pecho', 'weekday' => 1])
        ->assertOk()
        ->assertJsonPath('data.name', 'Lunes – Pecho');
});

it('deletes a day', function () {
    $day = RoutineDay::factory()->for($this->routine)->create();

    $this->deleteJson("/api/routine-days/{$day->id}")->assertNoContent();
    expect(RoutineDay::count())->toBe(0);
});

it('reorders the days of a routine', function () {
    $a = RoutineDay::factory()->for($this->routine)->create(['position' => 0]);
    $b = RoutineDay::factory()->for($this->routine)->create(['position' => 1]);

    $this->putJson("/api/routines/{$this->routine->id}/days/reorder", ['ids' => [$b->id, $a->id]])
        ->assertNoContent();

    expect($b->fresh()->position)->toBe(0)->and($a->fresh()->position)->toBe(1);

    $this->putJson("/api/routines/{$this->routine->id}/days/reorder", ['ids' => [$a->id]])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['ids']);
});

it('duplicates a day with its exercises', function () {
    $day = RoutineDay::factory()->for($this->routine)->create(['name' => 'Lunes', 'weekday' => 1, 'position' => 0]);
    RoutineDayExercise::factory()->count(2)->for($day, 'routineDay')->sequence(['position' => 0], ['position' => 1])->create();

    $this->postJson("/api/routine-days/{$day->id}/duplicate")
        ->assertCreated()
        ->assertJsonPath('data.name', 'Lunes (copia)')
        ->assertJsonPath('data.weekday', null)
        ->assertJsonPath('data.position', 1)
        ->assertJsonCount(2, 'data.exercises');

    expect(RoutineDayExercise::count())->toBe(4);
});

it('forbids touching days of other users', function () {
    $foreign = RoutineDay::factory()->create();

    $this->putJson("/api/routine-days/{$foreign->id}", ['name' => 'x', 'weekday' => null])->assertForbidden();
    $this->deleteJson("/api/routine-days/{$foreign->id}")->assertForbidden();
    $this->postJson("/api/routine-days/{$foreign->id}/duplicate")->assertForbidden();
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/RoutinesTest.php tests/Feature/Api/RoutineDaysTest.php`
Expected: FAIL.

- [ ] **Step 3: Soporte de reordenamiento y requests**

`backend/app/Support/Reorder.php`:

```php
<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class Reorder
{
    /**
     * Sets `position` of each related model to its index in $ids.
     * $ids must contain exactly the ids currently in the relation.
     *
     * @param  list<int>  $ids
     */
    public static function apply(HasMany $relation, array $ids): void
    {
        $ids = array_map('intval', $ids);
        $current = $relation->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        $given = collect($ids)->sort()->values()->all();

        if ($current !== $given) {
            throw ValidationException::withMessages([
                'ids' => 'La lista no coincide con los elementos actuales.',
            ]);
        }

        DB::transaction(function () use ($relation, $ids) {
            foreach ($ids as $position => $id) {
                $relation->getRelated()->newQuery()->whereKey($id)->update(['position' => $position]);
            }
        });
    }
}
```

`backend/app/Http/Requests/ReorderRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReorderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'ids' => ['present', 'array'],
            'ids.*' => ['integer', 'distinct'],
        ];
    }
}
```

`backend/app/Http/Requests/RoutineRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RoutineRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return ['name.required' => 'El nombre es obligatorio.'];
    }
}
```

`backend/app/Http/Requests/RoutineDayRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RoutineDayRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $day = $this->route('routineDay');
        $routineId = $day?->routine_id ?? $this->route('routine')->id;

        return [
            'name' => ['required', 'string', 'max:100'],
            'weekday' => [
                'nullable', 'integer', 'between:1,7',
                Rule::unique('routine_days', 'weekday')->where('routine_id', $routineId)->ignore($day),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'El nombre es obligatorio.',
            'weekday.unique' => 'Ya hay un día de esta rutina asignado a ese día de la semana.',
        ];
    }
}
```

- [ ] **Step 4: Resources**

`backend/app/Http/Resources/RoutineResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoutineResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'notes' => $this->notes,
            'is_active' => $this->is_active,
            'days_count' => $this->whenCounted('days'),
            'days' => RoutineDayResource::collection($this->whenLoaded('days')),
        ];
    }
}
```

`backend/app/Http/Resources/RoutineDayResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoutineDayResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'routine_id' => $this->routine_id,
            'name' => $this->name,
            'weekday' => $this->weekday,
            'position' => $this->position,
            'exercises' => RoutineDayExerciseResource::collection($this->whenLoaded('exercises')),
        ];
    }
}
```

`backend/app/Http/Resources/RoutineDayExerciseResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoutineDayExerciseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'routine_day_id' => $this->routine_day_id,
            'exercise' => new ExerciseResource($this->whenLoaded('exercise')),
            'position' => $this->position,
            'target_sets' => $this->target_sets,
            'target_reps_min' => $this->target_reps_min,
            'target_reps_max' => $this->target_reps_max,
            'target_text' => $this->target_text,
            'default_set_type' => $this->default_set_type,
            'rest_seconds' => $this->rest_seconds,
            'notes' => $this->notes,
        ];
    }
}
```

- [ ] **Step 5: Controladores**

`backend/app/Http/Controllers/RoutineController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\RoutineRequest;
use App\Http\Resources\RoutineResource;
use App\Models\Routine;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class RoutineController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $routines = Routine::query()
            ->withCount('days')
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get();

        return RoutineResource::collection($routines);
    }

    public function store(RoutineRequest $request): RoutineResource
    {
        return new RoutineResource(Routine::create($request->validated())->refresh());
    }

    public function show(Routine $routine): RoutineResource
    {
        return new RoutineResource($routine->load('days.exercises.exercise'));
    }

    public function update(RoutineRequest $request, Routine $routine): RoutineResource
    {
        $routine->update($request->validated());

        return new RoutineResource($routine);
    }

    public function destroy(Routine $routine): Response
    {
        $routine->delete();

        return response()->noContent();
    }

    public function activate(Routine $routine): RoutineResource
    {
        DB::transaction(function () use ($routine) {
            Routine::query()->whereKeyNot($routine->id)->update(['is_active' => false]);
            $routine->update(['is_active' => true]);
        });

        return new RoutineResource($routine);
    }
}
```

`backend/app/Http/Controllers/RoutineDayController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReorderRequest;
use App\Http\Requests\RoutineDayRequest;
use App\Http\Resources\RoutineDayResource;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Support\Reorder;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RoutineDayController extends Controller
{
    public function store(RoutineDayRequest $request, Routine $routine): RoutineDayResource
    {
        $day = $routine->days()->create([
            ...$request->validated(),
            'position' => $this->nextPosition($routine),
        ]);

        return new RoutineDayResource($day->load('exercises.exercise'));
    }

    public function update(RoutineDayRequest $request, RoutineDay $routineDay): RoutineDayResource
    {
        $routineDay->update($request->validated());

        return new RoutineDayResource($routineDay->load('exercises.exercise'));
    }

    public function destroy(RoutineDay $routineDay): Response
    {
        $routineDay->delete();

        return response()->noContent();
    }

    public function reorder(ReorderRequest $request, Routine $routine): Response
    {
        Reorder::apply($routine->days(), $request->validated('ids'));

        return response()->noContent();
    }

    public function duplicate(RoutineDay $routineDay): RoutineDayResource
    {
        $copy = DB::transaction(function () use ($routineDay) {
            $copy = $routineDay->replicate();
            $copy->name = Str::limit($routineDay->name.' (copia)', 100, '');
            $copy->weekday = null;
            $copy->position = $this->nextPosition($routineDay->routine);
            $copy->save();

            foreach ($routineDay->exercises as $exercise) {
                $exercise->replicate()->fill(['routine_day_id' => $copy->id])->save();
            }

            return $copy;
        });

        return new RoutineDayResource($copy->load('exercises.exercise'));
    }

    private function nextPosition(Routine $routine): int
    {
        return (int) ($routine->days()->max('position') ?? -1) + 1;
    }
}
```

- [ ] **Step 6: Rutas**

En `backend/routes/api.php`, dentro del grupo `auth:sanctum` (con sus `use`):

```php
Route::get('/routines', [RoutineController::class, 'index']);
Route::post('/routines', [RoutineController::class, 'store']);
Route::middleware('can:manage,routine')->group(function () {
    Route::get('/routines/{routine}', [RoutineController::class, 'show']);
    Route::put('/routines/{routine}', [RoutineController::class, 'update']);
    Route::delete('/routines/{routine}', [RoutineController::class, 'destroy']);
    Route::post('/routines/{routine}/activate', [RoutineController::class, 'activate']);
    Route::post('/routines/{routine}/days', [RoutineDayController::class, 'store']);
    Route::put('/routines/{routine}/days/reorder', [RoutineDayController::class, 'reorder']);
});
Route::middleware('can:manage,routineDay')->group(function () {
    Route::put('/routine-days/{routineDay}', [RoutineDayController::class, 'update']);
    Route::delete('/routine-days/{routineDay}', [RoutineDayController::class, 'destroy']);
    Route::post('/routine-days/{routineDay}/duplicate', [RoutineDayController::class, 'duplicate']);
});
```

- [ ] **Step 7: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat(api): add routines and routine days endpoints with reorder and duplicate"
```

---

### Task 4: API de ejercicios de un día de rutina

**Files:**
- Create: `backend/app/Http/Requests/RoutineDayExerciseRequest.php`
- Create: `backend/app/Http/Controllers/RoutineDayExerciseController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/RoutineDayExercisesTest.php`

**Interfaces:**
- Consumes: `Reorder`, `RoutineDayExerciseResource`, `ReorderRequest`, policies (Tasks 1, 3).
- Produces: `POST /api/routine-days/{id}/exercises`, `PUT /api/routine-days/{id}/exercises/reorder` `{ids}`, `PUT|DELETE /api/routine-day-exercises/{id}`. Payload: `{exercise_id (solo POST), target_sets, target_reps_min, target_reps_max, target_text, default_set_type, rest_seconds, notes}`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/Feature/Api/RoutineDayExercisesTest.php`:

```php
<?php

use App\Models\Exercise;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->day = RoutineDay::factory()->for(Routine::factory()->for($this->user))->create();
    $this->exercise = Exercise::factory()->for($this->user)->create(['name' => 'Dominadas']);
});

function targetsPayload(array $overrides = []): array
{
    return array_merge([
        'target_sets' => 6,
        'target_reps_min' => 5,
        'target_reps_max' => 6,
        'target_text' => 'Parar con 1-2 RIR',
        'default_set_type' => 'normal',
        'rest_seconds' => 150,
        'notes' => null,
    ], $overrides);
}

it('adds an exercise at the end of the day', function () {
    RoutineDayExercise::factory()->for($this->day, 'routineDay')->create(['position' => 0]);

    $this->postJson("/api/routine-days/{$this->day->id}/exercises", targetsPayload(['exercise_id' => $this->exercise->id]))
        ->assertCreated()
        ->assertJsonPath('data.exercise.name', 'Dominadas')
        ->assertJsonPath('data.position', 1)
        ->assertJsonPath('data.target_sets', 6);
});

it('validates the targets and the exercise ownership', function () {
    $foreign = Exercise::factory()->create();

    $this->postJson("/api/routine-days/{$this->day->id}/exercises", targetsPayload([
        'exercise_id' => $foreign->id,
        'target_reps_min' => 10,
        'target_reps_max' => 8,
        'default_set_type' => 'superset',
    ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['exercise_id', 'target_reps_max', 'default_set_type'])
        ->assertJsonPath('errors.target_reps_max.0', 'El máximo de reps no puede ser menor que el mínimo.');
});

it('updates the targets of an exercise', function () {
    $item = RoutineDayExercise::factory()->for($this->day, 'routineDay')->create(['exercise_id' => $this->exercise->id]);

    $this->putJson("/api/routine-day-exercises/{$item->id}", targetsPayload(['target_sets' => 5, 'default_set_type' => 'heavy']))
        ->assertOk()
        ->assertJsonPath('data.target_sets', 5)
        ->assertJsonPath('data.default_set_type', 'heavy')
        ->assertJsonPath('data.exercise.id', $this->exercise->id);
});

it('removes an exercise from the day', function () {
    $item = RoutineDayExercise::factory()->for($this->day, 'routineDay')->create();

    $this->deleteJson("/api/routine-day-exercises/{$item->id}")->assertNoContent();
    expect(RoutineDayExercise::count())->toBe(0);
});

it('reorders the exercises of a day', function () {
    $a = RoutineDayExercise::factory()->for($this->day, 'routineDay')->create(['position' => 0]);
    $b = RoutineDayExercise::factory()->for($this->day, 'routineDay')->create(['position' => 1]);

    $this->putJson("/api/routine-days/{$this->day->id}/exercises/reorder", ['ids' => [$b->id, $a->id]])
        ->assertNoContent();

    expect($b->fresh()->position)->toBe(0)->and($a->fresh()->position)->toBe(1);
});

it('forbids touching exercises of other users days', function () {
    $foreignDay = RoutineDay::factory()->create();
    $foreignItem = RoutineDayExercise::factory()->for($foreignDay, 'routineDay')->create();

    $this->postJson("/api/routine-days/{$foreignDay->id}/exercises", targetsPayload(['exercise_id' => $this->exercise->id]))
        ->assertForbidden();
    $this->putJson("/api/routine-day-exercises/{$foreignItem->id}", targetsPayload())->assertForbidden();
    $this->deleteJson("/api/routine-day-exercises/{$foreignItem->id}")->assertForbidden();
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/RoutineDayExercisesTest.php`
Expected: FAIL.

- [ ] **Step 3: Request**

`backend/app/Http/Requests/RoutineDayExerciseRequest.php`:

```php
<?php

namespace App\Http\Requests;

use App\Enums\SetType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class RoutineDayExerciseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'exercise_id' => [
                $this->isMethod('post') ? 'required' : 'prohibited',
                'integer',
                Rule::exists('exercises', 'id')->where('user_id', $this->user()->id),
            ],
            'target_sets' => ['required', 'integer', 'between:1,20'],
            'target_reps_min' => ['nullable', 'integer', 'between:1,100'],
            'target_reps_max' => ['nullable', 'integer', 'between:1,100'],
            'target_text' => ['nullable', 'string', 'max:150'],
            'default_set_type' => ['required', Rule::enum(SetType::class)],
            'rest_seconds' => ['required', 'integer', 'between:0,900'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $min = $this->input('target_reps_min');
                $max = $this->input('target_reps_max');
                if (is_numeric($min) && is_numeric($max) && (int) $max < (int) $min) {
                    $validator->errors()->add('target_reps_max', 'El máximo de reps no puede ser menor que el mínimo.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return ['exercise_id.exists' => 'Elige uno de tus ejercicios.'];
    }
}
```

- [ ] **Step 4: Controlador y rutas**

`backend/app/Http/Controllers/RoutineDayExerciseController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReorderRequest;
use App\Http\Requests\RoutineDayExerciseRequest;
use App\Http\Resources\RoutineDayExerciseResource;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Support\Reorder;
use Illuminate\Http\Response;

class RoutineDayExerciseController extends Controller
{
    public function store(RoutineDayExerciseRequest $request, RoutineDay $routineDay): RoutineDayExerciseResource
    {
        $item = $routineDay->exercises()->create([
            ...$request->validated(),
            'position' => (int) ($routineDay->exercises()->max('position') ?? -1) + 1,
        ]);

        return new RoutineDayExerciseResource($item->load('exercise'));
    }

    public function update(RoutineDayExerciseRequest $request, RoutineDayExercise $routineDayExercise): RoutineDayExerciseResource
    {
        $routineDayExercise->update($request->validated());

        return new RoutineDayExerciseResource($routineDayExercise->load('exercise'));
    }

    public function destroy(RoutineDayExercise $routineDayExercise): Response
    {
        $routineDayExercise->delete();

        return response()->noContent();
    }

    public function reorder(ReorderRequest $request, RoutineDay $routineDay): Response
    {
        Reorder::apply($routineDay->exercises(), $request->validated('ids'));

        return response()->noContent();
    }
}
```

En `backend/routes/api.php`: dentro del grupo `can:manage,routineDay` agregar

```php
Route::post('/routine-days/{routineDay}/exercises', [RoutineDayExerciseController::class, 'store']);
Route::put('/routine-days/{routineDay}/exercises/reorder', [RoutineDayExerciseController::class, 'reorder']);
```

y dentro de `auth:sanctum`:

```php
Route::middleware('can:manage,routineDayExercise')->group(function () {
    Route::put('/routine-day-exercises/{routineDayExercise}', [RoutineDayExerciseController::class, 'update']);
    Route::delete('/routine-day-exercises/{routineDayExercise}', [RoutineDayExerciseController::class, 'destroy']);
});
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(api): add routine day exercises endpoints"
```

---

### Task 5: Endpoint "Hoy"

**Files:**
- Create: `backend/app/Http/Controllers/TodayController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/TodayTest.php`

**Interfaces:**
- Consumes: `LastPerformanceService`, `RoutineDayResource`, `RoutineDayExerciseResource`, `ExerciseSessionResource`.
- Produces: `GET /api/today` →

```json
{"data": {
  "date": "2026-11-02", "weekday": 1,
  "routine": {"id": 1, "name": "Rutina 4 días"} | null,
  "day": {RoutineDayResource sin exercises, "exercises": [RoutineDayExerciseResource + "last_performance": ExerciseSessionResource | null]} | null,
  "days": [{"id", "name", "weekday"}]
}}
```

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/Feature/Api/TodayTest.php`:

```php
<?php

use App\Models\Exercise;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->routine = Routine::factory()->for($this->user)->create(['name' => 'Rutina 4 días', 'is_active' => true]);
    $this->monday = RoutineDay::factory()->for($this->routine)->create(['name' => 'Lunes – Pecho', 'weekday' => 1, 'position' => 0]);
    RoutineDay::factory()->for($this->routine)->create(['name' => 'Martes – Espalda', 'weekday' => 2, 'position' => 1]);
    $this->bench = Exercise::factory()->for($this->user)->create(['name' => 'Press de banca']);
    RoutineDayExercise::factory()->for($this->monday, 'routineDay')->create(['exercise_id' => $this->bench->id, 'default_set_type' => 'bilbo']);
});

it('returns the day that matches today in America/Santiago with the last performance', function () {
    $workout = Workout::factory()->for($this->user)->create(['date' => '2026-10-26']);
    $workoutExercise = WorkoutExercise::factory()->create(['workout_id' => $workout->id, 'exercise_id' => $this->bench->id]);
    WorkoutSet::factory()->create(['workout_exercise_id' => $workoutExercise->id, 'weight_kg' => 42.5, 'reps' => 30, 'set_type' => 'bilbo']);

    // 02:00 UTC del martes = 23:00 del lunes en Santiago (UTC-3)
    $this->travelTo(Carbon::parse('2026-11-03 02:00:00', 'UTC'));

    $this->getJson('/api/today')
        ->assertOk()
        ->assertJsonPath('data.date', '2026-11-02')
        ->assertJsonPath('data.weekday', 1)
        ->assertJsonPath('data.routine.name', 'Rutina 4 días')
        ->assertJsonPath('data.day.name', 'Lunes – Pecho')
        ->assertJsonPath('data.day.exercises.0.exercise.name', 'Press de banca')
        ->assertJsonPath('data.day.exercises.0.default_set_type', 'bilbo')
        ->assertJsonPath('data.day.exercises.0.last_performance.date', '2026-10-26')
        ->assertJsonPath('data.day.exercises.0.last_performance.sets.0.weight_kg', 42.5)
        ->assertJsonPath('data.days.*.name', ['Lunes – Pecho', 'Martes – Espalda']);
});

it('returns a null last performance when there is no history', function () {
    $this->travelTo(Carbon::parse('2026-11-02 15:00:00', 'UTC'));

    $this->getJson('/api/today')->assertJsonPath('data.day.exercises.0.last_performance', null);
});

it('returns no day on a rest day', function () {
    $this->travelTo(Carbon::parse('2026-11-04 15:00:00', 'UTC')); // miércoles

    $this->getJson('/api/today')
        ->assertOk()
        ->assertJsonPath('data.weekday', 3)
        ->assertJsonPath('data.routine.id', $this->routine->id)
        ->assertJsonPath('data.day', null);
});

it('returns nulls without an active routine of the user', function () {
    $this->routine->update(['is_active' => false]);
    Routine::factory()->create(['is_active' => true]);

    $this->getJson('/api/today')
        ->assertOk()
        ->assertJsonPath('data.routine', null)
        ->assertJsonPath('data.day', null)
        ->assertJsonPath('data.days', []);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/TodayTest.php`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`backend/app/Http/Controllers/TodayController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Resources\ExerciseSessionResource;
use App\Http\Resources\RoutineDayExerciseResource;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Services\LastPerformanceService;
use Illuminate\Http\JsonResponse;

class TodayController extends Controller
{
    public function __invoke(LastPerformanceService $lastPerformance): JsonResponse
    {
        $now = now(config('app.user_timezone'));
        $routine = Routine::query()->where('is_active', true)->with('days')->first();
        $day = $routine?->days->firstWhere('weekday', $now->dayOfWeekIso);

        return response()->json(['data' => [
            'date' => $now->toDateString(),
            'weekday' => $now->dayOfWeekIso,
            'routine' => $routine ? ['id' => $routine->id, 'name' => $routine->name] : null,
            'day' => $day ? $this->dayWithLastPerformance($day, $lastPerformance) : null,
            'days' => $routine
                ? $routine->days->map(fn (RoutineDay $d) => ['id' => $d->id, 'name' => $d->name, 'weekday' => $d->weekday])->values()
                : [],
        ]]);
    }

    private function dayWithLastPerformance(RoutineDay $day, LastPerformanceService $lastPerformance): array
    {
        $day->load('exercises.exercise');
        $last = $lastPerformance->forExercises($day->exercises->pluck('exercise_id')->unique()->values()->all());

        return [
            'id' => $day->id,
            'routine_id' => $day->routine_id,
            'name' => $day->name,
            'weekday' => $day->weekday,
            'position' => $day->position,
            'exercises' => $day->exercises->map(fn (RoutineDayExercise $item) => [
                ...(new RoutineDayExerciseResource($item))->resolve(),
                'last_performance' => isset($last[$item->exercise_id])
                    ? (new ExerciseSessionResource($last[$item->exercise_id]))->resolve()
                    : null,
            ])->values(),
        ];
    }
}
```

En `backend/routes/api.php`, dentro de `auth:sanctum`: `Route::get('/today', TodayController::class);` (con su `use`).

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(api): add today endpoint with last performance per exercise"
```

---

### Task 6: Base del frontend: modelos, formatos, errores, interceptor CSRF y servicios API

**Files:**
- Modify: `frontend/.gitignore` (agregar `.nx/`), quitar `frontend/.nx` del índice de Git
- Add (ya generados): `frontend/libs/ui/textarea`, `frontend/libs/ui/badge`, cambios de `package.json` (`@ng-icons/core`, `@ng-icons/lucide`)
- Create: `frontend/src/app/core/models/exercise.ts`, `routine.ts`, `labels.ts`
- Create: `frontend/src/app/core/format/training.ts`
- Create: `frontend/src/app/core/api/api-error.ts`, `exercises-api.ts`, `routines-api.ts`, `today-api.ts`
- Create: `frontend/src/app/core/auth/csrf-retry.interceptor.ts`
- Create: `frontend/src/app/shared/ui/form-styles.ts`
- Modify: `frontend/src/app/app.config.ts`
- Test: `frontend/src/app/core/format/training.spec.ts`, `core/api/api-error.spec.ts`, `core/auth/csrf-retry.interceptor.spec.ts`, `core/api/exercises-api.spec.ts`, `core/api/routines-api.spec.ts`

**Interfaces:**
- Produces:
  - Tipos `MuscleGroup`, `Equipment`, `SetType`, `Side`, `Exercise`, `ExerciseInput`, `WorkoutSet`, `ExerciseSession`, `Paginated<T>`, `Routine`, `RoutineDay`, `RoutineDayExercise`, `RoutineDayExerciseInput`, `TodayExercise`, `Today`.
  - `MUSCLE_GROUPS`, `EQUIPMENTS`, `SET_TYPES` (arrays ordenados), `MUSCLE_GROUP_LABELS`, `EQUIPMENT_LABELS`, `SET_TYPE_LABELS`, `WEEKDAY_LABELS` (`Record<number, string>`, 1-7).
  - `formatTargets(t)`, `formatBestSet(sets, usesBodyweight)`, `formatRest(seconds)`.
  - `apiErrorMessage(error: unknown): string`.
  - `csrfRetryInterceptor: HttpInterceptorFn`.
  - `ExercisesApi`, `RoutinesApi`, `TodayApi` (métodos en la sección de código; todos devuelven `Promise`).
  - `SELECT_CLASS` (string de clases Tailwind).

- [ ] **Step 1: Higiene del repo**

```bash
cd /home/luciano/Proyecto_Gym_Tracker/frontend
printf '\n# Nx cache (spartan CLI)\n.nx/\n' >> .gitignore
git rm -r --cached .nx -q
```

- [ ] **Step 2: Escribir los tests que fallan**

`frontend/src/app/core/format/training.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { WorkoutSet } from '../models/exercise';
import { formatBestSet, formatRest, formatTargets } from './training';

const set = (weight_kg: number, reps: number, set_type: WorkoutSet['set_type'] = 'normal'): WorkoutSet => ({
  id: crypto.randomUUID(), set_number: 1, set_type, weight_kg, reps, side: 'both', rir: null, pain_level: null, notes: null,
});

describe('formatTargets', () => {
  it('shows sets and a reps range', () => {
    expect(formatTargets({ target_sets: 3, target_reps_min: 8, target_reps_max: 12 })).toBe('3 × 8-12');
  });
  it('collapses an exact reps target', () => {
    expect(formatTargets({ target_sets: 5, target_reps_min: 5, target_reps_max: 5 })).toBe('5 × 5');
  });
  it('uses the single bound present', () => {
    expect(formatTargets({ target_sets: 3, target_reps_min: null, target_reps_max: 10 })).toBe('3 × 10');
  });
  it('falls back to the number of sets', () => {
    expect(formatTargets({ target_sets: 1, target_reps_min: null, target_reps_max: null })).toBe('1 serie');
    expect(formatTargets({ target_sets: 3, target_reps_min: null, target_reps_max: null })).toBe('3 series');
  });
});

describe('formatBestSet', () => {
  it('picks the heaviest non-warmup set, then the most reps', () => {
    expect(formatBestSet([set(60, 5, 'warmup'), set(42.5, 28), set(42.5, 31)], false)).toBe('42,5 kg × 31');
  });
  it('shows reps only for bodyweight without extra load', () => {
    expect(formatBestSet([set(0, 6), set(0, 4)], true)).toBe('6 reps');
  });
  it('shows extra load for weighted bodyweight sets', () => {
    expect(formatBestSet([set(10, 5)], true)).toBe('+10 kg × 5');
  });
  it('returns null without sets', () => {
    expect(formatBestSet([], false)).toBeNull();
  });
});

describe('formatRest', () => {
  it('formats seconds as m:ss', () => {
    expect(formatRest(150)).toBe('2:30 min');
    expect(formatRest(90)).toBe('1:30 min');
    expect(formatRest(45)).toBe('0:45 min');
  });
});
```

`frontend/src/app/core/api/api-error.spec.ts`:

```ts
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api-error';

describe('apiErrorMessage', () => {
  it('returns the first validation error', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: { message: 'x', errors: { name: ['Ya tienes un ejercicio con ese nombre.'] } },
    });
    expect(apiErrorMessage(error)).toBe('Ya tienes un ejercicio con ese nombre.');
  });
  it('returns the server message for conflicts', () => {
    const error = new HttpErrorResponse({ status: 409, error: { message: 'El ejercicio tiene historial.' } });
    expect(apiErrorMessage(error)).toBe('El ejercicio tiene historial.');
  });
  it('explains network failures', () => {
    expect(apiErrorMessage(new HttpErrorResponse({ status: 0 }))).toBe('No se pudo conectar. Intenta de nuevo.');
  });
  it('has a generic fallback', () => {
    expect(apiErrorMessage(new Error('boom'))).toBe('Ocurrió un error inesperado.');
    expect(apiErrorMessage(new HttpErrorResponse({ status: 500, error: '<html>' }))).toBe('Ocurrió un error inesperado.');
  });
});
```

`frontend/src/app/core/auth/csrf-retry.interceptor.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpXsrfTokenExtractor, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { csrfRetryInterceptor } from './csrf-retry.interceptor';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('csrfRetryInterceptor', () => {
  let http: HttpClient;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([csrfRetryInterceptor])),
        provideHttpClientTesting(),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => 'fresh-token' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('refreshes the CSRF cookie and retries once on 419', async () => {
    const result = firstValueFrom(http.post('/api/routines', { name: 'x' }));

    mock.expectOne('/api/routines').flush({ message: 'CSRF token mismatch.' }, { status: 419, statusText: 'Expired' });
    mock.expectOne('/sanctum/csrf-cookie').flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    const retry = mock.expectOne('/api/routines');
    expect(retry.request.headers.get('X-XSRF-TOKEN')).toBe('fresh-token');
    retry.flush({ data: { id: 1 } });

    expect(await result).toEqual({ data: { id: 1 } });
  });

  it('does not retry twice', async () => {
    const result = firstValueFrom(http.post('/api/routines', {}));

    mock.expectOne('/api/routines').flush(null, { status: 419, statusText: 'Expired' });
    mock.expectOne('/sanctum/csrf-cookie').flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    mock.expectOne('/api/routines').flush(null, { status: 419, statusText: 'Expired' });

    await expect(result).rejects.toMatchObject({ status: 419 });
  });

  it('passes other errors through', async () => {
    const result = firstValueFrom(http.get('/api/today'));
    mock.expectOne('/api/today').flush(null, { status: 500, statusText: 'Error' });
    await expect(result).rejects.toMatchObject({ status: 500 });
  });
});
```

`frontend/src/app/core/api/exercises-api.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExercisesApi } from './exercises-api';

describe('ExercisesApi', () => {
  let api: ExercisesApi;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ExercisesApi);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('lists archived exercises and unwraps data', async () => {
    const result = api.list({ archived: true });
    const req = mock.expectOne((r) => r.url === '/api/exercises');
    expect(req.request.params.get('archived')).toBe('1');
    req.flush({ data: [{ id: 1, name: 'Dominadas' }] });

    expect(await result).toEqual([{ id: 1, name: 'Dominadas' }]);
  });

  it('archives an exercise', async () => {
    const result = api.archive(7);
    const req = mock.expectOne('/api/exercises/7/archive');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { id: 7, archived_at: '2026-11-03T12:00:00+00:00' } });

    expect((await result).archived_at).not.toBeNull();
  });
});
```

`frontend/src/app/core/api/routines-api.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoutinesApi } from './routines-api';

describe('RoutinesApi', () => {
  let api: RoutinesApi;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(RoutinesApi);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('reorders days with a list of ids', async () => {
    const result = api.reorderDays(3, [9, 8]);
    const req = mock.expectOne('/api/routines/3/days/reorder');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ids: [9, 8] });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
  });

  it('adds an exercise to a day', async () => {
    const input = {
      exercise_id: 2, target_sets: 3, target_reps_min: 8, target_reps_max: 12, target_text: null,
      default_set_type: 'normal' as const, rest_seconds: 120, notes: null,
    };
    const result = api.addExercise(5, input);
    const req = mock.expectOne('/api/routine-days/5/exercises');
    expect(req.request.body).toEqual(input);
    req.flush({ data: { id: 11 } });
    expect((await result).id).toBe(11);
  });
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 4: Modelos y etiquetas**

`frontend/src/app/core/models/exercise.ts`:

```ts
export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'core' | 'other';
export type Equipment = 'barbell' | 'dumbbell' | 'bodyweight' | 'machine' | 'cable';
export type SetType = 'warmup' | 'normal' | 'bilbo' | 'heavy' | 'failure' | 'dropset';
export type Side = 'both' | 'left' | 'right';

export interface Exercise {
  id: number;
  name: string;
  muscle_group: MuscleGroup;
  equipment: Equipment;
  is_unilateral: boolean;
  uses_bodyweight: boolean;
  notes: string | null;
  archived_at: string | null;
  has_history?: boolean;
}

export type ExerciseInput = Pick<
  Exercise,
  'name' | 'muscle_group' | 'equipment' | 'is_unilateral' | 'uses_bodyweight' | 'notes'
>;

export interface WorkoutSet {
  id: string;
  set_number: number;
  set_type: SetType;
  weight_kg: number;
  reps: number;
  side: Side;
  rir: number | null;
  pain_level: number | null;
  notes: string | null;
}

export interface ExerciseSession {
  workout_id: string;
  date: string;
  sets: WorkoutSet[];
}

export interface Paginated<T> {
  data: T[];
  meta: { current_page: number; last_page: number };
}
```

`frontend/src/app/core/models/routine.ts`:

```ts
import type { Exercise, ExerciseSession, SetType } from './exercise';

export interface RoutineDayExercise {
  id: number;
  routine_day_id: number;
  exercise: Exercise;
  position: number;
  target_sets: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_text: string | null;
  default_set_type: SetType;
  rest_seconds: number;
  notes: string | null;
}

export type RoutineDayExerciseTargets = Omit<RoutineDayExercise, 'id' | 'routine_day_id' | 'exercise' | 'position'>;
export type RoutineDayExerciseInput = RoutineDayExerciseTargets & { exercise_id: number };

export interface RoutineDay {
  id: number;
  routine_id: number;
  name: string;
  weekday: number | null;
  position: number;
  exercises?: RoutineDayExercise[];
}

export interface Routine {
  id: number;
  name: string;
  notes: string | null;
  is_active: boolean;
  days_count?: number;
  days?: RoutineDay[];
}

export interface TodayExercise extends RoutineDayExercise {
  last_performance: ExerciseSession | null;
}

export interface Today {
  date: string;
  weekday: number;
  routine: Pick<Routine, 'id' | 'name'> | null;
  day: (Omit<RoutineDay, 'exercises'> & { exercises: TodayExercise[] }) | null;
  days: Pick<RoutineDay, 'id' | 'name' | 'weekday'>[];
}
```

`frontend/src/app/core/models/labels.ts`:

```ts
import type { Equipment, MuscleGroup, SetType } from './exercise';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  shoulders: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  legs: 'Piernas',
  core: 'Core',
  other: 'Otro',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barra',
  dumbbell: 'Mancuerna',
  bodyweight: 'Peso corporal',
  machine: 'Máquina',
  cable: 'Polea',
};

export const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: 'Calentamiento',
  normal: 'Normal',
  bilbo: 'Bilbo',
  heavy: 'Pesada',
  failure: 'Al fallo',
  dropset: 'Dropset',
};

export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

export const MUSCLE_GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];
export const EQUIPMENTS = Object.keys(EQUIPMENT_LABELS) as Equipment[];
export const SET_TYPES = Object.keys(SET_TYPE_LABELS) as SetType[];
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
```

- [ ] **Step 5: Formatos de entrenamiento y errores**

`frontend/src/app/core/format/training.ts`:

```ts
import type { WorkoutSet } from '../models/exercise';
import type { RoutineDayExercise } from '../models/routine';
import { formatKg } from './format';

type Targets = Pick<RoutineDayExercise, 'target_sets' | 'target_reps_min' | 'target_reps_max'>;

/** { 3, 8, 12 } → "3 × 8-12"; sin reps → "3 series". */
export function formatTargets({ target_sets, target_reps_min, target_reps_max }: Targets): string {
  const min = target_reps_min ?? target_reps_max;
  const max = target_reps_max ?? target_reps_min;
  if (min === null || max === null) {
    return `${target_sets} ${target_sets === 1 ? 'serie' : 'series'}`;
  }
  return `${target_sets} × ${min === max ? min : `${min}-${max}`}`;
}

/** Mejor serie (más carga, luego más reps), ignorando calentamiento si hay otras. */
export function formatBestSet(sets: WorkoutSet[], usesBodyweight: boolean): string | null {
  const working = sets.filter((s) => s.set_type !== 'warmup');
  const pool = working.length > 0 ? working : sets;
  if (pool.length === 0) {
    return null;
  }
  const best = pool.reduce((a, b) => (b.weight_kg > a.weight_kg || (b.weight_kg === a.weight_kg && b.reps > a.reps) ? b : a));
  if (usesBodyweight) {
    return best.weight_kg > 0 ? `+${formatKg(best.weight_kg)} × ${best.reps}` : `${best.reps} reps`;
  }
  return `${formatKg(best.weight_kg)} × ${best.reps}`;
}

/** 150 → "2:30 min" */
export function formatRest(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest} min`;
}
```

`frontend/src/app/core/api/api-error.ts`:

```ts
import { HttpErrorResponse } from '@angular/common/http';

/** Mensaje en español para mostrar al usuario a partir de un error de la API. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'No se pudo conectar. Intenta de nuevo.';
    }
    const body = error.error as { message?: unknown; errors?: Record<string, string[]> } | null;
    if (error.status === 422 && body?.errors) {
      const first = Object.values(body.errors)[0]?.[0];
      if (first) {
        return first;
      }
    }
    if (error.status < 500 && typeof body?.message === 'string') {
      return body.message;
    }
  }
  return 'Ocurrió un error inesperado.';
}
```

- [ ] **Step 6: Interceptor CSRF**

`frontend/src/app/core/auth/csrf-retry.interceptor.ts`:

```ts
import {
  HttpContextToken,
  HttpErrorResponse,
  HttpEventType,
  HttpInterceptorFn,
  HttpRequest,
  HttpXsrfTokenExtractor,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, filter, switchMap, take, throwError } from 'rxjs';

const RETRIED = new HttpContextToken<boolean>(() => false);

/**
 * Si Laravel responde 419 (token CSRF expirado), pide una cookie nueva y reintenta una vez
 * con el token actualizado.
 */
export const csrfRetryInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(HttpXsrfTokenExtractor);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 419 || req.context.get(RETRIED)) {
        return throwError(() => error);
      }
      return next(new HttpRequest('GET', '/sanctum/csrf-cookie')).pipe(
        filter((event) => event.type === HttpEventType.Response),
        take(1),
        switchMap(() => {
          const token = tokens.getToken();
          return next(
            req.clone({
              context: req.context.set(RETRIED, true),
              setHeaders: token ? { 'X-XSRF-TOKEN': token } : {},
            }),
          );
        }),
      );
    }),
  );
};
```

En `frontend/src/app/app.config.ts`: agregar `withInterceptors([csrfRetryInterceptor])` a `provideHttpClient(...)` y `withComponentInputBinding()` a `provideRouter(routes, ...)` (imports desde `@angular/common/http` y `@angular/router`).

- [ ] **Step 7: Servicios API y estilos de formulario**

`frontend/src/app/core/api/exercises-api.ts`:

```ts
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Exercise, ExerciseInput, ExerciseSession, MuscleGroup, Paginated } from '../models/exercise';

interface Data<T> {
  data: T;
}

export interface ExerciseFilters {
  search?: string;
  muscle_group?: MuscleGroup | null;
  archived?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ExercisesApi {
  private readonly http = inject(HttpClient);

  async list(filters: ExerciseFilters = {}): Promise<Exercise[]> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.muscle_group) params = params.set('muscle_group', filters.muscle_group);
    if (filters.archived) params = params.set('archived', '1');
    return (await firstValueFrom(this.http.get<Data<Exercise[]>>('/api/exercises', { params }))).data;
  }

  async get(id: number): Promise<Exercise> {
    return (await firstValueFrom(this.http.get<Data<Exercise>>(`/api/exercises/${id}`))).data;
  }

  async create(input: ExerciseInput): Promise<Exercise> {
    return (await firstValueFrom(this.http.post<Data<Exercise>>('/api/exercises', input))).data;
  }

  async update(id: number, input: ExerciseInput): Promise<Exercise> {
    return (await firstValueFrom(this.http.put<Data<Exercise>>(`/api/exercises/${id}`, input))).data;
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/exercises/${id}`));
  }

  async archive(id: number): Promise<Exercise> {
    return (await firstValueFrom(this.http.post<Data<Exercise>>(`/api/exercises/${id}/archive`, {}))).data;
  }

  async restore(id: number): Promise<Exercise> {
    return (await firstValueFrom(this.http.post<Data<Exercise>>(`/api/exercises/${id}/restore`, {}))).data;
  }

  history(id: number, page = 1): Promise<Paginated<ExerciseSession>> {
    const params = new HttpParams().set('page', page);
    return firstValueFrom(this.http.get<Paginated<ExerciseSession>>(`/api/exercises/${id}/history`, { params }));
  }
}
```

`frontend/src/app/core/api/routines-api.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import type {
  Routine,
  RoutineDay,
  RoutineDayExercise,
  RoutineDayExerciseInput,
  RoutineDayExerciseTargets,
} from '../models/routine';

interface Data<T> {
  data: T;
}

export interface RoutineInput {
  name: string;
  notes: string | null;
}

export interface RoutineDayInput {
  name: string;
  weekday: number | null;
}

@Injectable({ providedIn: 'root' })
export class RoutinesApi {
  private readonly http = inject(HttpClient);

  private async data<T>(request: Observable<unknown>): Promise<T> {
    return ((await firstValueFrom(request)) as Data<T>).data;
  }

  list(): Promise<Routine[]> {
    return this.data(this.http.get('/api/routines'));
  }

  get(id: number): Promise<Routine> {
    return this.data(this.http.get(`/api/routines/${id}`));
  }

  create(input: RoutineInput): Promise<Routine> {
    return this.data(this.http.post('/api/routines', input));
  }

  update(id: number, input: RoutineInput): Promise<Routine> {
    return this.data(this.http.put(`/api/routines/${id}`, input));
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/routines/${id}`));
  }

  activate(id: number): Promise<Routine> {
    return this.data(this.http.post(`/api/routines/${id}/activate`, {}));
  }

  createDay(routineId: number, input: RoutineDayInput): Promise<RoutineDay> {
    return this.data(this.http.post(`/api/routines/${routineId}/days`, input));
  }

  updateDay(dayId: number, input: RoutineDayInput): Promise<RoutineDay> {
    return this.data(this.http.put(`/api/routine-days/${dayId}`, input));
  }

  async removeDay(dayId: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/routine-days/${dayId}`));
  }

  async reorderDays(routineId: number, ids: number[]): Promise<void> {
    await firstValueFrom(this.http.put(`/api/routines/${routineId}/days/reorder`, { ids }));
  }

  duplicateDay(dayId: number): Promise<RoutineDay> {
    return this.data(this.http.post(`/api/routine-days/${dayId}/duplicate`, {}));
  }

  addExercise(dayId: number, input: RoutineDayExerciseInput): Promise<RoutineDayExercise> {
    return this.data(this.http.post(`/api/routine-days/${dayId}/exercises`, input));
  }

  updateExercise(id: number, targets: RoutineDayExerciseTargets): Promise<RoutineDayExercise> {
    return this.data(this.http.put(`/api/routine-day-exercises/${id}`, targets));
  }

  async removeExercise(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/routine-day-exercises/${id}`));
  }

  async reorderExercises(dayId: number, ids: number[]): Promise<void> {
    await firstValueFrom(this.http.put(`/api/routine-days/${dayId}/exercises/reorder`, { ids }));
  }
}
```

`frontend/src/app/core/api/today-api.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Today } from '../models/routine';

@Injectable({ providedIn: 'root' })
export class TodayApi {
  private readonly http = inject(HttpClient);

  async get(): Promise<Today> {
    return (await firstValueFrom(this.http.get<{ data: Today }>('/api/today'))).data;
  }
}
```

`frontend/src/app/shared/ui/form-styles.ts`:

```ts
/** Clases para <select> nativo con el mismo aspecto que hlmInput (alto táctil de 48 px). */
export const SELECT_CLASS =
  'h-12 w-full rounded-md border border-input bg-transparent px-3 text-base dark:bg-input/30 ' +
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none';
```

- [ ] **Step 8: Correr y verificar que pasan**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build exitoso.

- [ ] **Step 9: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add -A frontend
git commit -m "feat(frontend): add typed API services, labels, training formatters and CSRF retry"
```

---

### Task 7: Páginas de ejercicios

**Files:**
- Create: `frontend/src/app/features/exercises/filter-exercises.ts`
- Modify: `frontend/src/app/features/exercises/exercises-page.ts`
- Create: `frontend/src/app/features/exercises/exercise-form-page.ts`, `exercise-detail-page.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Test: `frontend/src/app/features/exercises/filter-exercises.spec.ts`

**Interfaces:**
- Consumes: `ExercisesApi`, labels, `formatBestSet`, `formatDate`, `apiErrorMessage`, `SELECT_CLASS` (Task 6).
- Produces: `filterExercises(list, search, group)`; rutas `/ejercicios`, `/ejercicios/nuevo`, `/ejercicios/:id`, `/ejercicios/:id/editar`.

- [ ] **Step 1: Escribir el test que falla**

`frontend/src/app/features/exercises/filter-exercises.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../core/models/exercise';
import { filterExercises } from './filter-exercises';

const ex = (name: string, muscle_group: Exercise['muscle_group']): Exercise => ({
  id: Math.random(), name, muscle_group, equipment: 'barbell', is_unilateral: false,
  uses_bodyweight: false, notes: null, archived_at: null,
});

const list = [ex('Jalón al pecho', 'back'), ex('Press de banca', 'chest'), ex('Press militar', 'shoulders')];

describe('filterExercises', () => {
  it('returns everything without filters', () => {
    expect(filterExercises(list, '', null)).toHaveLength(3);
  });
  it('matches ignoring case and accents', () => {
    expect(filterExercises(list, 'jalon', null).map((e) => e.name)).toEqual(['Jalón al pecho']);
    expect(filterExercises(list, 'PRESS', null)).toHaveLength(2);
  });
  it('combines search and muscle group', () => {
    expect(filterExercises(list, 'press', 'chest').map((e) => e.name)).toEqual(['Press de banca']);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implementar el filtro**

`frontend/src/app/features/exercises/filter-exercises.ts`:

```ts
import type { Exercise, MuscleGroup } from '../../core/models/exercise';

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Filtro en el cliente: instantáneo mientras se escribe e independiente de tildes. */
export function filterExercises(list: Exercise[], search: string, group: MuscleGroup | null): Exercise[] {
  const term = normalize(search.trim());
  return list.filter(
    (exercise) => (!group || exercise.muscle_group === group) && (!term || normalize(exercise.name).includes(term)),
  );
}
```

- [ ] **Step 4: Lista de ejercicios**

`frontend/src/app/features/exercises/exercises-page.ts` (reemplazar):

```ts
import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucidePlus } from '@ng-icons/lucide';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { ExercisesApi } from '../../core/api/exercises-api';
import type { MuscleGroup } from '../../core/models/exercise';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from '../../core/models/labels';
import { filterExercises } from './filter-exercises';

@Component({
  selector: 'app-exercises-page',
  imports: [RouterLink, NgIcon, HlmBadge, HlmButton, HlmInput],
  providers: [provideIcons({ lucidePlus, lucideChevronRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">Ejercicios</h1>
      <a hlmBtn routerLink="/ejercicios/nuevo" class="h-12 px-4"><ng-icon name="lucidePlus" /> Nuevo</a>
    </header>

    <input hlmInput type="search" placeholder="Buscar ejercicio…" class="mb-3 h-12 w-full text-base"
           [value]="search()" (input)="search.set($any($event.target).value)" aria-label="Buscar ejercicio" />

    <div class="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button hlmBtn size="sm" class="h-10 shrink-0" [variant]="group() === null ? 'default' : 'outline'"
              (click)="group.set(null)">Todos</button>
      @for (g of groups; track g) {
        <button hlmBtn size="sm" class="h-10 shrink-0" [variant]="group() === g ? 'default' : 'outline'"
                (click)="group.set(g)">{{ muscleLabels[g] }}</button>
      }
    </div>

    <label class="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
      <input type="checkbox" class="size-5" [checked]="archived()" (change)="archived.set(!archived())" />
      Ver archivados
    </label>

    @if (exercises.isLoading()) {
      <p class="text-muted-foreground">Cargando…</p>
    } @else if (exercises.error()) {
      <p class="text-destructive">No se pudieron cargar los ejercicios.</p>
    } @else {
      <ul class="divide-y divide-border rounded-lg border border-border">
        @for (exercise of visible(); track exercise.id) {
          <li>
            <a [routerLink]="['/ejercicios', exercise.id]" class="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
              <span>
                <span class="block font-medium">{{ exercise.name }}</span>
                <span class="text-sm text-muted-foreground">
                  {{ muscleLabels[exercise.muscle_group] }} · {{ equipmentLabels[exercise.equipment] }}
                </span>
              </span>
              <span class="flex items-center gap-2">
                @if (exercise.archived_at) { <span hlmBadge variant="secondary">Archivado</span> }
                <ng-icon name="lucideChevronRight" class="text-muted-foreground" />
              </span>
            </a>
          </li>
        } @empty {
          <li class="px-4 py-6 text-center text-muted-foreground">No hay ejercicios que coincidan.</li>
        }
      </ul>
    }
  `,
})
export class ExercisesPage {
  private readonly api = inject(ExercisesApi);

  protected readonly groups = MUSCLE_GROUPS;
  protected readonly muscleLabels = MUSCLE_GROUP_LABELS;
  protected readonly equipmentLabels = EQUIPMENT_LABELS;

  protected readonly search = signal('');
  protected readonly group = signal<MuscleGroup | null>(null);
  protected readonly archived = signal(false);

  protected readonly exercises = resource({
    params: () => ({ archived: this.archived() }),
    loader: ({ params }) => this.api.list(params),
  });

  protected readonly visible = computed(() =>
    filterExercises(this.exercises.value() ?? [], this.search(), this.group()),
  );
}
```

- [ ] **Step 5: Formulario de ejercicio**

`frontend/src/app/features/exercises/exercise-form-page.ts`:

```ts
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { apiErrorMessage } from '../../core/api/api-error';
import { ExercisesApi } from '../../core/api/exercises-api';
import type { Equipment, ExerciseInput, MuscleGroup } from '../../core/models/exercise';
import { EQUIPMENTS, EQUIPMENT_LABELS, MUSCLE_GROUPS, MUSCLE_GROUP_LABELS } from '../../core/models/labels';
import { SELECT_CLASS } from '../../shared/ui/form-styles';

@Component({
  selector: 'app-exercise-form-page',
  imports: [ReactiveFormsModule, RouterLink, HlmButton, HlmInput, HlmLabel, HlmTextarea],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-6 text-2xl font-bold">{{ id() ? 'Editar ejercicio' : 'Nuevo ejercicio' }}</h1>

    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-5" novalidate>
      <div class="flex flex-col gap-2">
        <label hlmLabel for="name">Nombre</label>
        <input hlmInput id="name" formControlName="name" class="h-12 text-base" autocomplete="off" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-2">
          <label hlmLabel for="muscle_group">Grupo muscular</label>
          <select id="muscle_group" formControlName="muscle_group" [class]="selectClass">
            @for (g of groups; track g) { <option [ngValue]="g">{{ muscleLabels[g] }}</option> }
          </select>
        </div>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="equipment">Equipamiento</label>
          <select id="equipment" formControlName="equipment" [class]="selectClass">
            @for (e of equipments; track e) { <option [ngValue]="e">{{ equipmentLabels[e] }}</option> }
          </select>
        </div>
      </div>
      <label class="flex min-h-12 items-center gap-3">
        <input type="checkbox" class="size-5" formControlName="is_unilateral" />
        Unilateral (se registra cada lado por separado)
      </label>
      <label class="flex min-h-12 items-center gap-3">
        <input type="checkbox" class="size-5" formControlName="uses_bodyweight" />
        Usa peso corporal (el peso anotado es extra)
      </label>
      <div class="flex flex-col gap-2">
        <label hlmLabel for="notes">Notas</label>
        <textarea hlmTextarea id="notes" formControlName="notes" rows="3" class="text-base"></textarea>
      </div>

      @if (error()) { <p class="text-sm text-destructive" role="alert">{{ error() }}</p> }

      <div class="flex gap-3">
        <a hlmBtn variant="outline" class="h-12 flex-1" [routerLink]="id() ? ['/ejercicios', id()] : '/ejercicios'">Cancelar</a>
        <button hlmBtn type="submit" class="h-12 flex-1" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </form>
  `,
})
export class ExerciseFormPage implements OnInit {
  private readonly api = inject(ExercisesApi);
  private readonly router = inject(Router);

  /** Parámetro de ruta `:id` (ausente al crear). */
  readonly id = input<string>();

  protected readonly selectClass = SELECT_CLASS;
  protected readonly groups = MUSCLE_GROUPS;
  protected readonly equipments = EQUIPMENTS;
  protected readonly muscleLabels = MUSCLE_GROUP_LABELS;
  protected readonly equipmentLabels = EQUIPMENT_LABELS;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    muscle_group: new FormControl<MuscleGroup>('chest', { nonNullable: true }),
    equipment: new FormControl<Equipment>('barbell', { nonNullable: true }),
    is_unilateral: new FormControl(false, { nonNullable: true }),
    uses_bodyweight: new FormControl(false, { nonNullable: true }),
    notes: new FormControl<string | null>(null),
  });

  async ngOnInit(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      const exercise = await this.api.get(Number(id));
      this.form.patchValue(exercise);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.error.set('El nombre es obligatorio.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const input: ExerciseInput = { ...this.form.getRawValue(), notes: this.form.value.notes || null };
    try {
      const id = this.id();
      const saved = id ? await this.api.update(Number(id), input) : await this.api.create(input);
      await this.router.navigate(['/ejercicios', saved.id]);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 6: Ficha del ejercicio con historial**

`frontend/src/app/features/exercises/exercise-detail-page.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { apiErrorMessage } from '../../core/api/api-error';
import { ExercisesApi } from '../../core/api/exercises-api';
import { formatDate, formatKg } from '../../core/format/format';
import type { Exercise, ExerciseSession } from '../../core/models/exercise';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS, SET_TYPE_LABELS } from '../../core/models/labels';

@Component({
  selector: 'app-exercise-detail-page',
  imports: [RouterLink, HlmBadge, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/ejercicios" class="mb-4 inline-block text-sm text-muted-foreground">← Ejercicios</a>

    @if (exercise.value(); as ex) {
      <header class="mb-4">
        <h1 class="text-2xl font-bold">{{ ex.name }}</h1>
        <p class="text-muted-foreground">
          {{ muscleLabels[ex.muscle_group] }} · {{ equipmentLabels[ex.equipment] }}
          @if (ex.is_unilateral) { · Unilateral }
          @if (ex.uses_bodyweight) { · Peso corporal }
        </p>
        @if (ex.archived_at) { <span hlmBadge variant="secondary" class="mt-2">Archivado</span> }
        @if (ex.notes) { <p class="mt-2 whitespace-pre-line">{{ ex.notes }}</p> }
      </header>

      <div class="mb-6 grid grid-cols-2 gap-3">
        <a hlmBtn variant="outline" class="h-12" [routerLink]="['/ejercicios', ex.id, 'editar']">Editar</a>
        @if (ex.archived_at) {
          <button hlmBtn variant="outline" class="h-12" (click)="toggleArchive(ex)">Restaurar</button>
        } @else {
          <button hlmBtn variant="outline" class="h-12" (click)="toggleArchive(ex)">Archivar</button>
        }
        @if (!ex.has_history) {
          <button hlmBtn variant="destructive" class="col-span-2 h-12" (click)="remove(ex)">Eliminar</button>
        }
      </div>

      @if (error()) { <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p> }

      <h2 class="mb-2 text-lg font-semibold">Historial</h2>
      @for (session of sessions(); track session.workout_id) {
        <section class="mb-3 rounded-lg border border-border p-3">
          <h3 class="mb-1 font-medium">{{ formatDate(session.date) }}</h3>
          <ul class="text-sm">
            @for (set of session.sets; track set.id) {
              <li>
                {{ set.set_number }}. {{ formatKg(set.weight_kg) }} × {{ set.reps }}
                @if (set.set_type !== 'normal') { <span class="text-muted-foreground">({{ setTypeLabels[set.set_type] }})</span> }
              </li>
            }
          </ul>
        </section>
      } @empty {
        <p class="text-muted-foreground">Todavía no hay series registradas.</p>
      }
      @if (hasMore()) {
        <button hlmBtn variant="outline" class="h-12 w-full" (click)="loadMore()">Cargar más</button>
      }
    } @else if (exercise.error()) {
      <p class="text-destructive">No se encontró el ejercicio.</p>
    } @else {
      <p class="text-muted-foreground">Cargando…</p>
    }
  `,
})
export class ExerciseDetailPage {
  private readonly api = inject(ExercisesApi);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly muscleLabels = MUSCLE_GROUP_LABELS;
  protected readonly equipmentLabels = EQUIPMENT_LABELS;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly formatDate = formatDate;
  protected readonly formatKg = formatKg;

  protected readonly error = signal<string | null>(null);
  protected readonly sessions = signal<ExerciseSession[]>([]);
  protected readonly hasMore = signal(false);
  private page = 1;

  protected readonly exercise = resource({
    params: () => Number(this.id()),
    loader: async ({ params: id }) => {
      const [exercise, history] = await Promise.all([this.api.get(id), this.api.history(id, 1)]);
      this.page = 1;
      this.sessions.set(history.data);
      this.hasMore.set(history.meta.current_page < history.meta.last_page);
      return exercise;
    },
  });

  async loadMore(): Promise<void> {
    const history = await this.api.history(Number(this.id()), ++this.page);
    this.sessions.update((list) => [...list, ...history.data]);
    this.hasMore.set(history.meta.current_page < history.meta.last_page);
  }

  async toggleArchive(exercise: Exercise): Promise<void> {
    this.error.set(null);
    try {
      const updated = exercise.archived_at ? await this.api.restore(exercise.id) : await this.api.archive(exercise.id);
      this.exercise.set(updated);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  async remove(exercise: Exercise): Promise<void> {
    if (!confirm(`¿Eliminar "${exercise.name}"? Esta acción no se puede deshacer.`)) return;
    this.error.set(null);
    try {
      await this.api.remove(exercise.id);
      await this.router.navigateByUrl('/ejercicios');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }
}
```

- [ ] **Step 7: Rutas**

En `frontend/src/app/app.routes.ts`, reemplazar la ruta `ejercicios` por:

```ts
{
  path: 'ejercicios',
  title: 'Ejercicios · GymTracker',
  children: [
    { path: '', loadComponent: () => import('./features/exercises/exercises-page').then((m) => m.ExercisesPage) },
    { path: 'nuevo', loadComponent: () => import('./features/exercises/exercise-form-page').then((m) => m.ExerciseFormPage) },
    { path: ':id', loadComponent: () => import('./features/exercises/exercise-detail-page').then((m) => m.ExerciseDetailPage) },
    { path: ':id/editar', loadComponent: () => import('./features/exercises/exercise-form-page').then((m) => m.ExerciseFormPage) },
  ],
},
```

- [ ] **Step 8: Correr y verificar**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build exitoso.

- [ ] **Step 9: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): add exercises list, form and detail with history"
```

---

### Task 8: Páginas de rutinas (lista, detalle con días, editor de día)

**Files:**
- Modify: `frontend/src/app/features/routines/routines-page.ts`
- Create: `frontend/src/app/features/routines/routine-detail-page.ts`, `routine-day-page.ts`, `routine-exercise-form.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Test: `frontend/src/app/features/routines/routine-exercise-form.spec.ts`

**Interfaces:**
- Consumes: `RoutinesApi`, `ExercisesApi`, labels, `formatTargets`, `formatRest`, `apiErrorMessage`, `SELECT_CLASS`, Angular CDK drag & drop.
- Produces:
  - `RoutineExerciseForm` (`app-routine-exercise-form`): inputs `exercises: Exercise[] | null` (null = editar, sin selector de ejercicio), `initial: RoutineDayExercise | null`, `submitLabel: string`; output `saved: RoutineDayExerciseInput` (al editar, `exercise_id` = el del `initial`), `cancelled: void`.
  - Rutas `/rutinas`, `/rutinas/:id`, `/rutinas/:id/dias/:dayId`.

- [ ] **Step 1: Escribir el test que falla**

`frontend/src/app/features/routines/routine-exercise-form.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../core/models/exercise';
import type { RoutineDayExerciseInput } from '../../core/models/routine';
import { RoutineExerciseForm } from './routine-exercise-form';

const pullUps: Exercise = {
  id: 4, name: 'Dominadas', muscle_group: 'back', equipment: 'bodyweight',
  is_unilateral: false, uses_bodyweight: true, notes: null, archived_at: null,
};

describe('RoutineExerciseForm', () => {
  it('emits the targets with the chosen exercise', async () => {
    const fixture = TestBed.createComponent(RoutineExerciseForm);
    fixture.componentRef.setInput('exercises', [pullUps]);
    fixture.componentRef.setInput('initial', null);
    fixture.componentRef.setInput('submitLabel', 'Agregar');
    await fixture.whenStable();

    let emitted: RoutineDayExerciseInput | undefined;
    fixture.componentInstance.saved.subscribe((value) => (emitted = value));

    const form = fixture.componentInstance['form'];
    form.patchValue({ exercise_id: 4, target_sets: 6, target_reps_min: 5, target_reps_max: 6, rest_seconds: 150 });
    fixture.componentInstance['submit']();

    expect(emitted).toEqual({
      exercise_id: 4, target_sets: 6, target_reps_min: 5, target_reps_max: 6, target_text: null,
      default_set_type: 'normal', rest_seconds: 150, notes: null,
    });
  });

  it('does not emit when the reps range is inverted', async () => {
    const fixture = TestBed.createComponent(RoutineExerciseForm);
    fixture.componentRef.setInput('exercises', [pullUps]);
    fixture.componentRef.setInput('initial', null);
    fixture.componentRef.setInput('submitLabel', 'Agregar');
    await fixture.whenStable();

    let emitted = false;
    fixture.componentInstance.saved.subscribe(() => (emitted = true));
    fixture.componentInstance['form'].patchValue({ exercise_id: 4, target_reps_min: 10, target_reps_max: 8 });
    fixture.componentInstance['submit']();

    expect(emitted).toBe(false);
    expect(fixture.componentInstance['error']()).toBe('El máximo de reps no puede ser menor que el mínimo.');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Formulario de objetivos**

`frontend/src/app/features/routines/routine-exercise-form.ts`:

```ts
import { ChangeDetectionStrategy, Component, OnInit, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import type { Exercise, SetType } from '../../core/models/exercise';
import { SET_TYPES, SET_TYPE_LABELS } from '../../core/models/labels';
import type { RoutineDayExercise, RoutineDayExerciseInput } from '../../core/models/routine';
import { SELECT_CLASS } from '../../shared/ui/form-styles';

@Component({
  selector: 'app-routine-exercise-form',
  imports: [ReactiveFormsModule, HlmButton, HlmInput, HlmLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
      @if (exercises(); as list) {
        <div class="flex flex-col gap-2">
          <label hlmLabel for="exercise_id">Ejercicio</label>
          <select id="exercise_id" formControlName="exercise_id" [class]="selectClass">
            <option [ngValue]="null" disabled>Elige un ejercicio</option>
            @for (exercise of list; track exercise.id) { <option [ngValue]="exercise.id">{{ exercise.name }}</option> }
          </select>
        </div>
      }
      <div class="grid grid-cols-3 gap-3">
        <div class="flex flex-col gap-2">
          <label hlmLabel for="target_sets">Series</label>
          <input hlmInput id="target_sets" type="number" inputmode="numeric" min="1" max="20" formControlName="target_sets" class="h-12 text-base" />
        </div>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="target_reps_min">Reps mín.</label>
          <input hlmInput id="target_reps_min" type="number" inputmode="numeric" min="1" formControlName="target_reps_min" class="h-12 text-base" />
        </div>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="target_reps_max">Reps máx.</label>
          <input hlmInput id="target_reps_max" type="number" inputmode="numeric" min="1" formControlName="target_reps_max" class="h-12 text-base" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-2">
          <label hlmLabel for="default_set_type">Tipo de serie</label>
          <select id="default_set_type" formControlName="default_set_type" [class]="selectClass">
            @for (type of setTypes; track type) { <option [ngValue]="type">{{ setTypeLabels[type] }}</option> }
          </select>
        </div>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="rest_seconds">Descanso (s)</label>
          <input hlmInput id="rest_seconds" type="number" inputmode="numeric" min="0" max="900" step="15" formControlName="rest_seconds" class="h-12 text-base" />
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <label hlmLabel for="target_text">Indicación (opcional)</label>
        <input hlmInput id="target_text" formControlName="target_text" placeholder="Ej.: ~30 reps explosivas" class="h-12 text-base" />
      </div>
      <div class="flex flex-col gap-2">
        <label hlmLabel for="notes">Notas (opcional)</label>
        <input hlmInput id="notes" formControlName="notes" class="h-12 text-base" />
      </div>

      @if (error()) { <p class="text-sm text-destructive" role="alert">{{ error() }}</p> }

      <div class="flex gap-3">
        <button hlmBtn type="button" variant="outline" class="h-12 flex-1" (click)="cancelled.emit()">Cancelar</button>
        <button hlmBtn type="submit" class="h-12 flex-1">{{ submitLabel() }}</button>
      </div>
    </form>
  `,
})
export class RoutineExerciseForm implements OnInit {
  /** Ejercicios elegibles; null al editar (el ejercicio no cambia). */
  readonly exercises = input<Exercise[] | null>(null);
  readonly initial = input<RoutineDayExercise | null>(null);
  readonly submitLabel = input('Guardar');

  readonly saved = output<RoutineDayExerciseInput>();
  readonly cancelled = output<void>();

  protected readonly selectClass = SELECT_CLASS;
  protected readonly setTypes = SET_TYPES;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    exercise_id: new FormControl<number | null>(null),
    target_sets: new FormControl(3, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(20)] }),
    target_reps_min: new FormControl<number | null>(8),
    target_reps_max: new FormControl<number | null>(12),
    target_text: new FormControl<string | null>(null),
    default_set_type: new FormControl<SetType>('normal', { nonNullable: true }),
    rest_seconds: new FormControl(120, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(900)] }),
    notes: new FormControl<string | null>(null),
  });

  ngOnInit(): void {
    const initial = this.initial();
    if (initial) {
      this.form.patchValue({ ...initial, exercise_id: initial.exercise.id });
    }
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    if (value.exercise_id === null) {
      this.error.set('Elige un ejercicio.');
      return;
    }
    if (this.form.invalid) {
      this.error.set('Revisa las series y el descanso.');
      return;
    }
    if (value.target_reps_min !== null && value.target_reps_max !== null && value.target_reps_max < value.target_reps_min) {
      this.error.set('El máximo de reps no puede ser menor que el mínimo.');
      return;
    }
    this.error.set(null);
    this.saved.emit({
      ...value,
      exercise_id: value.exercise_id,
      target_text: value.target_text || null,
      notes: value.notes || null,
    });
  }
}
```

- [ ] **Step 4: Lista de rutinas**

`frontend/src/app/features/routines/routines-page.ts` (reemplazar):

```ts
import { ChangeDetectionStrategy, Component, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { apiErrorMessage } from '../../core/api/api-error';
import { RoutinesApi } from '../../core/api/routines-api';
import type { Routine } from '../../core/models/routine';

@Component({
  selector: 'app-routines-page',
  imports: [RouterLink, HlmBadge, HlmButton, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-4 text-2xl font-bold">Rutinas</h1>

    <form class="mb-6 flex gap-2" (submit)="$event.preventDefault(); create()">
      <input hlmInput class="h-12 flex-1 text-base" placeholder="Nombre de la nueva rutina"
             [value]="newName()" (input)="newName.set($any($event.target).value)" aria-label="Nombre de la nueva rutina" />
      <button hlmBtn type="submit" class="h-12 px-4" [disabled]="!newName().trim()">Crear</button>
    </form>

    @if (error()) { <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p> }

    @if (routines.value(); as list) {
      <ul class="flex flex-col gap-3">
        @for (routine of list; track routine.id) {
          <li class="rounded-lg border border-border p-4">
            <a [routerLink]="['/rutinas', routine.id]" class="block">
              <span class="flex items-center gap-2 text-lg font-semibold">
                {{ routine.name }}
                @if (routine.is_active) { <span hlmBadge>Activa</span> }
              </span>
              <span class="text-sm text-muted-foreground">{{ routine.days_count }} {{ routine.days_count === 1 ? 'día' : 'días' }}</span>
            </a>
            @if (!routine.is_active) {
              <button hlmBtn variant="outline" class="mt-3 h-12 w-full" (click)="activate(routine)">Marcar como activa</button>
            }
          </li>
        } @empty {
          <li class="text-muted-foreground">Todavía no tienes rutinas.</li>
        }
      </ul>
    } @else if (routines.isLoading()) {
      <p class="text-muted-foreground">Cargando…</p>
    }
  `,
})
export class RoutinesPage {
  private readonly api = inject(RoutinesApi);
  private readonly router = inject(Router);

  protected readonly newName = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly routines = resource({ loader: () => this.api.list() });

  async create(): Promise<void> {
    this.error.set(null);
    try {
      const routine = await this.api.create({ name: this.newName().trim(), notes: null });
      await this.router.navigate(['/rutinas', routine.id]);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  async activate(routine: Routine): Promise<void> {
    this.error.set(null);
    try {
      await this.api.activate(routine.id);
      this.routines.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }
}
```

- [ ] **Step 5: Detalle de rutina (días con drag & drop)**

`frontend/src/app/features/routines/routine-detail-page.ts`:

```ts
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideGripVertical, lucideTrash2 } from '@ng-icons/lucide';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { apiErrorMessage } from '../../core/api/api-error';
import { RoutinesApi } from '../../core/api/routines-api';
import { WEEKDAYS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { Routine, RoutineDay } from '../../core/models/routine';
import { SELECT_CLASS } from '../../shared/ui/form-styles';

@Component({
  selector: 'app-routine-detail-page',
  imports: [ReactiveFormsModule, RouterLink, CdkDropList, CdkDrag, CdkDragHandle, NgIcon, HlmBadge, HlmButton, HlmInput, HlmLabel],
  providers: [provideIcons({ lucideGripVertical, lucideCopy, lucideTrash2 })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/rutinas" class="mb-4 inline-block text-sm text-muted-foreground">← Rutinas</a>

    @if (routine(); as r) {
      <form class="mb-2 flex gap-2" (submit)="$event.preventDefault(); rename(r)">
        <input hlmInput class="h-12 flex-1 text-lg font-semibold" [value]="r.name" #name
               (change)="draftName.set(name.value)" aria-label="Nombre de la rutina" />
        <button hlmBtn type="submit" variant="outline" class="h-12" [disabled]="!draftName()">Guardar</button>
      </form>
      <div class="mb-6 flex items-center gap-3">
        @if (r.is_active) {
          <span hlmBadge>Activa</span>
        } @else {
          <button hlmBtn variant="outline" class="h-12" (click)="activate(r)">Marcar como activa</button>
        }
      </div>

      @if (error()) { <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p> }

      <h2 class="mb-2 text-lg font-semibold">Días</h2>
      <ul cdkDropList (cdkDropListDropped)="dropDay($event)" class="mb-6 flex flex-col gap-2">
        @for (day of r.days; track day.id) {
          <li cdkDrag class="flex items-center gap-2 rounded-lg border border-border bg-background p-2">
            <button cdkDragHandle type="button" class="flex size-12 shrink-0 cursor-grab items-center justify-center text-muted-foreground" aria-label="Arrastrar para reordenar">
              <ng-icon name="lucideGripVertical" size="20" />
            </button>
            <a [routerLink]="['/rutinas', r.id, 'dias', day.id]" class="min-w-0 flex-1 py-2">
              <span class="block truncate font-medium">{{ day.name }}</span>
              <span class="text-sm text-muted-foreground">
                {{ day.weekday ? weekdayLabels[day.weekday] : 'Sin día fijo' }} · {{ day.exercises?.length ?? 0 }} ejercicios
              </span>
            </a>
            <button hlmBtn variant="ghost" size="icon-lg" (click)="duplicate(day)" aria-label="Duplicar día">
              <ng-icon name="lucideCopy" />
            </button>
            <button hlmBtn variant="ghost" size="icon-lg" (click)="removeDay(day)" aria-label="Eliminar día">
              <ng-icon name="lucideTrash2" />
            </button>
          </li>
        } @empty {
          <li class="text-muted-foreground">Agrega el primer día de la rutina.</li>
        }
      </ul>

      <h2 class="mb-2 text-lg font-semibold">Agregar día</h2>
      <form [formGroup]="dayForm" (ngSubmit)="addDay(r)" class="mb-8 flex flex-col gap-3" novalidate>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="day_name">Nombre</label>
          <input hlmInput id="day_name" formControlName="name" placeholder="Ej.: Lunes – Pecho" class="h-12 text-base" />
        </div>
        <div class="flex flex-col gap-2">
          <label hlmLabel for="day_weekday">Día de la semana</label>
          <select id="day_weekday" formControlName="weekday" [class]="selectClass">
            <option [ngValue]="null">Sin día fijo</option>
            @for (w of weekdays; track w) { <option [ngValue]="w">{{ weekdayLabels[w] }}</option> }
          </select>
        </div>
        <button hlmBtn type="submit" class="h-12" [disabled]="dayForm.invalid">Agregar día</button>
      </form>

      <button hlmBtn variant="destructive" class="h-12 w-full" (click)="removeRoutine(r)">Eliminar rutina</button>
    } @else if (error()) {
      <p class="text-destructive">{{ error() }}</p>
    } @else {
      <p class="text-muted-foreground">Cargando…</p>
    }
  `,
})
export class RoutineDetailPage implements OnInit {
  private readonly api = inject(RoutinesApi);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly selectClass = SELECT_CLASS;
  protected readonly weekdays = WEEKDAYS;
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly routine = signal<Routine | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly draftName = signal('');

  protected readonly dayForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    weekday: new FormControl<number | null>(null),
  });

  ngOnInit(): Promise<void> {
    return this.load();
  }

  private async load(): Promise<void> {
    try {
      this.routine.set(await this.api.get(Number(this.id())));
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    try {
      await action();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
    await this.load();
  }

  rename(routine: Routine): Promise<void> {
    return this.run(() => this.api.update(routine.id, { name: this.draftName(), notes: routine.notes }));
  }

  activate(routine: Routine): Promise<void> {
    return this.run(() => this.api.activate(routine.id));
  }

  async dropDay(event: CdkDragDrop<RoutineDay[]>): Promise<void> {
    const routine = this.routine();
    if (!routine?.days || event.previousIndex === event.currentIndex) return;
    const days = [...routine.days];
    moveItemInArray(days, event.previousIndex, event.currentIndex);
    this.routine.set({ ...routine, days });
    await this.run(() => this.api.reorderDays(routine.id, days.map((d) => d.id)));
  }

  async addDay(routine: Routine): Promise<void> {
    const { name, weekday } = this.dayForm.getRawValue();
    await this.run(async () => {
      await this.api.createDay(routine.id, { name: name.trim(), weekday });
      this.dayForm.reset({ name: '', weekday: null });
    });
  }

  duplicate(day: RoutineDay): Promise<void> {
    return this.run(() => this.api.duplicateDay(day.id));
  }

  async removeDay(day: RoutineDay): Promise<void> {
    if (!confirm(`¿Eliminar el día "${day.name}"?`)) return;
    await this.run(() => this.api.removeDay(day.id));
  }

  async removeRoutine(routine: Routine): Promise<void> {
    if (!confirm(`¿Eliminar la rutina "${routine.name}"? El historial de entrenamientos se conserva.`)) return;
    try {
      await this.api.remove(routine.id);
      await this.router.navigateByUrl('/rutinas');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }
}
```

- [ ] **Step 6: Editor de un día**

`frontend/src/app/features/routines/routine-day-page.ts`:

```ts
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGripVertical, lucidePencil, lucideTrash2 } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { apiErrorMessage } from '../../core/api/api-error';
import { ExercisesApi } from '../../core/api/exercises-api';
import { RoutinesApi } from '../../core/api/routines-api';
import { formatRest, formatTargets } from '../../core/format/training';
import type { Exercise } from '../../core/models/exercise';
import { SET_TYPE_LABELS, WEEKDAYS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { RoutineDay, RoutineDayExercise, RoutineDayExerciseInput } from '../../core/models/routine';
import { SELECT_CLASS } from '../../shared/ui/form-styles';
import { RoutineExerciseForm } from './routine-exercise-form';

@Component({
  selector: 'app-routine-day-page',
  imports: [ReactiveFormsModule, RouterLink, CdkDropList, CdkDrag, CdkDragHandle, NgIcon, HlmButton, HlmInput, HlmLabel, RoutineExerciseForm],
  providers: [provideIcons({ lucideGripVertical, lucidePencil, lucideTrash2 })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="['/rutinas', id()]" class="mb-4 inline-block text-sm text-muted-foreground">← Rutina</a>

    @if (day(); as d) {
      <form [formGroup]="dayForm" (ngSubmit)="saveDay(d)" class="mb-6 flex flex-col gap-3" novalidate>
        <input hlmInput formControlName="name" class="h-12 text-lg font-semibold" aria-label="Nombre del día" />
        <div class="flex gap-2">
          <select formControlName="weekday" [class]="selectClass" aria-label="Día de la semana">
            <option [ngValue]="null">Sin día fijo</option>
            @for (w of weekdays; track w) { <option [ngValue]="w">{{ weekdayLabels[w] }}</option> }
          </select>
          <button hlmBtn type="submit" variant="outline" class="h-12" [disabled]="dayForm.pristine || dayForm.invalid">Guardar</button>
        </div>
      </form>

      @if (error()) { <p class="mb-4 text-sm text-destructive" role="alert">{{ error() }}</p> }

      <ul cdkDropList (cdkDropListDropped)="drop($event)" class="mb-6 flex flex-col gap-2">
        @for (item of d.exercises; track item.id) {
          <li cdkDrag class="rounded-lg border border-border bg-background p-2">
            @if (editingId() === item.id) {
              <p class="mb-3 px-2 font-medium">{{ item.exercise.name }}</p>
              <app-routine-exercise-form [initial]="item" submitLabel="Guardar"
                (saved)="update(item, $event)" (cancelled)="editingId.set(null)" />
            } @else {
              <div class="flex items-center gap-2">
                <button cdkDragHandle type="button" class="flex size-12 shrink-0 cursor-grab items-center justify-center text-muted-foreground" aria-label="Arrastrar para reordenar">
                  <ng-icon name="lucideGripVertical" size="20" />
                </button>
                <div class="min-w-0 flex-1">
                  <span class="block truncate font-medium">{{ item.exercise.name }}</span>
                  <span class="text-sm text-muted-foreground">
                    {{ formatTargets(item) }} · {{ setTypeLabels[item.default_set_type] }} · {{ formatRest(item.rest_seconds) }}
                  </span>
                  @if (item.target_text) { <span class="block text-sm text-muted-foreground">{{ item.target_text }}</span> }
                </div>
                <button hlmBtn variant="ghost" size="icon-lg" (click)="editingId.set(item.id)" aria-label="Editar objetivos">
                  <ng-icon name="lucidePencil" />
                </button>
                <button hlmBtn variant="ghost" size="icon-lg" (click)="remove(item)" aria-label="Quitar del día">
                  <ng-icon name="lucideTrash2" />
                </button>
              </div>
            }
          </li>
        } @empty {
          <li class="text-muted-foreground">Este día no tiene ejercicios.</li>
        }
      </ul>

      @if (adding()) {
        <section class="rounded-lg border border-border p-4">
          <h2 class="mb-3 font-semibold">Agregar ejercicio</h2>
          <app-routine-exercise-form [exercises]="availableExercises()" submitLabel="Agregar"
            (saved)="add(d, $event)" (cancelled)="adding.set(false)" />
        </section>
      } @else {
        <button hlmBtn class="h-12 w-full" (click)="startAdding()">Agregar ejercicio</button>
      }
    } @else if (error()) {
      <p class="text-destructive">{{ error() }}</p>
    } @else {
      <p class="text-muted-foreground">Cargando…</p>
    }
  `,
})
export class RoutineDayPage implements OnInit {
  private readonly routinesApi = inject(RoutinesApi);
  private readonly exercisesApi = inject(ExercisesApi);

  readonly id = input.required<string>();
  readonly dayId = input.required<string>();

  protected readonly selectClass = SELECT_CLASS;
  protected readonly weekdays = WEEKDAYS;
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly formatTargets = formatTargets;
  protected readonly formatRest = formatRest;

  protected readonly day = signal<RoutineDay | null>(null);
  protected readonly exercises = signal<Exercise[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly editingId = signal<number | null>(null);
  protected readonly adding = signal(false);

  protected readonly availableExercises = computed(() => this.exercises());

  protected readonly dayForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    weekday: new FormControl<number | null>(null),
  });

  ngOnInit(): Promise<void> {
    return this.load();
  }

  private async load(): Promise<void> {
    try {
      const routine = await this.routinesApi.get(Number(this.id()));
      const day = routine.days?.find((d) => d.id === Number(this.dayId())) ?? null;
      if (!day) {
        this.error.set('No se encontró el día.');
        return;
      }
      this.day.set(day);
      this.dayForm.reset({ name: day.name, weekday: day.weekday });
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.error.set(null);
    try {
      await action();
      return true;
    } catch (e) {
      this.error.set(apiErrorMessage(e));
      return false;
    } finally {
      await this.load();
    }
  }

  saveDay(day: RoutineDay): Promise<boolean> {
    const { name, weekday } = this.dayForm.getRawValue();
    return this.run(() => this.routinesApi.updateDay(day.id, { name: name.trim(), weekday }));
  }

  async startAdding(): Promise<void> {
    if (this.exercises().length === 0) {
      try {
        this.exercises.set(await this.exercisesApi.list());
      } catch (e) {
        this.error.set(apiErrorMessage(e));
        return;
      }
    }
    this.adding.set(true);
  }

  async add(day: RoutineDay, input: RoutineDayExerciseInput): Promise<void> {
    if (await this.run(() => this.routinesApi.addExercise(day.id, input))) {
      this.adding.set(false);
    }
  }

  async update(item: RoutineDayExercise, input: RoutineDayExerciseInput): Promise<void> {
    const { exercise_id: _ignored, ...targets } = input;
    if (await this.run(() => this.routinesApi.updateExercise(item.id, targets))) {
      this.editingId.set(null);
    }
  }

  async remove(item: RoutineDayExercise): Promise<void> {
    if (!confirm(`¿Quitar "${item.exercise.name}" de este día?`)) return;
    await this.run(() => this.routinesApi.removeExercise(item.id));
  }

  async drop(event: CdkDragDrop<RoutineDayExercise[]>): Promise<void> {
    const day = this.day();
    if (!day?.exercises || event.previousIndex === event.currentIndex) return;
    const exercises = [...day.exercises];
    moveItemInArray(exercises, event.previousIndex, event.currentIndex);
    this.day.set({ ...day, exercises });
    await this.run(() => this.routinesApi.reorderExercises(day.id, exercises.map((e) => e.id)));
  }
}
```

- [ ] **Step 7: Rutas**

En `frontend/src/app/app.routes.ts`, reemplazar la ruta `rutinas` por:

```ts
{
  path: 'rutinas',
  title: 'Rutinas · GymTracker',
  children: [
    { path: '', loadComponent: () => import('./features/routines/routines-page').then((m) => m.RoutinesPage) },
    { path: ':id', loadComponent: () => import('./features/routines/routine-detail-page').then((m) => m.RoutineDetailPage) },
    { path: ':id/dias/:dayId', loadComponent: () => import('./features/routines/routine-day-page').then((m) => m.RoutineDayPage) },
  ],
},
```

- [ ] **Step 8: Correr y verificar**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build exitoso.

- [ ] **Step 9: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): add routines list, routine detail and day editor with drag and drop"
```

---

### Task 9: Pantalla "Hoy"

**Files:**
- Modify: `frontend/src/app/features/today/today-page.ts`
- Test: `frontend/src/app/features/today/today-page.spec.ts`

**Interfaces:**
- Consumes: `TodayApi`, `formatTargets`, `formatBestSet`, `formatDate`, `WEEKDAY_LABELS`, `SET_TYPE_LABELS`.
- Produces: vista `/hoy`.

- [ ] **Step 1: Escribir el test que falla**

`frontend/src/app/features/today/today-page.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { TodayApi } from '../../core/api/today-api';
import type { Today } from '../../core/models/routine';
import { TodayPage } from './today-page';

const bench = {
  id: 1, name: 'Press de banca', muscle_group: 'chest' as const, equipment: 'barbell' as const,
  is_unilateral: false, uses_bodyweight: false, notes: null, archived_at: null,
};

const today: Today = {
  date: '2026-11-02',
  weekday: 1,
  routine: { id: 1, name: 'Rutina 4 días' },
  day: {
    id: 10, routine_id: 1, name: 'Lunes – Pecho (Bilbo)', weekday: 1, position: 0,
    exercises: [{
      id: 100, routine_day_id: 10, exercise: bench, position: 0, target_sets: 1, target_reps_min: null,
      target_reps_max: null, target_text: '~30 reps explosivas, 40-45 kg', default_set_type: 'bilbo',
      rest_seconds: 180, notes: null,
      last_performance: {
        workout_id: 'w1', date: '2026-10-26',
        sets: [{ id: 's1', set_number: 1, set_type: 'bilbo', weight_kg: 42.5, reps: 30, side: 'both', rir: null, pain_level: null, notes: null }],
      },
    }],
  },
  days: [{ id: 10, name: 'Lunes – Pecho (Bilbo)', weekday: 1 }],
};

async function render(data: Today) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: TodayApi, useValue: { get: () => Promise.resolve(data) } }],
  });
  const fixture = TestBed.createComponent(TodayPage);
  await fixture.whenStable();
  return fixture.nativeElement.textContent as string;
}

describe('TodayPage', () => {
  it('shows the day, its targets and the last performance', async () => {
    const text = await render(today);
    expect(text).toContain('Lunes 02/11/2026');
    expect(text).toContain('Lunes – Pecho (Bilbo)');
    expect(text).toContain('Press de banca');
    expect(text).toContain('~30 reps explosivas, 40-45 kg');
    expect(text).toContain('Última vez: 42,5 kg × 30 · 26/10/2026');
  });

  it('shows a rest day with the available days', async () => {
    const text = await render({ ...today, weekday: 3, date: '2026-11-04', day: null });
    expect(text).toContain('Hoy es día de descanso');
    expect(text).toContain('Lunes – Pecho (Bilbo)');
  });

  it('invites to activate a routine when there is none', async () => {
    const text = await render({ ...today, routine: null, day: null, days: [] });
    expect(text).toContain('No tienes una rutina activa');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`frontend/src/app/features/today/today-page.ts` (reemplazar):

```ts
import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { TodayApi } from '../../core/api/today-api';
import { formatDate } from '../../core/format/format';
import { formatBestSet, formatTargets } from '../../core/format/training';
import { SET_TYPE_LABELS, WEEKDAY_LABELS } from '../../core/models/labels';
import type { TodayExercise } from '../../core/models/routine';

@Component({
  selector: 'app-today-page',
  imports: [RouterLink, HlmBadge, HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (today.value(); as t) {
      <p class="text-sm text-muted-foreground">{{ weekdayLabels[t.weekday] }} {{ formatDate(t.date) }}</p>

      @if (!t.routine) {
        <h1 class="mt-1 mb-4 text-2xl font-bold">No tienes una rutina activa</h1>
        <a hlmBtn routerLink="/rutinas" class="h-12 w-full">Ir a rutinas</a>
      } @else if (t.day; as day) {
        <h1 class="mt-1 mb-4 text-2xl font-bold">{{ day.name }}</h1>

        <ol class="mb-6 flex flex-col gap-3">
          @for (item of day.exercises; track item.id) {
            <li class="rounded-lg border border-border p-4">
              <div class="flex items-start justify-between gap-2">
                <span class="font-semibold">{{ item.exercise.name }}</span>
                @if (item.default_set_type !== 'normal') {
                  <span hlmBadge variant="secondary">{{ setTypeLabels[item.default_set_type] }}</span>
                }
              </div>
              <p class="text-sm text-muted-foreground">{{ formatTargets(item) }}</p>
              @if (item.target_text) { <p class="text-sm text-muted-foreground">{{ item.target_text }}</p> }
              <p class="mt-2 text-sm">{{ lastTime(item) }}</p>
            </li>
          } @empty {
            <li class="text-muted-foreground">Este día no tiene ejercicios todavía.</li>
          }
        </ol>

        <button hlmBtn class="h-14 w-full text-base" disabled>Empezar entrenamiento</button>
        <p class="mt-2 text-center text-xs text-muted-foreground">El registro de series llega en la fase 3.</p>
      } @else {
        <h1 class="mt-1 mb-2 text-2xl font-bold">Hoy es día de descanso</h1>
        <p class="mb-4 text-muted-foreground">Días de {{ t.routine.name }}:</p>
        <ul class="flex flex-col gap-2">
          @for (d of t.days; track d.id) {
            <li>
              <a [routerLink]="['/rutinas', t.routine.id, 'dias', d.id]" class="block rounded-lg border border-border p-4">
                <span class="font-medium">{{ d.name }}</span>
                @if (d.weekday) { <span class="block text-sm text-muted-foreground">{{ weekdayLabels[d.weekday] }}</span> }
              </a>
            </li>
          }
        </ul>
      }
    } @else if (today.error()) {
      <p class="text-destructive">No se pudo cargar el día de hoy.</p>
      <button hlmBtn variant="outline" class="mt-3 h-12 w-full" (click)="today.reload()">Reintentar</button>
    } @else {
      <p class="text-muted-foreground">Cargando…</p>
    }
  `,
})
export class TodayPage {
  private readonly api = inject(TodayApi);

  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly setTypeLabels = SET_TYPE_LABELS;
  protected readonly formatDate = formatDate;
  protected readonly formatTargets = formatTargets;

  protected readonly today = resource({ loader: () => this.api.get() });

  protected lastTime(item: TodayExercise): string {
    const last = item.last_performance;
    const best = last ? formatBestSet(last.sets, item.exercise.uses_bodyweight) : null;
    return last && best ? `Última vez: ${best} · ${formatDate(last.date)}` : 'Sin registros todavía';
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build exitoso.

- [ ] **Step 5: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): show today's routine day with last performance"
```

---

### Task 10: Verificación de punta a punta

**Files:**
- Modify: `CLAUDE.md` (sección "Comandos": nada nuevo salvo que haya cambiado algo)

- [ ] **Step 1: Suites completas**

Run: `(cd backend && ./vendor/bin/pest) && (cd frontend && npx ng test --watch=false && npx ng build)`
Expected: todo PASS.

- [ ] **Step 2: Datos frescos y API vía proxy**

```bash
docker compose restart backend
docker compose exec backend php artisan migrate:fresh --seed --force
```

Con el dev server corriendo (`cd frontend && npm start`), iniciar sesión con curl como en la fase 1 (cookie CSRF → `POST /auth/login`) y verificar:

```bash
curl -s -b $JAR -H "Accept: application/json" -H "Referer: http://localhost:4200/hoy" http://localhost:4200/api/today
curl -s -b $JAR -H "Accept: application/json" -H "Referer: http://localhost:4200/ejercicios" http://localhost:4200/api/exercises | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]))'
```

Expected: `today` trae la rutina "Rutina 4 días" y el día que corresponde a hoy (o `day: null` si hoy es miércoles, sábado o domingo); `exercises` devuelve `15`.

- [ ] **Step 3: Verificación manual (usuario, en el celular o vista móvil del navegador)**

1. "Hoy" muestra el día que toca o "Hoy es día de descanso" con la lista de días.
2. Ejercicios: buscar "jalon" encuentra "Jalón al pecho"; filtrar por Pecho; crear uno nuevo; editarlo; archivarlo y verlo en "Ver archivados"; restaurarlo; eliminar uno sin historial.
3. Rutinas: abrir "Rutina 4 días"; arrastrar un día para reordenar y recargar (se mantiene); duplicar un día; abrir un día, editar objetivos de un ejercicio, agregar uno y reordenar arrastrando.

- [ ] **Step 4: Commit (si hubo cambios)**

```bash
git add -A
git commit -m "chore: phase 2 verification"
```
