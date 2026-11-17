# FC y kcal desde Apple Salud (Atajo de iOS) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada sesión de GymTracker recibe FC promedio, FC máxima y kcal activas que un Atajo de iOS calcula desde Apple Salud.

**Architecture:** El Atajo usa un token Sanctum con habilidad `health:sync` para listar sesiones terminadas (48 h) y escribir sus datos de salud. Un middleware impide que ese token sirva en el resto de la API. El frontend gestiona el token en Mi cuenta, ofrece abrir el Atajo al terminar una sesión y muestra los datos en el detalle y el historial.

**Tech Stack:** Laravel 13 + Sanctum + Pest; Angular 22 (signals, zoneless) + Vitest.

Spec: `docs/superpowers/specs/2026-11-17-salud-atajo-design.md`.

## Global Constraints

- Código en inglés; textos de UI en español (Chile).
- FC válida 30–250; kcal 0–5000; los tres null no modifican nada.
- Listado: sesiones con `finished_at` en las últimas 48 h; fechas ISO 8601 con offset de `config('app.user_timezone')`.
- Token: nombre `health-shortcut`, habilidad `health:sync`, uno por usuario; prohibido para demo (403).
- Un token personal recibe 403 en toda ruta fuera de `/api/health-sync/*`.
- Nombre del Atajo: `GymTracker Salud`.
- Confirmaciones con `ConfirmService` (nunca `confirm()`); `localStorage` siempre con try/catch.

## Ajuste respecto al spec

`SyncService.enqueue` ya dispara `flush()` y expone `pending`/`online` como signals; en lugar de esperar el flush antes de navegar, la tarjeta de `/hoy` reacciona: con cola pendiente muestra "Enviando la sesión…" y habilita el botón cuando `pending() === 0`.

## Archivos

Backend
- Create `database/migrations/2026_11_17_000001_add_health_fields_to_workouts_table.php`
- Modify `app/Models/Workout.php`, `app/Http/Resources/WorkoutResource.php`, `app/Models/User.php`
- Create `app/Http/Middleware/RejectPersonalAccessTokens.php`; modify `bootstrap/app.php` (aliases `spa.only`, `abilities`)
- Create `app/Http/Controllers/HealthTokenController.php`, `app/Http/Controllers/HealthSyncController.php`, `app/Http/Requests/HealthSyncRequest.php`
- Modify `routes/api.php`
- Tests: `tests/Feature/Api/HealthTokenTest.php`, `tests/Feature/Api/HealthSyncTest.php`, `tests/Feature/Api/WorkoutsTest.php`

Frontend (`frontend/src/app/`)
- Modify `core/models/workout.ts`
- Create `core/health/health-format.ts` (+spec), `core/health/health-store.ts` (+spec), `core/health/shortcut.ts`, `core/api/health-api.ts`
- Create `features/account/health-shortcut-section.ts` (+spec); modify `features/account/account-menu.ts`
- Create `features/workout/health-summary.ts` (+spec); modify `features/workout/workout-page.ts`, `features/workout/workouts-page.ts`
- Create `features/today/health-prompt-card.ts` (+spec); modify `features/today/today-page.ts`

Docs
- Create `docs/atajo-salud.md`

---

### Task 1: Columnas de salud en `workouts`

**Files:** migración nueva, `Workout.php`, `WorkoutResource.php`, test en `WorkoutsTest.php`.

**Produces:** `Workout` con `avg_heart_rate`, `max_heart_rate`, `active_calories` (int|null) y `health_synced_at` (datetime|null); `WorkoutResource` los expone (`health_synced_at` en ISO).

- [ ] **Step 1: Test que falla** (al final de `tests/Feature/Api/WorkoutsTest.php`)

```php
it('exposes health data in the workout resource', function () {
    $workout = Workout::factory()->for($this->user)->create([
        'finished_at' => now(),
        'avg_heart_rate' => 128,
        'max_heart_rate' => 171,
        'active_calories' => 412,
        'health_synced_at' => '2026-11-17 23:00:00',
    ]);

    $this->getJson("/api/workouts/{$workout->id}")
        ->assertOk()
        ->assertJsonPath('data.avg_heart_rate', 128)
        ->assertJsonPath('data.max_heart_rate', 171)
        ->assertJsonPath('data.active_calories', 412)
        ->assertJsonPath('data.health_synced_at', '2026-11-17T23:00:00+00:00');
});
```

- [ ] **Step 2:** `./vendor/bin/pest --filter="exposes health data"` → FAIL (columna inexistente).

- [ ] **Step 3: Migración** `database/migrations/2026_11_17_000001_add_health_fields_to_workouts_table.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workouts', function (Blueprint $table) {
            $table->unsignedSmallInteger('avg_heart_rate')->nullable()->after('notes');
            $table->unsignedSmallInteger('max_heart_rate')->nullable()->after('avg_heart_rate');
            $table->unsignedSmallInteger('active_calories')->nullable()->after('max_heart_rate');
            $table->timestamp('health_synced_at')->nullable()->after('active_calories');
        });
    }

    public function down(): void
    {
        Schema::table('workouts', function (Blueprint $table) {
            $table->dropColumn(['avg_heart_rate', 'max_heart_rate', 'active_calories', 'health_synced_at']);
        });
    }
};
```

`Workout.php`: agregar a `$fillable` `'avg_heart_rate', 'max_heart_rate', 'active_calories', 'health_synced_at'` y a `casts()`:

```php
            'avg_heart_rate' => 'integer',
            'max_heart_rate' => 'integer',
            'active_calories' => 'integer',
            'health_synced_at' => 'datetime',
```

`WorkoutResource.php`, después de `'notes'`:

```php
            'avg_heart_rate' => $this->avg_heart_rate,
            'max_heart_rate' => $this->max_heart_rate,
            'active_calories' => $this->active_calories,
            'health_synced_at' => $this->health_synced_at?->toIso8601String(),
```

(`WorkoutRequest` no cambia: el upsert de la app no toca estos campos.)

- [ ] **Step 4:** `./vendor/bin/pest tests/Feature/Api/WorkoutsTest.php` → PASS.
- [ ] **Step 5:** `git commit -m "feat(health): heart rate and calories columns on workouts"`

### Task 2: Token del Atajo y aislamiento

**Files:** `User.php`, `RejectPersonalAccessTokens.php`, `bootstrap/app.php`, `HealthTokenController.php`, `routes/api.php`, `tests/Feature/Api/HealthTokenTest.php`.

**Produces:** `POST /api/health-token` → `201 {"data":{"token":"<plain>"}}`; `DELETE /api/health-token` → 204; alias `spa.only` (403 a tokens personales) en el grupo principal; alias `abilities` (Sanctum `CheckAbilities`).

- [ ] **Step 1: Tests que fallan** `tests/Feature/Api/HealthTokenTest.php`

```php
<?php

use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
});

it('creates a health token and replaces the previous one', function () {
    $this->actingAs($this->user);

    $first = $this->postJson('/api/health-token')->assertCreated()->json('data.token');
    $second = $this->postJson('/api/health-token')->assertCreated()->json('data.token');

    expect($first)->not->toBe($second)
        ->and($this->user->tokens()->count())->toBe(1)
        ->and($this->user->tokens()->sole()->name)->toBe('health-shortcut')
        ->and($this->user->tokens()->sole()->abilities)->toBe(['health:sync']);
});

it('revokes the health token', function () {
    $this->actingAs($this->user);
    $this->user->createToken('health-shortcut', ['health:sync']);

    $this->deleteJson('/api/health-token')->assertNoContent();

    expect($this->user->tokens()->count())->toBe(0);
});

it('forbids health tokens for demo accounts', function () {
    $demo = User::factory()->create(['demo_expires_at' => now()->addHour()]);

    $this->actingAs($demo)->postJson('/api/health-token')->assertForbidden();
});

it('rejects personal tokens outside health sync', function () {
    $token = $this->user->createToken('health-shortcut', ['health:sync'])->plainTextToken;

    $this->withToken($token)->getJson('/api/workouts')->assertForbidden();
    $this->withToken($token)->getJson('/api/user')->assertForbidden();
    $this->withToken($token)->postJson('/api/health-token')->assertForbidden();
});

it('keeps the SPA session working on the main routes', function () {
    $this->actingAs($this->user)->getJson('/api/workouts')->assertOk();
});
```

- [ ] **Step 2:** `./vendor/bin/pest tests/Feature/Api/HealthTokenTest.php` → FAIL (404 / sin `createToken`).

- [ ] **Step 3: Implementación**

`User.php`: `use Laravel\Sanctum\HasApiTokens;` y `use HasApiTokens, HasFactory, Notifiable;`.

`app/Http/Middleware/RejectPersonalAccessTokens.php`

```php
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/** Los tokens personales (Atajo de Salud) solo sirven en /api/health-sync; el resto es de la SPA. */
class RejectPersonalAccessTokens
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->currentAccessToken() instanceof PersonalAccessToken) {
            return response()->json(['message' => 'Este token solo sirve para sincronizar datos de salud.'], 403);
        }

        return $next($request);
    }
}
```

`bootstrap/app.php`:

```php
        $middleware->alias([
            'demo.active' => EnsureDemoActive::class,
            'spa.only' => RejectPersonalAccessTokens::class,
            'abilities' => CheckAbilities::class,
        ]);
```

con `use App\Http\Middleware\RejectPersonalAccessTokens;` y `use Laravel\Sanctum\Http\Middleware\CheckAbilities;`.

`app/Http/Controllers/HealthTokenController.php`

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Token del Atajo de iOS "GymTracker Salud": uno por usuario, solo para /api/health-sync. */
class HealthTokenController extends Controller
{
    public const NAME = 'health-shortcut';

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->isDemo(), 403, 'La demo no puede conectar Salud.');

        $user->tokens()->where('name', self::NAME)->delete();
        $token = $user->createToken(self::NAME, ['health:sync'])->plainTextToken;

        return response()->json(['data' => ['token' => $token]], 201);
    }

    public function destroy(Request $request): Response
    {
        $request->user()->tokens()->where('name', self::NAME)->delete();

        return response()->noContent();
    }
}
```

`routes/api.php`: el grupo principal pasa a `['auth:sanctum', 'demo.active', 'spa.only']` y dentro agregar:

```php
    Route::post('/health-token', [HealthTokenController::class, 'store']);
    Route::delete('/health-token', [HealthTokenController::class, 'destroy']);
```

- [ ] **Step 4:** `./vendor/bin/pest tests/Feature/Api/HealthTokenTest.php` → PASS; suite completa en verde.
- [ ] **Step 5:** `git commit -m "feat(health): personal token for the iOS shortcut, isolated from the SPA API"`

### Task 3: Endpoints de sincronización

**Files:** `HealthSyncRequest.php`, `HealthSyncController.php`, `routes/api.php`, `tests/Feature/Api/HealthSyncTest.php`.

**Produces:** `GET /api/health-sync/workouts` → `{data:[{id, started_at, finished_at}]}`; `PUT /api/health-sync/workouts/{workout}` → `WorkoutResource`.

- [ ] **Step 1: Tests que fallan** `tests/Feature/Api/HealthSyncTest.php`

```php
<?php

use App\Models\User;
use App\Models\Workout;
use Illuminate\Support\Carbon;

beforeEach(function () {
    Carbon::setTestNow('2026-11-17 23:00:00');
    $this->user = User::factory()->create();
    $this->token = $this->user->createToken('health-shortcut', ['health:sync'])->plainTextToken;
});

afterEach(fn () => Carbon::setTestNow());

it('lists finished workouts of the last 48 hours with local offsets', function () {
    $recent = Workout::factory()->for($this->user)->create([
        'started_at' => '2026-11-17 22:00:00', 'finished_at' => '2026-11-17 23:00:00',
    ]);
    Workout::factory()->for($this->user)->create(['started_at' => '2026-11-17 22:30:00', 'finished_at' => null]);
    Workout::factory()->for($this->user)->create([
        'started_at' => '2026-11-14 22:00:00', 'finished_at' => '2026-11-14 23:00:00',
    ]);
    Workout::factory()->create(['started_at' => '2026-11-17 21:00:00', 'finished_at' => '2026-11-17 22:00:00']);

    $this->withToken($this->token)->getJson('/api/health-sync/workouts')
        ->assertOk()
        ->assertExactJson(['data' => [[
            'id' => $recent->id,
            'started_at' => '2026-11-17T19:00:00-03:00',
            'finished_at' => '2026-11-17T20:00:00-03:00',
        ]]]);
});

it('stores health data, rounding decimals and accepting comma decimals', function () {
    $workout = Workout::factory()->for($this->user)->create(['finished_at' => now()]);

    $this->withToken($this->token)->putJson("/api/health-sync/workouts/{$workout->id}", [
        'avg_heart_rate' => '127,6',
        'max_heart_rate' => 171.2,
        'active_calories' => 412,
    ])->assertOk()->assertJsonPath('data.avg_heart_rate', 128);

    $workout->refresh();
    expect($workout->max_heart_rate)->toBe(171)
        ->and($workout->active_calories)->toBe(412)
        ->and($workout->health_synced_at->toDateTimeString())->toBe('2026-11-17 23:00:00');
});

it('overwrites previous values when sent again', function () {
    $workout = Workout::factory()->for($this->user)->create([
        'finished_at' => now(), 'avg_heart_rate' => 100, 'max_heart_rate' => 120, 'active_calories' => 50,
    ]);

    $this->withToken($this->token)->putJson("/api/health-sync/workouts/{$workout->id}", [
        'avg_heart_rate' => 130, 'max_heart_rate' => null, 'active_calories' => 400,
    ])->assertOk();

    $workout->refresh();
    expect($workout->avg_heart_rate)->toBe(130)
        ->and($workout->max_heart_rate)->toBeNull()
        ->and($workout->active_calories)->toBe(400);
});

it('does not erase data when every value is empty', function () {
    $workout = Workout::factory()->for($this->user)->create([
        'finished_at' => now(), 'avg_heart_rate' => 128, 'health_synced_at' => '2026-11-17 20:00:00',
    ]);

    $this->withToken($this->token)->putJson("/api/health-sync/workouts/{$workout->id}", [
        'avg_heart_rate' => '', 'max_heart_rate' => null, 'active_calories' => null,
    ])->assertOk();

    $workout->refresh();
    expect($workout->avg_heart_rate)->toBe(128)
        ->and($workout->health_synced_at->toDateTimeString())->toBe('2026-11-17 20:00:00');
});

it('validates ranges', function () {
    $workout = Workout::factory()->for($this->user)->create(['finished_at' => now()]);

    $this->withToken($this->token)->putJson("/api/health-sync/workouts/{$workout->id}", [
        'avg_heart_rate' => 20, 'max_heart_rate' => 300, 'active_calories' => 6000,
    ])->assertUnprocessable()->assertJsonValidationErrors(['avg_heart_rate', 'max_heart_rate', 'active_calories']);
});

it('cannot touch workouts of other users', function () {
    $other = Workout::factory()->create(['finished_at' => now()]);

    $this->withToken($this->token)->putJson("/api/health-sync/workouts/{$other->id}", ['avg_heart_rate' => 120])
        ->assertNotFound();
});

it('requires the health:sync ability', function () {
    $token = $this->user->createToken('other', ['something'])->plainTextToken;

    $this->withToken($token)->getJson('/api/health-sync/workouts')->assertForbidden();
});

it('rejects requests without a token', function () {
    $this->getJson('/api/health-sync/workouts')->assertUnauthorized();
});
```

- [ ] **Step 2:** `./vendor/bin/pest tests/Feature/Api/HealthSyncTest.php` → FAIL (404).

- [ ] **Step 3: Implementación**

`app/Http/Requests/HealthSyncRequest.php`

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Resumen que envía el Atajo; acepta decimales (con coma o punto) y los redondea. */
class HealthSyncRequest extends FormRequest
{
    public const FIELDS = ['avg_heart_rate', 'max_heart_rate', 'active_calories'];

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $normalized = [];
        foreach (self::FIELDS as $field) {
            $value = $this->input($field);
            if (is_string($value)) {
                $value = trim(str_replace(',', '.', $value));
            }
            if ($value === '' || $value === null) {
                $normalized[$field] = null;
            } elseif (is_numeric($value)) {
                $normalized[$field] = (int) round((float) $value);
            } else {
                $normalized[$field] = $value;
            }
        }
        $this->merge($normalized);
    }

    public function rules(): array
    {
        return [
            'avg_heart_rate' => ['nullable', 'integer', 'between:30,250'],
            'max_heart_rate' => ['nullable', 'integer', 'between:30,250'],
            'active_calories' => ['nullable', 'integer', 'between:0,5000'],
        ];
    }
}
```

`app/Http/Controllers/HealthSyncController.php`

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\HealthSyncRequest;
use App\Http\Resources\WorkoutResource;
use App\Models\Workout;
use Illuminate\Http\JsonResponse;

/** Endpoints del Atajo "GymTracker Salud" (token con habilidad health:sync). */
class HealthSyncController extends Controller
{
    public function index(): JsonResponse
    {
        $timezone = config('app.user_timezone');
        $workouts = Workout::query()
            ->whereNotNull('finished_at')
            ->where('finished_at', '>=', now()->subHours(48))
            ->orderBy('started_at')
            ->get(['id', 'started_at', 'finished_at']);

        return response()->json(['data' => $workouts->map(fn (Workout $workout) => [
            'id' => $workout->id,
            'started_at' => $workout->started_at->setTimezone($timezone)->toIso8601String(),
            'finished_at' => $workout->finished_at->setTimezone($timezone)->toIso8601String(),
        ])->all()]);
    }

    /** Sobrescribe; si los tres valores llegan vacíos no toca nada (corrida sin AirPods/Watch). */
    public function update(HealthSyncRequest $request, Workout $workout): WorkoutResource
    {
        $data = $request->only(HealthSyncRequest::FIELDS);
        if (array_filter($data, fn ($value) => $value !== null) !== []) {
            $workout->update($data + ['health_synced_at' => now()]);
        }

        return new WorkoutResource($workout);
    }
}
```

`routes/api.php`, fuera del grupo principal:

```php
Route::middleware(['auth:sanctum', 'demo.active', 'abilities:health:sync'])->group(function () {
    Route::get('/health-sync/workouts', [HealthSyncController::class, 'index']);
    Route::put('/health-sync/workouts/{workout}', [HealthSyncController::class, 'update']);
});
```

- [ ] **Step 4:** `./vendor/bin/pest` → PASS; `vendor/bin/pint --dirty --format agent`.
- [ ] **Step 5:** `git commit -m "feat(health): shortcut endpoints to list recent workouts and store health data"`

### Task 4: Frontend — modelo, API, store y sección en Mi cuenta

**Files:** `core/models/workout.ts`, `core/health/health-format.ts` (+spec), `core/health/health-store.ts` (+spec), `core/health/shortcut.ts`, `core/api/health-api.ts`, `features/account/health-shortcut-section.ts` (+spec), `features/account/account-menu.ts`.

**Produces:**
- `WorkoutSummary` + `avg_heart_rate`, `max_heart_rate`, `active_calories: number | null`, `health_synced_at: string | null`.
- `formatHealth(w: HealthFields): string | null` → `"♥ 128 ppm · 412 kcal"`.
- `HealthStore` (root): `configured: Signal<boolean>`, `setConfigured(v: boolean)`, `lastFinished: Signal<{id: string; date: string} | null>`, `rememberFinished(id, date)`, `forgetFinished()`.
- `SHORTCUT_NAME`, `RUN_SHORTCUT_URL`, `HEALTH_SHORTCUT_INSTALL_URL` (''), token `OPEN_URL: InjectionToken<(url: string) => void>`.
- `HealthApi`: `createToken(): Promise<string>`, `revokeToken(): Promise<void>`.


```ts
// core/health/health-format.ts
export interface HealthFields {
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  active_calories: number | null;
}

export function hasHealth(w: HealthFields): boolean {
  return w.avg_heart_rate !== null || w.max_heart_rate !== null || w.active_calories !== null;
}

/** Línea corta del historial: "♥ 128 ppm · 412 kcal". */
export function formatHealth(w: HealthFields): string | null {
  const parts: string[] = [];
  if (w.avg_heart_rate !== null) parts.push(`♥ ${w.avg_heart_rate} ppm`);
  if (w.active_calories !== null) parts.push(`${w.active_calories} kcal`);
  return parts.length ? parts.join(' · ') : null;
}
```

```ts
// core/health/shortcut.ts
import { InjectionToken } from '@angular/core';

export const SHORTCUT_NAME = 'GymTracker Salud';
export const RUN_SHORTCUT_URL = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
/** Enlace iCloud del Atajo compartido; vacío oculta "Instalar Atajo". */
export const HEALTH_SHORTCUT_INSTALL_URL = '';

export const OPEN_URL = new InjectionToken<(url: string) => void>('OPEN_URL', {
  providedIn: 'root',
  factory: () => (url: string) => window.location.assign(url),
});
```

```ts
// core/health/health-store.ts
import { Injectable, signal } from '@angular/core';

const CONFIGURED_KEY = 'gt.health.configured';
const LAST_KEY = 'gt.health.last';

export interface FinishedRef {
  id: string;
  date: string;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* almacenamiento bloqueado: se pierde la preferencia, nada más */
  }
}

function parseLast(raw: string | null): FinishedRef | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<FinishedRef>;
    return typeof value.id === 'string' && typeof value.date === 'string' ? { id: value.id, date: value.date } : null;
  } catch {
    return null;
  }
}

/** Preferencias del Atajo de Salud en este dispositivo. */
@Injectable({ providedIn: 'root' })
export class HealthStore {
  readonly configured = signal(read(CONFIGURED_KEY) === '1');
  readonly lastFinished = signal<FinishedRef | null>(parseLast(read(LAST_KEY)));

  setConfigured(value: boolean): void {
    write(CONFIGURED_KEY, value ? '1' : null);
    this.configured.set(value);
  }

  rememberFinished(id: string, date: string): void {
    const ref = { id, date };
    write(LAST_KEY, JSON.stringify(ref));
    this.lastFinished.set(ref);
  }

  forgetFinished(): void {
    write(LAST_KEY, null);
    this.lastFinished.set(null);
  }
}
```

```ts
// core/api/health-api.ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HealthApi {
  private readonly http = inject(HttpClient);

  async createToken(): Promise<string> {
    return (await firstValueFrom(this.http.post<{ data: { token: string } }>('/api/health-token', {}))).data.token;
  }

  async revokeToken(): Promise<void> {
    await firstValueFrom(this.http.delete('/api/health-token'));
  }
}
```

`HealthShortcutSection` (`app-health-shortcut-section`): título "Atajo de Salud", texto "Envía la FC y las kcal de Salud (AirPods o Watch) a tus sesiones.", botón "Generar token" (o "Generar otro token" si `configured`). Al generar: muestra el token en `<code>` con "Copiar" y, si `HEALTH_SHORTCUT_INSTALL_URL`, "Instalar Atajo" (copia y abre el enlace con `OPEN_URL`); llama `store.setConfigured(true)`. "Desconectar" (si `configured`) pide confirmación con `ConfirmService`, revoca y `setConfigured(false)`. Errores → "No se pudo … Revisa tu conexión.". Se monta en `AccountMenu` dentro del bloque `@if (!isDemo())`, separado con `<div class="my-4 border-t border-border"></div>`.

Specs: `health-format.spec.ts` (línea completa, solo kcal, null), `health-store.spec.ts` (persistencia y lectura inicial), `health-shortcut-section.spec.ts` (generar muestra token y marca configurado; copiar; desconectar confirma y revoca; error).

- [ ] Steps: tests que fallan → implementación → `npx ng test --watch=false` → commit `feat(health): health shortcut token in Mi cuenta`.

### Task 5: Frontend — datos en el detalle y el historial

**Files:** `features/workout/health-summary.ts` (+spec), `features/workout/workout-page.ts`, `features/workout/workouts-page.ts`.

**Consumes:** `WorkoutsApi.get`, `hasHealth`, `formatHealth`.

`HealthSummary` (`app-health-summary`, input `workoutId`): al iniciar y en `document:visibilitychange` visible pide `WorkoutsApi.get(id)` (errores se ignoran) y guarda los tres valores; si `hasHealth` muestra una tarjeta "Salud" con tres cifras: "FC prom." `128 ppm`, "FC máx." `171 ppm`, "kcal" `412` (solo las que existan). En `WorkoutPage`, se muestra cuando `!isActive()` antes de la lista de ejercicios. En `WorkoutsPage`, bajo la línea de ejercicios/series: `@if (formatHealth(w); as h) { <p class="num text-sm text-primary">{{ h }}</p> }`.

Spec: muestra datos; no muestra nada sin datos; recarga al volver visible.

- [ ] Steps: test → implementación → tests → commit `feat(health): show heart rate and calories on finished sessions`.

### Task 6: Frontend — tarjeta en /hoy tras terminar

**Files:** `features/today/health-prompt-card.ts` (+spec), `features/today/today-page.ts`, `features/workout/workout-page.ts`.

**Consumes:** `HealthStore`, `SyncService.pending/online`, `WorkoutsApi.get`, `RUN_SHORTCUT_URL`, `OPEN_URL`.

- `WorkoutPage.finish`: antes de `sessions.finish`, guardar `id` y `date`; después, `health.rememberFinished(id, date)`.
- `HealthPromptCard` (input `today: string`): visible si `store.configured()`, `store.lastFinished()?.date === today()`. Al iniciar y al volver visible (con cola vacía) consulta la sesión; si tiene `health_synced_at`, `forgetFinished()` (la tarjeta desaparece). Estados: `!sync.online()` → "Sin conexión: se completará con la sincronización nocturna." y botón deshabilitado; `sync.pending() > 0` → "Enviando la sesión…" y botón deshabilitado; si no, botón "Traer FC y kcal de Salud" que llama `openUrl(RUN_SHORTCUT_URL)`. Enlace "Ahora no" → `forgetFinished()`.
- `TodayPage`: `<app-health-prompt-card [today]="t.date" />` justo después del header.

Spec: oculta si no está configurado; oculta si la sesión es de otro día; botón abre el Atajo; sin conexión deshabilita; "Ahora no" la oculta; desaparece si el servidor ya tiene datos.

- [ ] Steps: test → implementación → tests → commit `feat(health): prompt to run the shortcut after finishing a workout`.

### Task 7: Guía del Atajo y prueba E2E local

**Files:** `docs/atajo-salud.md`.

- Guía paso a paso (acciones de la sección "El Atajo" del spec, con los nombres en español de iOS, pregunta de importación del token, automatización 23:00, cómo compartir el enlace iCloud).
- E2E local con curl: login SPA → `POST /api/health-token` → con el token `GET /api/health-sync/workouts` → `PUT` → `GET /api/workouts/{id}` con sesión muestra los datos; con el token `GET /api/workouts` → 403.
- Commit `docs(health): guide to build the GymTracker Salud shortcut`.
