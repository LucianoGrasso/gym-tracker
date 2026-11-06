# Invitaciones y cuenta — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cualquier usuario invite a otros con un link de un solo uso (válido 7 días, máximo 5 pendientes). Quien recibe el link se registra y entra directo, con los ejercicios base y sin rutina. Se agrega la pantalla Cuenta (invitar, anular y cerrar sesión) y la auto-pausa de Aurora baja a 5 minutos.

**Architecture:**
- **Backend:** tabla `invitations` con el token guardado como SHA-256. Hay endpoints autenticados para listar, crear y anular invitaciones, y endpoints públicos con límite de intentos para la vista previa y el registro (este último inicia sesión). La lógica vive en los servicios `CreateInvitation` y `AcceptInvitation`.
- **Frontend:** pantallas lazy `/cuenta` y `/registro/:token`. "Hoy" enlaza a la cuenta y, si el usuario no tiene rutina, lo manda a elegir una plantilla.

**Tech Stack:** Laravel 13 + Pest; Angular 22 (standalone, signals, OnPush, zoneless) + Vitest; CDK (infra) + Vitest.

Spec: `docs/superpowers/specs/2026-11-06-invitaciones-design.md`.

**Desvíos de la spec:**
- `GET /api/invitations` y `POST` también devuelven `expires_on`: la fecha de vencimiento en `America/Santiago`, en formato `aaaa-mm-dd`, para `formatDate`.
- `RegisterRequest` define mensajes en español, porque el proyecto no tiene `lang/es` y Laravel respondería en inglés.

## Global Constraints

- Código, tablas y variables en inglés; textos de UI en español (Chile). Fechas `dd/mm/aaaa`, zona `America/Santiago`.
- Modelos de usuario usan `BelongsToUser`; toda consulta autenticada queda restringida al usuario.
- Validación en Form Requests; lógica en `app/Services`, no en controladores.
- Laravel apto para Lambda (sin archivos en disco).
- Token de invitación: 40 caracteres aleatorios; en la BD solo `hash('sha256', $token)`.
- Link de un solo uso, vence a los 7 días; máximo 5 pendientes por usuario.
- El usuario invitado parte con los 15 ejercicios base y **sin** rutina.
- TDD por tarea, un commit por tarea en la rama `invitaciones`. Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `cd backend && ./vendor/bin/pest` · `cd frontend && npx ng test --watch=false` · `cd infra && npm test`.
- Lección del proyecto: en los tests de Pest, tras `actingAs`, el global scope filtra las consultas por usuario. Para contar filas de otro usuario, usar `withoutGlobalScopes()`.
- Lección del proyecto: en Angular 22, `resource.value()` lanza una excepción si el recurso está en error. Usar `hasValue()` o revisar `error()` primero.
- Los `async` propios de un componente (por ejemplo `ngOnInit` o los clics) no los espera `fixture.whenStable()` en zoneless. En los tests se usa el helper `settle()`, que hace `setTimeout` + `whenStable` + `detectChanges`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `backend/database/migrations/2026_11_06_000001_create_invitations_table.php` | Tabla `invitations` |
| `backend/app/Models/Invitation.php` + `backend/database/factories/InvitationFactory.php` | Modelo (`pending`, `isUsable`, `findByToken`) y factory (`expired`, `accepted`, `withToken`) |
| `backend/app/Services/Invitations/CreateInvitation.php` | Crea la invitación respetando el tope |
| `backend/app/Services/Invitations/AcceptInvitation.php` | Consume el link y crea el usuario con los ejercicios base |
| `backend/app/Http/Resources/InvitationResource.php` | `{id, expires_at, expires_on}` |
| `backend/app/Http/Controllers/InvitationController.php` | `index`, `store`, `destroy` |
| `backend/app/Http/Controllers/Auth/InvitationPreviewController.php` | Vista previa pública |
| `backend/app/Http/Controllers/Auth/RegisteredUserController.php` | Registro con inicio de sesión |
| `backend/app/Http/Requests/Auth/RegisterRequest.php` | Validación del registro con mensajes en español |
| `backend/database/seeders/GymTrackerSeeder.php` | `seedExercises(User)` público |
| `backend/routes/api.php`, `backend/routes/web.php` | Rutas |
| `backend/tests/Feature/Api/InvitationsTest.php`, `backend/tests/Feature/Auth/RegistrationTest.php` | Tests |
| `infra/lib/database.ts`, `infra/test/database.test.ts` | Auto-pausa de 5 min |
| `frontend/src/app/core/models/invitation.ts` | Tipos y `MAX_PENDING_INVITATIONS` |
| `frontend/src/app/core/api/invitations-api.ts` (+ spec) | Cliente HTTP |
| `frontend/src/app/core/auth/auth.service.ts` (+ spec) | `register()` |
| `frontend/src/app/features/account/account-page.ts` (+ spec) | Pantalla Cuenta |
| `frontend/src/app/features/auth/register-page.ts` (+ spec) | Pantalla de registro |
| `frontend/src/app/features/today/today-page.ts` (+ spec) | Enlace a la cuenta y estado sin rutina |
| `frontend/src/app/app.routes.ts` | Rutas `cuenta` y `registro/:token` |

---

### Task 1: Invitaciones en el backend (crear, listar, anular)

**Files:**
- Create: `backend/database/migrations/2026_11_06_000001_create_invitations_table.php`, `backend/app/Models/Invitation.php`, `backend/database/factories/InvitationFactory.php`, `backend/app/Services/Invitations/CreateInvitation.php`, `backend/app/Http/Resources/InvitationResource.php`, `backend/app/Http/Controllers/InvitationController.php`
- Modify: `backend/routes/api.php`, `backend/database/seeders/GymTrackerSeeder.php`
- Test: `backend/tests/Feature/Api/InvitationsTest.php`

**Interfaces:**
- Produces:
  - `Invitation` (`user_id`, `token_hash`, `expires_at`, `accepted_at`, `accepted_user_id`); `Invitation::TTL_DAYS = 7`, `Invitation::MAX_PENDING = 5`; scope `pending()`; `isUsable(): bool`; `Invitation::findByToken(string): ?Invitation`; relación `user()` (quien invita, del trait)
  - `InvitationFactory`: estados `expired()`, `accepted()`, `withToken(string $token)`
  - `CreateInvitation::handle(User $inviter): array{invitation: Invitation, token: string}`
  - `GymTrackerSeeder::seedExercises(User $user): Collection<string, Exercise>`
  - `GET /api/invitations`, `POST /api/invitations` (201 `{data: {id, expires_at, expires_on, token}}`), `DELETE /api/invitations/{invitation}`

- [ ] **Step 1: Write the failing tests** — `backend/tests/Feature/Api/InvitationsTest.php`

```php
<?php

use App\Models\Invitation;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
});

it('requires authentication', function () {
    $this->getJson('/api/invitations')->assertUnauthorized();
    $this->postJson('/api/invitations')->assertUnauthorized();
});

it('creates a one-week invitation and stores only the token hash', function () {
    $this->freezeSecond();

    $response = $this->actingAs($this->user)->postJson('/api/invitations')
        ->assertCreated()
        ->assertJsonStructure(['data' => ['id', 'expires_at', 'expires_on', 'token']]);

    $token = $response->json('data.token');
    $invitation = Invitation::withoutGlobalScopes()->sole();

    expect($token)->toHaveLength(40)
        ->and($invitation->token_hash)->toBe(hash('sha256', $token))
        ->and($invitation->user_id)->toBe($this->user->id)
        ->and($invitation->expires_at->equalTo(now()->addDays(7)))->toBeTrue()
        ->and(json_encode($invitation->getAttributes()))->not->toContain($token);
});

it('lists only the user pending invitations, newest first', function () {
    $old = Invitation::factory()->for($this->user)->create();
    $new = Invitation::factory()->for($this->user)->create();
    Invitation::factory()->for($this->user)->expired()->create();
    Invitation::factory()->for($this->user)->accepted()->create();
    Invitation::factory()->create();

    $this->actingAs($this->user)->getJson('/api/invitations')
        ->assertOk()
        ->assertJsonPath('data.*.id', [$new->id, $old->id])
        ->assertJsonMissingPath('data.0.token');
});

it('allows at most five pending invitations', function () {
    Invitation::factory()->count(5)->for($this->user)->create();
    Invitation::factory()->for($this->user)->expired()->create();

    $this->actingAs($this->user)->postJson('/api/invitations')
        ->assertStatus(422)
        ->assertJsonPath('errors.invitation.0', 'Tienes 5 invitaciones pendientes. Anula una para crear otra.');
});

it('revokes only own invitations', function () {
    $mine = Invitation::factory()->for($this->user)->create();
    $other = Invitation::factory()->create();

    $this->actingAs($this->user);
    $this->deleteJson("/api/invitations/{$other->id}")->assertNotFound();
    $this->deleteJson("/api/invitations/{$mine->id}")->assertNoContent();

    expect(Invitation::withoutGlobalScopes()->pluck('id')->all())->toBe([$other->id]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/InvitationsTest.php`
Expected: FAIL con `Class "App\Models\Invitation" not found`.

- [ ] **Step 3: Migration** — `backend/database/migrations/2026_11_06_000001_create_invitations_table.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('token_hash', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->foreignId('accepted_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invitations');
    }
};
```

- [ ] **Step 4: Model and factory**

`backend/app/Models/Invitation.php`:

```php
<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/** Link de invitación de un solo uso. `user_id` es quien invita; el token solo existe hasheado. */
class Invitation extends Model
{
    use BelongsToUser, HasFactory;

    public const TTL_DAYS = 7;

    public const MAX_PENDING = 5;

    protected $fillable = ['user_id', 'token_hash', 'expires_at', 'accepted_at', 'accepted_user_id'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'accepted_at' => 'datetime'];
    }

    public function scopePending(Builder $query): void
    {
        $query->whereNull('accepted_at')->where('expires_at', '>', now());
    }

    public function isUsable(): bool
    {
        return $this->accepted_at === null && $this->expires_at->isFuture();
    }

    /** Busca por el token en claro (sin el scope de usuario: el link lo abre alguien sin sesión). */
    public static function findByToken(string $token): ?self
    {
        return static::withoutGlobalScopes()->where('token_hash', hash('sha256', $token))->first();
    }
}
```

`backend/database/factories/InvitationFactory.php`:

```php
<?php

namespace Database\Factories;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Invitation> */
class InvitationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'token_hash' => hash('sha256', Str::random(40)),
            'expires_at' => now()->addDays(Invitation::TTL_DAYS),
        ];
    }

    public function expired(): static
    {
        return $this->state(['expires_at' => now()->subMinute()]);
    }

    public function accepted(): static
    {
        return $this->state(['accepted_at' => now()]);
    }

    /** Para probar el link con un token conocido. */
    public function withToken(string $token): static
    {
        return $this->state(['token_hash' => hash('sha256', $token)]);
    }
}
```

- [ ] **Step 5: Service, resource and controller**

`backend/app/Services/Invitations/CreateInvitation.php`:

```php
<?php

namespace App\Services\Invitations;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CreateInvitation
{
    /** @return array{invitation: Invitation, token: string} el token en claro solo existe aquí */
    public function handle(User $inviter): array
    {
        $pending = Invitation::withoutGlobalScopes()->where('user_id', $inviter->id)->pending()->count();
        if ($pending >= Invitation::MAX_PENDING) {
            throw ValidationException::withMessages([
                'invitation' => 'Tienes 5 invitaciones pendientes. Anula una para crear otra.',
            ]);
        }

        $token = Str::random(40);
        $invitation = Invitation::create([
            'user_id' => $inviter->id,
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addDays(Invitation::TTL_DAYS),
        ]);

        return ['invitation' => $invitation, 'token' => $token];
    }
}
```

`backend/app/Http/Resources/InvitationResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InvitationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'expires_at' => $this->expires_at->toIso8601String(),
            'expires_on' => $this->expires_at->timezone('America/Santiago')->toDateString(),
        ];
    }
}
```

`backend/app/Http/Controllers/InvitationController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Resources\InvitationResource;
use App\Models\Invitation;
use App\Services\Invitations\CreateInvitation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class InvitationController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return InvitationResource::collection(Invitation::query()->pending()->latest('id')->get());
    }

    public function store(Request $request, CreateInvitation $create): JsonResponse
    {
        ['invitation' => $invitation, 'token' => $token] = $create->handle($request->user());

        return response()->json([
            'data' => (new InvitationResource($invitation))->resolve($request) + ['token' => $token],
        ], 201);
    }

    /** El global scope de BelongsToUser hace que una invitación ajena dé 404. */
    public function destroy(Invitation $invitation): Response
    {
        $invitation->delete();

        return response()->noContent();
    }
}
```

- [ ] **Step 6: Routes and seeder** — `backend/routes/api.php`

Agregar `use App\Http\Controllers\InvitationController;` y, dentro del grupo `auth:sanctum`, después de `Route::get('/user', ...)`:

```php
    Route::get('/invitations', [InvitationController::class, 'index']);
    Route::post('/invitations', [InvitationController::class, 'store']);
    Route::delete('/invitations/{invitation}', [InvitationController::class, 'destroy']);
```

En `backend/database/seeders/GymTrackerSeeder.php`, extraer la creación de ejercicios a un método público y usarlo en `run()`. Reemplazar el bloque `$exercises = collect(self::EXERCISES)->mapWithKeys(...);` de `run()` por `$exercises = $this->seedExercises($user);` y agregar:

```php
    /**
     * Crea los 15 ejercicios iniciales del usuario (sin rutina). Lo usan run() y el registro por invitación.
     *
     * @return Collection<string, Exercise>
     */
    public function seedExercises(User $user): Collection
    {
        return collect(self::EXERCISES)->mapWithKeys(
            fn (string $name) => [$name => Exercise::create(['user_id' => $user->id, 'name' => $name] + ExerciseCatalog::get($name))]
        );
    }
```

con `use Illuminate\Support\Collection;`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pint && ./vendor/bin/pest tests/Feature/Api/InvitationsTest.php tests/Feature/Seeders tests/Feature/Console`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/database/migrations/2026_11_06_000001_create_invitations_table.php backend/app/Models/Invitation.php backend/database/factories/InvitationFactory.php backend/app/Services/Invitations/CreateInvitation.php backend/app/Http/Resources/InvitationResource.php backend/app/Http/Controllers/InvitationController.php backend/routes/api.php backend/database/seeders/GymTrackerSeeder.php backend/tests/Feature/Api/InvitationsTest.php
git commit -m "feat(invitations): let users create, list and revoke invitation links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Vista previa del link y registro con invitación

**Files:**
- Create: `backend/app/Services/Invitations/AcceptInvitation.php`, `backend/app/Http/Requests/Auth/RegisterRequest.php`, `backend/app/Http/Controllers/Auth/InvitationPreviewController.php`, `backend/app/Http/Controllers/Auth/RegisteredUserController.php`
- Modify: `backend/routes/web.php`
- Test: `backend/tests/Feature/Auth/RegistrationTest.php`

**Interfaces:**
- Consumes: `Invitation::findByToken`, `isUsable`, `InvitationFactory::withToken/expired/accepted`, `GymTrackerSeeder::seedExercises` (Task 1)
- Produces:
  - `GET /auth/invitations/{token}` → 200 `{data: {inviter_name, expires_at}}` · 404 · 410
  - `POST /auth/register` `{token, name, email, password, password_confirmation}` → 201 `{data: User}` con sesión · 422 · 410
  - `AcceptInvitation::handle(string $token, array $data): User`

- [ ] **Step 1: Write the failing tests** — `backend/tests/Feature/Auth/RegistrationTest.php`

```php
<?php

use App\Models\Exercise;
use App\Models\Invitation;
use App\Models\Routine;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

beforeEach(function () {
    $this->inviter = User::factory()->create(['name' => 'Luciano']);
});

function registration(array $overrides = []): array
{
    return [
        'token' => 'good-token',
        'name' => 'Pedro',
        'email' => 'pedro@example.com',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
        ...$overrides,
    ];
}

it('previews a valid invitation with the inviter name', function () {
    Invitation::factory()->for($this->inviter)->withToken('good-token')->create();

    $this->getJson('/auth/invitations/good-token')
        ->assertOk()
        ->assertJsonPath('data.inviter_name', 'Luciano');
});

it('rejects unknown, expired and used links', function () {
    Invitation::factory()->for($this->inviter)->withToken('expired-token')->expired()->create();
    Invitation::factory()->for($this->inviter)->withToken('used-token')->accepted()->create();

    $this->getJson('/auth/invitations/nope')->assertNotFound();
    $this->getJson('/auth/invitations/expired-token')->assertStatus(410);
    $this->getJson('/auth/invitations/used-token')->assertStatus(410);
});

it('registers, logs in and seeds only the base exercises', function () {
    $invitation = Invitation::factory()->for($this->inviter)->withToken('good-token')->create();

    $this->postJson('/auth/register', registration())
        ->assertCreated()
        ->assertJsonPath('data.email', 'pedro@example.com')
        ->assertJsonMissingPath('data.password');

    $pedro = User::where('email', 'pedro@example.com')->sole();
    $this->assertAuthenticatedAs($pedro);
    expect(Hash::check('secret123', $pedro->password))->toBeTrue()
        ->and(Exercise::withoutGlobalScopes()->where('user_id', $pedro->id)->count())->toBe(15)
        ->and(Routine::withoutGlobalScopes()->where('user_id', $pedro->id)->count())->toBe(0);

    $invitation->refresh();
    expect($invitation->accepted_at)->not->toBeNull()
        ->and($invitation->accepted_user_id)->toBe($pedro->id);
});

it('validates the form in spanish without consuming the invitation', function () {
    $invitation = Invitation::factory()->for($this->inviter)->withToken('good-token')->create();
    User::factory()->create(['email' => 'taken@example.com']);

    $this->postJson('/auth/register', registration(['email' => 'taken@example.com', 'password_confirmation' => 'otra-cosa']))
        ->assertStatus(422)
        ->assertJsonPath('errors.email.0', 'Este correo ya tiene una cuenta.')
        ->assertJsonPath('errors.password.0', 'Las contraseñas no coinciden.');

    expect($invitation->fresh()->accepted_at)->toBeNull();
    $this->assertGuest();
});

it('refuses expired, used or unknown invitations without creating the user', function () {
    Invitation::factory()->for($this->inviter)->withToken('expired-token')->expired()->create();
    Invitation::factory()->for($this->inviter)->withToken('used-token')->accepted()->create();

    foreach (['expired-token', 'used-token', 'nope'] as $token) {
        $this->postJson('/auth/register', registration(['token' => $token, 'email' => "{$token}@example.com"]))
            ->assertStatus(410)
            ->assertJsonPath('message', 'Este link de invitación ya no es válido.');
    }

    expect(User::count())->toBe(1);
    $this->assertGuest();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Auth/RegistrationTest.php`
Expected: FAIL, 404/405 en `/auth/invitations/...` y `/auth/register`.

- [ ] **Step 3: Service** — `backend/app/Services/Invitations/AcceptInvitation.php`

```php
<?php

namespace App\Services\Invitations;

use App\Models\Invitation;
use App\Models\User;
use Database\Seeders\GymTrackerSeeder;
use Illuminate\Support\Facades\DB;

class AcceptInvitation
{
    public function __construct(private readonly GymTrackerSeeder $seeder) {}

    /** @param array{name: string, email: string, password: string} $data */
    public function handle(string $token, array $data): User
    {
        return DB::transaction(function () use ($token, $data) {
            // lockForUpdate: dos registros simultáneos con el mismo link no pueden usarlo ambos.
            $invitation = Invitation::withoutGlobalScopes()
                ->where('token_hash', hash('sha256', $token))
                ->lockForUpdate()
                ->first();
            abort_if($invitation === null || ! $invitation->isUsable(), 410, 'Este link de invitación ya no es válido.');

            $user = User::create($data); // el cast 'hashed' hashea la contraseña
            $this->seeder->seedExercises($user);
            $invitation->update(['accepted_at' => now(), 'accepted_user_id' => $user->id]);

            return $user;
        });
    }
}
```

- [ ] **Step 4: Request and controllers**

`backend/app/Http/Requests/Auth/RegisterRequest.php`:

```php
<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'token' => ['required', 'string'],
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ];
    }

    /** El proyecto no tiene lang/es: los mensajes que ve el usuario van aquí. */
    public function messages(): array
    {
        return [
            'name.required' => 'Ingresa tu nombre.',
            'name.max' => 'El nombre puede tener hasta 100 caracteres.',
            'email.required' => 'Ingresa tu correo.',
            'email.email' => 'Ingresa un correo válido.',
            'email.unique' => 'Este correo ya tiene una cuenta.',
            'password.required' => 'Ingresa una contraseña.',
            'password.min' => 'La contraseña debe tener al menos 8 caracteres.',
            'password.confirmed' => 'Las contraseñas no coinciden.',
        ];
    }
}
```

`backend/app/Http/Controllers/Auth/InvitationPreviewController.php`:

```php
<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Invitation;
use Illuminate\Http\JsonResponse;

class InvitationPreviewController extends Controller
{
    public function __invoke(string $token): JsonResponse
    {
        $invitation = Invitation::findByToken($token);
        abort_if($invitation === null, 404, 'Este link de invitación ya no es válido.');
        abort_unless($invitation->isUsable(), 410, 'Este link de invitación ya no es válido.');

        return response()->json(['data' => [
            'inviter_name' => $invitation->user->name,
            'expires_at' => $invitation->expires_at->toIso8601String(),
        ]]);
    }
}
```

`backend/app/Http/Controllers/Auth/RegisteredUserController.php`:

```php
<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Services\Invitations\AcceptInvitation;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class RegisteredUserController extends Controller
{
    public function store(RegisterRequest $request, AcceptInvitation $accept): JsonResponse
    {
        $user = $accept->handle($request->validated('token'), $request->safe()->only(['name', 'email', 'password']));

        Auth::guard('web')->login($user, remember: true);
        $request->session()->regenerate();

        return (new UserResource($user))->response()->setStatusCode(201);
    }
}
```

- [ ] **Step 5: Routes** — `backend/routes/web.php`

Agregar los `use` de `InvitationPreviewController` y `RegisteredUserController` y, dentro de `Route::prefix('auth')->group(...)`:

```php
    Route::get('/invitations/{token}', InvitationPreviewController::class)->middleware('throttle:30,1');
    Route::post('/register', [RegisteredUserController::class, 'store'])->middleware('throttle:6,1');
```

`/auth/*` ya pasa por CloudFront hacia la Lambda, así que no hay cambios de infraestructura.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pint && ./vendor/bin/pest`
Expected: suite completa en verde.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Services/Invitations/AcceptInvitation.php backend/app/Http/Requests/Auth/RegisterRequest.php backend/app/Http/Controllers/Auth/InvitationPreviewController.php backend/app/Http/Controllers/Auth/RegisteredUserController.php backend/routes/web.php backend/tests/Feature/Auth/RegistrationTest.php
git commit -m "feat(invitations): preview invitation links and register with them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Auto-pausa de Aurora a 5 minutos

**Files:**
- Modify: `infra/lib/database.ts:41`, `infra/test/database.test.ts:29`

- [ ] **Step 1: Update the test first** — en `infra/test/database.test.ts`, cambiar `SecondsUntilAutoPause: 600` por `SecondsUntilAutoPause: 300`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd infra && npm test -- database`
Expected: FAIL (esperado 300, recibido 600).

- [ ] **Step 3: Implement** — en `infra/lib/database.ts`, cambiar `serverlessV2AutoPauseDuration: Duration.minutes(10),` por:

```ts
      // 5 min es el mínimo de AWS: con más usuarios, menos horas despierta = menos costo.
      serverlessV2AutoPauseDuration: Duration.minutes(5),
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd infra && npm test`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/database.ts infra/test/database.test.ts
git commit -m "chore(infra): pause Aurora after 5 idle minutes instead of 10

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cliente de invitaciones y `AuthService.register`

**Files:**
- Create: `frontend/src/app/core/models/invitation.ts`, `frontend/src/app/core/api/invitations-api.ts`, `frontend/src/app/core/api/invitations-api.spec.ts`
- Modify: `frontend/src/app/core/auth/auth.service.ts`, `frontend/src/app/core/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: endpoints de las Tasks 1 y 2
- Produces:
  - `Invitation {id, expires_at, expires_on}`, `CreatedInvitation extends Invitation {token}`, `InvitationPreview {inviter_name, expires_at}`, `MAX_PENDING_INVITATIONS = 5`
  - `InvitationsApi.list(): Promise<Invitation[]>`, `create(): Promise<CreatedInvitation>`, `revoke(id: number): Promise<void>`, `preview(token: string): Promise<InvitationPreview>`
  - `RegisterInput {token, name, email, password, password_confirmation}`; `AuthService.register(input): Promise<User>`

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/core/api/invitations-api.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvitationsApi } from './invitations-api';

describe('InvitationsApi', () => {
  let api: InvitationsApi;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(InvitationsApi);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('lists, creates and revokes invitations', async () => {
    const listed = api.list();
    mock.expectOne('/api/invitations').flush({ data: [{ id: 1, expires_at: 'x', expires_on: '2026-11-13' }] });
    expect((await listed)[0].id).toBe(1);

    const created = api.create();
    const post = mock.expectOne('/api/invitations');
    expect(post.request.method).toBe('POST');
    post.flush({ data: { id: 2, expires_at: 'x', expires_on: '2026-11-13', token: 'tok' } });
    expect((await created).token).toBe('tok');

    const revoked = api.revoke(2);
    const del = mock.expectOne('/api/invitations/2');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await revoked;
  });

  it('previews an invitation by token', async () => {
    const preview = api.preview('a/b');
    mock.expectOne('/auth/invitations/a%2Fb').flush({ data: { inviter_name: 'Luciano', expires_at: 'x' } });
    expect((await preview).inviter_name).toBe('Luciano');
  });
});
```

En `frontend/src/app/core/auth/auth.service.spec.ts`, agregar dentro del `describe('AuthService', ...)` (al final):

```ts
  it('registers with an invitation and keeps the session', async () => {
    const input = {
      token: 'tok', name: 'Pedro', email: 'pedro@example.com', password: 'secret123', password_confirmation: 'secret123',
    };
    const result = service.register(input);
    http.expectOne('/sanctum/csrf-cookie').flush(null);
    await tick();
    const req = http.expectOne('/auth/register');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush({ data: user });

    expect(await result).toEqual(user);
    expect(service.user()).toEqual(user);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include src/app/core/api/invitations-api.spec.ts --include src/app/core/auth/auth.service.spec.ts`
Expected: FAIL (no existe `./invitations-api`; `register` no es una función).

- [ ] **Step 3: Implement**

`frontend/src/app/core/models/invitation.ts`:

```ts
export const MAX_PENDING_INVITATIONS = 5;

export interface Invitation {
  id: number;
  expires_at: string;
  /** Fecha de vencimiento en America/Santiago (aaaa-mm-dd). */
  expires_on: string;
}

export interface CreatedInvitation extends Invitation {
  /** Solo viene al crearla: con él se arma el link. */
  token: string;
}

export interface InvitationPreview {
  inviter_name: string;
  expires_at: string;
}
```

`frontend/src/app/core/api/invitations-api.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CreatedInvitation, Invitation, InvitationPreview } from '../models/invitation';

@Injectable({ providedIn: 'root' })
export class InvitationsApi {
  private readonly http = inject(HttpClient);

  async list(): Promise<Invitation[]> {
    return (await firstValueFrom(this.http.get<{ data: Invitation[] }>('/api/invitations'))).data;
  }

  async create(): Promise<CreatedInvitation> {
    return (await firstValueFrom(this.http.post<{ data: CreatedInvitation }>('/api/invitations', {}))).data;
  }

  async revoke(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/invitations/${id}`));
  }

  async preview(token: string): Promise<InvitationPreview> {
    const url = `/auth/invitations/${encodeURIComponent(token)}`;
    return (await firstValueFrom(this.http.get<{ data: InvitationPreview }>(url))).data;
  }
}
```

En `frontend/src/app/core/auth/auth.service.ts`, agregar después de la interfaz `UserResponse`:

```ts
export interface RegisterInput {
  token: string;
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}
```

y el método después de `login`:

```ts
  async register(input: RegisterInput): Promise<User> {
    await firstValueFrom(this.http.get('/sanctum/csrf-cookie'));
    const { data } = await firstValueFrom(this.http.post<UserResponse>('/auth/register', input));
    this.currentUser.set(data);
    return data;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include src/app/core/api/invitations-api.spec.ts --include src/app/core/auth/auth.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/models/invitation.ts frontend/src/app/core/api/invitations-api.ts frontend/src/app/core/api/invitations-api.spec.ts frontend/src/app/core/auth/auth.service.ts frontend/src/app/core/auth/auth.service.spec.ts
git commit -m "feat(invitations): add invitations API client and AuthService.register

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pantalla Cuenta y cambios en "Hoy"

**Files:**
- Create: `frontend/src/app/features/account/account-page.ts`, `frontend/src/app/features/account/account-page.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` (ruta `cuenta` dentro del shell), `frontend/src/app/features/today/today-page.ts` (saludo con enlace y estado sin rutina), `frontend/src/app/features/today/today-page.spec.ts`

**Interfaces:**
- Consumes: `InvitationsApi`, `MAX_PENDING_INVITATIONS`, `AuthService.user/logout` (Task 4); `formatDate` (`core/format/format.ts`)
- Produces: ruta `/cuenta`

- [ ] **Step 1: Write the failing tests**

`frontend/src/app/features/account/account-page.spec.ts`:

```ts
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvitationsApi } from '../../core/api/invitations-api';
import { AuthService } from '../../core/auth/auth.service';
import type { Invitation } from '../../core/models/invitation';
import { AccountPage } from './account-page';

@Component({ template: '' })
class Blank {}

const pendingInvitation = (id: number): Invitation => ({ id, expires_at: 'x', expires_on: '2026-11-13' });

function setNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  }
}

async function render(pending: Invitation[] = []) {
  const api = {
    list: vi.fn().mockResolvedValue(pending),
    create: vi.fn().mockResolvedValue({ ...pendingInvitation(9), token: 'tok123' }),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'login', component: Blank }]),
      { provide: InvitationsApi, useValue: api },
      {
        provide: AuthService,
        useValue: { user: signal({ id: 1, name: 'Luciano', email: 'l@x.cl' }), logout: vi.fn().mockResolvedValue(undefined) },
      },
    ],
  });
  const fixture = TestBed.createComponent(AccountPage);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const button = (label: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;
  return { api, el, settle, button };
}

describe('AccountPage', () => {
  afterEach(() => setNavigator({ share: undefined, clipboard: undefined }));

  it('shares the new invitation link', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share });
    const { el, settle, button } = await render();

    button('Invitar a alguien').click();
    await settle();

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('/registro/tok123') }));
    expect(el.textContent).toContain('Vence el 13/11/2026');
  });

  it('copies the link when sharing is not available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share: undefined, clipboard: { writeText } });
    const { el, settle, button } = await render();

    button('Invitar a alguien').click();
    await settle();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/registro/tok123'));
    expect(el.textContent).toContain('Link copiado');
  });

  it('stops inviting at five pending invitations', async () => {
    const { el, button } = await render([1, 2, 3, 4, 5].map(pendingInvitation));

    expect(button('Invitar a alguien').disabled).toBe(true);
    expect(el.textContent).toContain('Tienes 5 invitaciones pendientes');
  });

  it('revokes a pending invitation', async () => {
    const { api, el, settle, button } = await render([pendingInvitation(7)]);

    button('Anular').click();
    await settle();

    expect(api.revoke).toHaveBeenCalledWith(7);
    expect(el.textContent).not.toContain('Vence el');
  });
});
```

En `frontend/src/app/features/today/today-page.spec.ts`, reemplazar el test `it('invites to activate a routine when there is none', ...)` por:

```ts
  it('suggests a template when there is no active routine', async () => {
    const { text, el } = await render({ ...today, routine: null, day: null, days: [] });
    expect(text).toContain('Elige una plantilla para empezar');
    expect(el.querySelector('a[href="/rutinas/plantillas"]')).not.toBeNull();
  });

  it('links the greeting to the account page', async () => {
    const { el } = await render(today);
    expect(el.querySelector('a[href="/cuenta"]')?.textContent).toContain('Luciano');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include src/app/features/account/account-page.spec.ts --include src/app/features/today/today-page.spec.ts`
Expected: FAIL (no existe `./account-page`; no está el texto nuevo en Hoy).

- [ ] **Step 3: Create `frontend/src/app/features/account/account-page.ts`**

```ts
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { InvitationsApi } from '../../core/api/invitations-api';
import { AuthService } from '../../core/auth/auth.service';
import { formatDate } from '../../core/format/format';
import { MAX_PENDING_INVITATIONS } from '../../core/models/invitation';

@Component({
  selector: 'app-account-page',
  imports: [HlmButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-1 page-title">Cuenta</h1>
    @if (auth.user(); as u) {
      <p class="font-medium">{{ u.name }}</p>
      <p class="mb-6 text-sm text-muted-foreground">{{ u.email }}</p>
    }

    <section class="mb-6 card p-4">
      <h2 class="mb-1 section-title">Invitar a alguien</h2>
      <p class="mb-3 text-sm text-muted-foreground">El link sirve para crear una sola cuenta y vence en 7 días.</p>
      <button hlmBtn class="h-12 w-full" [disabled]="busy() || atLimit()" (click)="invite()">Invitar a alguien</button>
      @if (atLimit()) {
        <p class="mt-2 text-sm text-muted-foreground">Tienes 5 invitaciones pendientes. Anula una para crear otra.</p>
      }
      @if (notice()) { <p class="mt-2 text-sm text-primary" role="status">{{ notice() }}</p> }
      @if (error()) { <p class="mt-2 text-sm text-destructive" role="alert">{{ error() }}</p> }

      @if (pending().length) {
        <h3 class="mt-5 mb-2 eyebrow">Invitaciones pendientes</h3>
        <ul class="flex flex-col gap-2">
          @for (inv of pending(); track inv.id) {
            <li class="flex items-center gap-3">
              <span class="flex-1 text-sm">Vence el {{ formatDate(inv.expires_on) }}</span>
              <button hlmBtn variant="outline" class="h-10" (click)="revoke(inv.id)">Anular</button>
            </li>
          }
        </ul>
      }
    </section>

    <button hlmBtn variant="outline" class="h-12 w-full" (click)="logout()">Cerrar sesión</button>
  `,
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(InvitationsApi);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  protected readonly formatDate = formatDate;
  protected readonly invitations = resource({ loader: () => this.api.list() });
  protected readonly pending = computed(() => (this.invitations.hasValue() ? this.invitations.value() : []));
  protected readonly atLimit = computed(() => this.pending().length >= MAX_PENDING_INVITATIONS);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  async invite(): Promise<void> {
    this.busy.set(true);
    this.notice.set(null);
    this.error.set(null);
    try {
      const created = await this.api.create();
      this.invitations.value.update((list) => [created, ...(list ?? [])]);
      await this.share(`${this.document.location.origin}/registro/${created.token}`);
    } catch {
      this.error.set('No se pudo crear la invitación. Revisa tu conexión.');
    } finally {
      this.busy.set(false);
    }
  }

  async revoke(id: number): Promise<void> {
    this.error.set(null);
    try {
      await this.api.revoke(id);
      this.invitations.value.update((list) => (list ?? []).filter((i) => i.id !== id));
    } catch {
      this.error.set('No se pudo anular la invitación.');
    }
  }

  async logout(): Promise<void> {
    try {
      await this.auth.logout();
      await this.router.navigateByUrl('/login');
    } catch {
      this.error.set('No se pudo cerrar sesión. Revisa tu conexión.');
    }
  }

  /** Menú nativo de compartir; si no existe o falla (salvo que el usuario cancele), copia el link. */
  private async share(url: string): Promise<void> {
    const text = `${this.auth.user()?.name ?? 'Alguien'} te invitó a GymTracker`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'GymTracker', text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(url);
    this.notice.set('Link copiado');
  }
}
```

- [ ] **Step 4: Route and "Hoy" changes**

En `frontend/src/app/app.routes.ts`, dentro de los `children` del shell, después de `{ path: 'hoy', ... }`:

```ts
      { path: 'cuenta', title: 'Cuenta · GymTracker', loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage) },
```

En `frontend/src/app/features/today/today-page.ts`:
- Envolver el `<h1 class="page-title mt-1 text-4xl">…</h1>` del header en `<a routerLink="/cuenta" aria-label="Mi cuenta" class="block">` … `</a>`.
- Reemplazar el contenido del bloque `@if (!t.routine) { <section class="card p-5"> … </section> }` por:

```html
        <section class="card p-5">
          <span class="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ng-icon name="lucideListChecks" size="22" aria-hidden="true" />
          </span>
          <h2 class="section-title text-2xl">Elige una plantilla para empezar</h2>
          <p class="mt-1 mb-4 text-sm text-muted-foreground">Parte con una rutina de un programa o atleta conocido, o crea la tuya.</p>
          <a hlmBtn routerLink="/rutinas/plantillas" class="h-12 w-full">Ver plantillas</a>
          <a routerLink="/rutinas" class="mt-3 block text-center text-sm text-muted-foreground underline">Ir a mis rutinas</a>
          <ng-container *ngTemplateOutlet="freeOrContinue; context: { $implicit: t }" />
        </section>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include src/app/features/account/account-page.spec.ts --include src/app/features/today/today-page.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/account frontend/src/app/app.routes.ts frontend/src/app/features/today
git commit -m "feat(account): add account page to invite people and sign out

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Pantalla de registro por invitación

**Files:**
- Create: `frontend/src/app/features/auth/register-page.ts`, `frontend/src/app/features/auth/register-page.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` (ruta `registro/:token` junto a `login`)

**Interfaces:**
- Consumes: `InvitationsApi.preview`, `AuthService.loadUser/register/logout`, `RegisterInput` (Task 4); `SyncService.flush()`
- Produces: ruta pública `/registro/:token`

- [ ] **Step 1: Write the failing test** — `frontend/src/app/features/auth/register-page.spec.ts`

```ts
import { Component } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { InvitationsApi } from '../../core/api/invitations-api';
import { AuthService } from '../../core/auth/auth.service';
import { SyncService } from '../../core/sync/sync.service';
import { RegisterPage } from './register-page';

@Component({ template: '' })
class Blank {}

async function render(opts: { preview?: () => Promise<unknown>; register?: () => Promise<unknown>; current?: unknown } = {}) {
  const auth = {
    loadUser: vi.fn().mockResolvedValue(opts.current ?? null),
    register: vi.fn(opts.register ?? (() => Promise.resolve({ id: 2, name: 'Pedro', email: 'p@x.cl' }))),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const invitations = { preview: vi.fn(opts.preview ?? (() => Promise.resolve({ inviter_name: 'Luciano', expires_at: 'x' }))) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'hoy', component: Blank }, { path: 'login', component: Blank }]),
      { provide: AuthService, useValue: auth },
      { provide: InvitationsApi, useValue: invitations },
      { provide: SyncService, useValue: { flush: vi.fn().mockResolvedValue(undefined) } },
    ],
  });
  const fixture = TestBed.createComponent(RegisterPage);
  fixture.componentRef.setInput('token', 'tok123');
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const type = (id: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const fillAndSubmit = async () => {
    type('name', 'Pedro');
    type('email', 'pedro@example.com');
    type('password', 'secret123');
    type('password_confirmation', 'secret123');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  };
  return { auth, invitations, el, fillAndSubmit };
}

describe('RegisterPage', () => {
  it('explains when the link is no longer valid', async () => {
    const { el } = await render({ preview: () => Promise.reject(new HttpErrorResponse({ status: 410 })) });
    expect(el.textContent).toContain('Este link de invitación ya no es válido');
  });

  it('registers with the invitation and opens the app', async () => {
    const { auth, el, fillAndSubmit } = await render();
    expect(el.textContent).toContain('Luciano te invitó a GymTracker');

    await fillAndSubmit();

    expect(auth.register).toHaveBeenCalledWith({
      token: 'tok123', name: 'Pedro', email: 'pedro@example.com', password: 'secret123', password_confirmation: 'secret123',
    });
    expect(TestBed.inject(Router).url).toBe('/hoy');
  });

  it('shows the server error under the email field', async () => {
    const error = new HttpErrorResponse({ status: 422, error: { errors: { email: ['Este correo ya tiene una cuenta.'] } } });
    const { el, fillAndSubmit } = await render({ register: () => Promise.reject(error) });

    await fillAndSubmit();

    expect(el.textContent).toContain('Este correo ya tiene una cuenta.');
  });

  it('does not mix accounts when someone is already signed in', async () => {
    const { el } = await render({ current: { id: 1, name: 'Luciano', email: 'l@x.cl' } });
    expect(el.textContent).toContain('Ya tienes una sesión iniciada');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include src/app/features/auth/register-page.spec.ts`
Expected: FAIL, no existe `./register-page`.

- [ ] **Step 3: Create `frontend/src/app/features/auth/register-page.ts`**

```ts
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { InvitationsApi } from '../../core/api/invitations-api';
import { AuthService } from '../../core/auth/auth.service';
import { SyncService } from '../../core/sync/sync.service';

type State = 'loading' | 'signed-in' | 'invalid' | 'form';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, HlmButton, HlmInput, HlmLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <h1 class="mb-6 page-title text-5xl">Gym<span class="text-primary">Tracker</span></h1>
      @switch (state()) {
        @case ('loading') {
          <p class="text-muted-foreground">Cargando…</p>
        }
        @case ('signed-in') {
          <p class="mb-4">Ya tienes una sesión iniciada. Para crear otra cuenta con esta invitación, primero cierra la tuya.</p>
          <a hlmBtn routerLink="/hoy" class="mb-3 h-12 w-full">Ir a GymTracker</a>
          <button hlmBtn variant="outline" class="h-12 w-full" (click)="signOut()">Cerrar sesión para usar esta invitación</button>
        }
        @case ('invalid') {
          <p class="mb-4" role="alert">Este link de invitación ya no es válido. Pídele uno nuevo a quien te invitó.</p>
          <a routerLink="/login" class="text-primary underline">Ir a iniciar sesión</a>
        }
        @case ('form') {
          <p class="mb-6"><strong>{{ inviter() }}</strong> te invitó a GymTracker.</p>
          <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4" novalidate>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="name">Nombre</label>
              <input hlmInput id="name" autocomplete="name" formControlName="name" class="h-12 text-base" />
              @if (fieldError('name'); as e) { <p class="text-sm text-destructive">{{ e }}</p> }
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="email">Correo</label>
              <input hlmInput id="email" type="email" autocomplete="email" inputmode="email" formControlName="email" class="h-12 text-base" />
              @if (fieldError('email'); as e) { <p class="text-sm text-destructive">{{ e }}</p> }
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="password">Contraseña</label>
              <input hlmInput id="password" type="password" autocomplete="new-password" formControlName="password" class="h-12 text-base" />
              @if (fieldError('password'); as e) { <p class="text-sm text-destructive">{{ e }}</p> }
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="password_confirmation">Repite la contraseña</label>
              <input hlmInput id="password_confirmation" type="password" autocomplete="new-password" formControlName="password_confirmation" class="h-12 text-base" />
            </div>
            @if (error()) { <p class="text-sm text-destructive" role="alert">{{ error() }}</p> }
            <button hlmBtn type="submit" class="h-12 text-base" [disabled]="loading()">
              {{ loading() ? 'Creando cuenta…' : 'Crear cuenta' }}
            </button>
          </form>
        }
      }
    </main>
  `,
})
export class RegisterPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly invitations = inject(InvitationsApi);
  private readonly router = inject(Router);
  private readonly sync = inject(SyncService);

  readonly token = input.required<string>();

  protected readonly state = signal<State>('loading');
  protected readonly inviter = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly serverErrors = signal<Record<string, string>>({});

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    password_confirmation: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  async ngOnInit(): Promise<void> {
    const current = await this.auth.loadUser().catch(() => null);
    if (current) {
      this.state.set('signed-in');
      return;
    }
    await this.loadPreview();
  }

  protected fieldError(field: string): string | null {
    return this.serverErrors()[field] ?? null;
  }

  async signOut(): Promise<void> {
    await this.auth.logout().catch(() => undefined);
    await this.loadPreview();
  }

  async submit(): Promise<void> {
    const value = this.form.getRawValue();
    if (this.form.invalid) {
      this.error.set('Completa todos los campos. La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (value.password !== value.password_confirmation) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.serverErrors.set({});
    try {
      await this.auth.register({ token: this.token(), ...value });
      void this.sync.flush();
      await this.router.navigateByUrl('/hoy');
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 422) {
        const errors = (e.error?.errors ?? {}) as Record<string, string[]>;
        this.serverErrors.set(Object.fromEntries(Object.entries(errors).map(([key, list]) => [key, list[0]])));
      } else if (e instanceof HttpErrorResponse && e.status === 410) {
        this.state.set('invalid');
      } else {
        this.error.set('No se pudo conectar. Intenta de nuevo.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPreview(): Promise<void> {
    this.state.set('loading');
    try {
      const preview = await this.invitations.preview(this.token());
      this.inviter.set(preview.inviter_name);
      this.state.set('form');
    } catch {
      this.state.set('invalid');
    }
  }
}
```

- [ ] **Step 4: Route** — en `frontend/src/app/app.routes.ts`, después de la ruta `login`:

```ts
  {
    path: 'registro/:token',
    title: 'Crear cuenta · GymTracker',
    loadComponent: () => import('./features/auth/register-page').then((m) => m.RegisterPage),
  },
```

- [ ] **Step 5: Run the full frontend suite and build**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: todo en verde y el build sin errores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/auth/register-page.ts frontend/src/app/features/auth/register-page.spec.ts frontend/src/app/app.routes.ts
git commit -m "feat(invitations): sign up from an invitation link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Revisión de Luciano e integración

- [ ] **Step 1: Migrate locally and run everything**

```bash
docker compose exec backend php artisan migrate
cd backend && ./vendor/bin/pest && cd ../frontend && npx ng test --watch=false && cd ../infra && npm test
```

Expected: migración aplicada y las tres suites en verde.

- [ ] **Step 2: Local check (Luciano)**

1. En `http://localhost:4200`, con `luciano@gymtracker.test` / `password`: tocar tu nombre en "Hoy" → **Cuenta** → **Invitar a alguien**. En el PC se copia el link y aparece "Link copiado".
2. Abrir el link en una **ventana privada**: "Luciano te invitó a GymTracker". Crear la cuenta y entrar directo a "Hoy", con la tarjeta "Elige una plantilla para empezar".
3. Volver a abrir el mismo link: "ya no es válido".
4. En la ventana normal, Cuenta ya no muestra esa invitación como pendiente. Probar **Anular** con otra y **Cerrar sesión**.

- [ ] **Step 3: Merge (solo cuando Luciano diga "intégralo a main")**

```bash
git push . HEAD:main && git checkout main && git push origin main
gh run watch --exit-status $(gh run list --branch main --workflow Deploy --limit 1 --json databaseId -q '.[0].databaseId')
```

El workflow de Deploy aplica la migración nueva (`artisan migrate --force`) y la auto-pausa de 5 minutos. Verificar en producción repitiendo el punto 2 desde el celular.
