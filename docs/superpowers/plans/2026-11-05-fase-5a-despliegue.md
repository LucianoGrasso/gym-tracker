# Fase 5a: Despliegue en AWS, PWA y CI/CD (plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GymTracker queda desplegada en AWS con una URL HTTPS de CloudFront, instalable como PWA en el celular, y cada push a `main` la vuelve a desplegar desde GitHub Actions.

**Architecture:**
- Un solo stack de CDK (`GymTrackerStack`) con cuatro constructs:
  - `Database`: VPC solo con subredes aisladas y Aurora Serverless v2 con auto-pausa.
  - `Backend`: Laravel en Lambda con Bref (HTTP y consola) detrás de API Gateway HTTP API.
  - `WarmUp`: EventBridge Scheduler.
  - `Frontend`: S3 + CloudFront, mismo origen para `/api/*`, `/auth/*` y `/sanctum/*`.
- Un stack aparte (`GymTrackerCiStack`) crea el rol OIDC que usa GitHub Actions. Se despliega una sola vez desde el PC.
- Los secretos (APP_KEY y la contraseña de la BD) viven en SSM Parameter Store como SecureString. El workflow los lee y los pasa a CloudFormation como parámetros `NoEcho`.

**Tech Stack:** AWS CDK 2.275 (TypeScript), `@bref.sh/constructs` 2.0.6, Bref 3 con PHP 8.5 (las capas de Bref ya traen `pdo_pgsql` activo; verificado con la imagen `bref/php-85:3`), `bref/laravel-bridge` 3.1, `@angular/service-worker` 22.2, GitHub Actions con OIDC, Vitest para los tests de infraestructura.

## Global Constraints

- **Cuenta y región:** cuenta AWS `000000000000`, región `us-east-2`. Repo `LucianoGrasso/gym-tracker`.
- **Aprobaciones antes de AWS:** no se crea nada en AWS sin aprobación explícita de Luciano. Antes del primer despliegue se valida el costo con la Pricing API (tarea 7).
- **Secretos:**
  - Van en **SSM Parameter Store** (SecureString), **no** en Secrets Manager.
  - Nunca se escriben en el template ni en el repo.
- **Red:**
  - **Sin NAT Gateway ni RDS Proxy.** Las Lambdas van en subredes `PRIVATE_ISOLATED`.
  - Ninguna Lambda llama a servicios AWS en tiempo de ejecución, así que no se necesitan VPC endpoints.
- **Aurora:**
  - Serverless v2 PostgreSQL 17, `min 0 ACU`, auto-pausa a los 10 minutos.
  - Despertar programado lun, mar, jue y vie a las 18:45 `America/Santiago`. El horario se configura en `infra/cdk.json` → `context.warmUp`.
- **Laravel apto para Lambda:** `SESSION_DRIVER=database`, `CACHE_STORE=database`, `LOG_CHANNEL=stderr`, sin escribir en disco (el bridge de Bref usa `/tmp`).
- **Cookies:** `SESSION_SECURE_COOKIE=true` y `SESSION_DOMAIN` sin definir (cookie solo del host de CloudFront).
- **Idioma:** textos de UI en español (Chile); código en inglés.
- **Despliegue solo desde CI:** el backend se empaqueta tras `composer install --no-dev` en CI. Un `cdk deploy GymTrackerStack` desde el PC subiría dependencias de desarrollo y el `bootstrap/cache/packages.php` de desarrollo.
- **Commits:** uno por tarea, en la rama `fase-5a-despliegue`, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisiones (y desvíos de la spec §10)

1. **Rewrite de la SPA con una CloudFront Function, no con "error responses".** Las error responses de CloudFront aplican a toda la distribución y convertirían un 404 o 403 JSON de la API en `index.html` con 200. La función reescribe a `/index.html` solo las rutas sin punto, y solo en el comportamiento de S3.
2. **Secretos como parámetros `NoEcho` en vez de leerlos de SSM en tiempo de ejecución.** Leerlos desde la Lambda exigiría un VPC endpoint de SSM (unos USD 7/mes por zona) o un NAT. CloudFormation no admite `{{resolve:ssm-secure}}` en variables de entorno de Lambda.
3. **El despertar programado invoca la Lambda de consola con `app:wake-db`.** No se crea una Lambda extra: es el mismo código y el mismo rol.
4. **Sin dominio propio por ahora.** La URL es `https://dxxxx.cloudfront.net`. Un dominio propio se agrega después sin cambiar la arquitectura.
5. **Primer usuario con `app:create-user ... --seed`.** El flag carga los ejercicios y la rutina inicial de la spec §12 para ese usuario. Así no se corre `db:seed`, que crearía el usuario con la contraseña de ejemplo.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `backend/app/Console/Commands/WakeDatabase.php` | `app:wake-db`: consulta mínima con reintentos (la usa el Scheduler) |
| `backend/app/Console/Commands/CreateUser.php` (mod.) | opción `--seed` |
| `backend/tests/Feature/Console/WakeDatabaseTest.php`, `CreateUserTest.php` (mod.) | tests |
| `backend/composer.json` (mod.) | `bref/bref`, `bref/laravel-bridge` |
| `frontend/ngsw-config.json` | qué cachea el service worker |
| `frontend/public/manifest.webmanifest`, `frontend/public/icons/*` | PWA instalable |
| `frontend/src/app/shared/ui/update-banner.ts` (+ spec) | aviso de "nueva versión" |
| `frontend/src/app/app.config.ts`, `layout/shell.ts`, `src/index.html`, `angular.json` (mod.) | registrar SW, manifest y banner |
| `infra/package.json`, `tsconfig.json`, `cdk.json`, `vitest.config.ts` | proyecto CDK |
| `infra/bin/gymtracker.ts` | app de CDK con los dos stacks |
| `infra/lib/gymtracker-stack.ts` | stack principal: parámetros, cableado y outputs |
| `infra/lib/database.ts` | VPC + Aurora + security group de clientes |
| `infra/lib/backend.ts` | Lambdas Bref + HTTP API |
| `infra/lib/warm-up.ts` | EventBridge Scheduler |
| `infra/lib/frontend.ts` | S3 + CloudFront + subida del build |
| `infra/lib/github-ci-stack.ts` | proveedor OIDC + rol de despliegue |
| `infra/test/*` | tests con `aws-cdk-lib/assertions` + fixtures |
| `infra/scripts/init-secrets.sh`, `infra/scripts/artisan.sh` | crear secretos; ejecutar artisan en producción |
| `.github/workflows/ci.yml`, `deploy.yml` | tests en cada push; despliegue en `main` |
| `README.md`, `CLAUDE.md` (mod.) | cómo desplegar y operar |

---

### Task 1: Laravel listo para Lambda (Bref, `app:wake-db`, `--seed`)

**Files:**
- Create: `backend/app/Console/Commands/WakeDatabase.php`
- Create: `backend/tests/Feature/Console/WakeDatabaseTest.php`
- Modify: `backend/app/Console/Commands/CreateUser.php`
- Modify: `backend/tests/Feature/Console/CreateUserTest.php`
- Modify: `backend/composer.json`, `backend/composer.lock`

**Interfaces:**
- Produces: `app:wake-db {--attempts=4} {--sleep=5000} {--database=}`. Imprime `Base de datos despierta.` y termina con `SUCCESS`, o termina con `FAILURE`.
- Produces: `app:create-user {email} {name} {--password=} {--seed}`.
- Produces: `bref/bref` ^3.0 y `bref/laravel-bridge` ^3.1. La tarea 4 usa los handlers `public/index.php` y `artisan`.

- [ ] **Step 1: Write the failing tests for `app:wake-db`**

`backend/tests/Feature/Console/WakeDatabaseTest.php`:

```php
<?php

it('wakes the database with a minimal query', function () {
    $this->artisan('app:wake-db')
        ->expectsOutput('Base de datos despierta.')
        ->assertSuccessful();
});

it('fails after retrying when the database does not answer', function () {
    config(['database.connections.unreachable' => [
        'driver' => 'sqlite',
        'database' => '/nonexistent/gymtracker.sqlite',
        'prefix' => '',
    ]]);

    $this->artisan('app:wake-db', ['--attempts' => 2, '--sleep' => 0, '--database' => 'unreachable'])
        ->assertFailed();
});
```

- [ ] **Step 2: Write the failing tests for `--seed`**

Agregar al final de `backend/tests/Feature/Console/CreateUserTest.php`, con `use App\Models\Exercise;` y `use App\Models\Routine;` arriba:

```php
it('loads the starter exercises and routine with --seed', function () {
    $this->artisan('app:create-user', [
        'email' => 'seed@gymtracker.test',
        'name' => 'Seed',
        '--password' => 'secret123',
        '--seed' => true,
    ])->assertSuccessful();

    $user = User::where('email', 'seed@gymtracker.test')->sole();

    expect(Exercise::withoutGlobalScopes()->where('user_id', $user->id)->count())->toBeGreaterThan(10)
        ->and(Routine::withoutGlobalScopes()->where('user_id', $user->id)->where('is_active', true)->count())->toBe(1);
});

it('creates an empty account without --seed', function () {
    $this->artisan('app:create-user', [
        'email' => 'empty@gymtracker.test',
        'name' => 'Empty',
        '--password' => 'secret123',
    ])->assertSuccessful();

    $user = User::where('email', 'empty@gymtracker.test')->sole();

    expect(Exercise::withoutGlobalScopes()->where('user_id', $user->id)->count())->toBe(0);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Console`
Expected: FAIL con `The command "app:wake-db" does not exist.` o con `The "--seed" option does not exist.`

- [ ] **Step 4: Implement `app:wake-db`**

`backend/app/Console/Commands/WakeDatabase.php`:

```php
<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

class WakeDatabase extends Command
{
    protected $signature = 'app:wake-db
        {--attempts=4 : Intentos antes de rendirse}
        {--sleep=5000 : Milisegundos entre intentos}
        {--database= : Conexión a usar (por defecto, la principal)}';

    protected $description = 'Despierta Aurora (auto-pausa) con una consulta mínima; lo invoca EventBridge Scheduler';

    public function handle(): int
    {
        try {
            retry(
                max(1, (int) $this->option('attempts')),
                fn () => DB::connection($this->option('database'))->select('select 1'),
                (int) $this->option('sleep'),
            );
        } catch (Throwable $e) {
            $this->error('La base de datos no respondió: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info('Base de datos despierta.');

        return self::SUCCESS;
    }
}
```

- [ ] **Step 5: Implement `--seed`**

En `backend/app/Console/Commands/CreateUser.php`:
- Agregar `use Database\Seeders\GymTrackerSeeder;`.
- Cambiar la firma a:

```php
    protected $signature = 'app:create-user {email} {name}
        {--password= : Si se omite, se pide por consola}
        {--seed : Carga los ejercicios y la rutina inicial para este usuario}';
```

- Reemplazar `User::create($data); // el cast 'hashed' de User hashea la contraseña` por:

```php
        $user = User::create($data); // el cast 'hashed' de User hashea la contraseña

        if ($this->option('seed')) {
            app(GymTrackerSeeder::class)->run($user);
            $this->info('Ejercicios y rutina inicial cargados.');
        }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Console`
Expected: PASS (6 tests).

- [ ] **Step 7: Add Bref**

Run: `cd backend && composer require bref/bref:^3.0 bref/laravel-bridge:^3.1 --no-interaction`
Expected: ambos paquetes quedan en `require`, y `package:discover` lista `bref/laravel-bridge`.

- [ ] **Step 8: Full backend suite + lint**

Run: `cd backend && ./vendor/bin/pest && ./vendor/bin/pint --test`
Expected: todo en verde. Si Pint marca algo: `./vendor/bin/pint` y repetir.

- [ ] **Step 9: Commit**

```bash
git add backend/app/Console/Commands backend/tests/Feature/Console backend/composer.json backend/composer.lock
git commit -m "feat(api): add Bref, app:wake-db command and --seed option for app:create-user

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: PWA instalable con aviso de nueva versión

**Files:**
- Create: `frontend/ngsw-config.json`, `frontend/public/manifest.webmanifest`
- Create: `frontend/public/icons/icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
- Delete: `frontend/public/favicon.ico`
- Create: `frontend/src/app/shared/ui/update-banner.ts`, `update-banner.spec.ts`
- Modify: `frontend/src/app/app.config.ts`, `frontend/src/app/layout/shell.ts`, `frontend/src/index.html`, `frontend/angular.json`, `frontend/package.json`, `frontend/package-lock.json`

**Interfaces:**
- Produces: el build de producción en `frontend/dist/frontend/browser/` trae `ngsw.json`, `ngsw-worker.js`, `safety-worker.js`, `worker-basic.min.js`, `manifest.webmanifest` e `index.html`. La tarea 5 los sube con `no-cache`.
- Produces: `UpdateBanner` (`app-update-banner`) y el token `RELOAD_PAGE: InjectionToken<() => void>`.

- [ ] **Step 1: Install the service worker package**

Run: `cd frontend && npm i @angular/service-worker@~22.2.0`

- [ ] **Step 2: Write the failing test**

`frontend/src/app/shared/ui/update-banner.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RELOAD_PAGE, UpdateBanner } from './update-banner';

function setup() {
  const versionUpdates = new Subject<VersionEvent>();
  const reload = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: SwUpdate, useValue: { versionUpdates } },
      { provide: RELOAD_PAGE, useValue: reload },
    ],
  });
  const fixture = TestBed.createComponent(UpdateBanner);
  return { fixture, versionUpdates, reload };
}

describe('UpdateBanner', () => {
  it('stays hidden while no new version is ready', async () => {
    const { fixture, versionUpdates } = setup();
    await fixture.whenStable();
    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain('nueva versión');
  });

  it('offers to reload once a new version is ready', async () => {
    const { fixture, versionUpdates, reload } = setup();
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Hay una nueva versión de GymTracker.');
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('renders nothing when the service worker is not available', async () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(UpdateBanner);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include src/app/shared/ui/update-banner.spec.ts`
Expected: FAIL, no se encuentra `./update-banner`.

- [ ] **Step 4: Implement the banner**

`frontend/src/app/shared/ui/update-banner.ts`:

```ts
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, InjectionToken, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { NEVER, filter, map } from 'rxjs';

/** Recarga la página; es un token para poder reemplazarlo en los tests. */
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.location.reload();
  },
});

/**
 * Avisa cuando el service worker ya descargó una versión nueva. No recarga solo:
 * si estás a mitad de un entrenamiento, eliges tú cuándo hacerlo.
 */
@Component({
  selector: 'app-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ready()) {
      <div class="sticky top-0 z-10 bg-background/90 px-4 pt-2 backdrop-blur">
        <div
          class="mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <span class="flex-1">Hay una nueva versión de GymTracker.</span>
          <button type="button" class="font-semibold text-primary underline" (click)="reload()">Actualizar</button>
        </div>
      </div>
    }
  `,
})
export class UpdateBanner {
  private readonly updates = inject(SwUpdate, { optional: true });
  protected readonly reload = inject(RELOAD_PAGE);

  protected readonly ready = toSignal(
    (this.updates?.versionUpdates ?? NEVER).pipe(
      filter((event) => event.type === 'VERSION_READY'),
      map(() => true),
    ),
    { initialValue: false },
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include src/app/shared/ui/update-banner.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Register the service worker and show the banner**

En `frontend/src/app/app.config.ts`:
- Agregar `isDevMode` al import de `@angular/core`.
- Agregar `import { provideServiceWorker } from '@angular/service-worker';`.
- Agregar este provider al final de `providers`:

```ts
    // Cachea la app para abrirla sin señal en el gimnasio. Los datos los guarda Dexie, no el SW.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
```

En `frontend/src/app/layout/shell.ts`:
- Importar `UpdateBanner` desde `'../shared/ui/update-banner'` y agregarlo a `imports`.
- Poner `<app-update-banner />` justo antes de `<app-sync-indicator />`.

- [ ] **Step 7: Configure the service worker**

`frontend/ngsw-config.json`:

```json
{
  "$schema": "./node_modules/@angular/service-worker/config/schema.json",
  "index": "/index.html",
  "navigationUrls": ["/**", "!/**/*.*", "!/**/*__*", "!/**/*__*/**", "!/api/**", "!/auth/**", "!/sanctum/**"],
  "assetGroups": [
    {
      "name": "app",
      "installMode": "prefetch",
      "resources": { "files": ["/index.html", "/manifest.webmanifest", "/*.css", "/*.js"] }
    },
    {
      "name": "assets",
      "installMode": "lazy",
      "updateMode": "prefetch",
      "resources": { "files": ["/icons/**", "/media/**", "/**/*.(svg|png|webp|woff|woff2)"] }
    }
  ]
}
```

En `frontend/angular.json`, en `projects.frontend.architect.build.configurations.production`, agregar `"serviceWorker": "ngsw-config.json"` junto a `"outputHashing": "all"`.

- [ ] **Step 8: Manifest and icons**

`frontend/public/manifest.webmanifest`:

```json
{
  "name": "GymTracker",
  "short_name": "GymTracker",
  "description": "Rutinas, series y progreso en el gimnasio",
  "lang": "es-CL",
  "start_url": "/hoy",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0e0f0c",
  "theme_color": "#0e0f0c",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`frontend/public/icons/icon.svg`: una mancuerna lima sobre el fondo "Pista". Está a sangre completa, así que sirve como maskable; el dibujo cabe en la zona segura (esquina más lejana a 195 px del centro, menos que 204,8).

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0e0f0c"/>
  <g fill="#c8f135">
    <rect x="96" y="176" width="40" height="160" rx="12"/>
    <rect x="144" y="144" width="48" height="224" rx="14"/>
    <rect x="192" y="236" width="128" height="40" rx="8"/>
    <rect x="320" y="144" width="48" height="224" rx="14"/>
    <rect x="376" y="176" width="40" height="160" rx="12"/>
  </g>
</svg>
```

Generar los PNG con resvg, instalado de forma temporal en el scratchpad (no queda como dependencia):

```bash
REPO=/home/luciano/Proyecto_Gym_Tracker
TMP=/tmp/claude-1000/-home-luciano-Proyecto-Gym-Tracker/7dfc8e04-0e03-489f-9225-cc32d077eaae/scratchpad/icons
mkdir -p "$TMP" && cd "$TMP" && npm init -y >/dev/null && npm i @resvg/resvg-js@2.6.2 >/dev/null
node -e "
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const dir = '$REPO/frontend/public/icons/';
const svg = fs.readFileSync(dir + 'icon.svg');
for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) {
  fs.writeFileSync(dir + name + '.png', new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
}"
ls -l "$REPO/frontend/public/icons"
```

Expected: los 3 PNG existen y pesan más de 0 bytes. Abrir `icon-512.png` con Read para revisarlo a ojo.

Borrar `frontend/public/favicon.ico`. En `frontend/src/index.html`, reemplazar `<link rel="icon" type="image/x-icon" href="favicon.ico">` por:

```html
  <link rel="icon" type="image/svg+xml" href="icons/icon.svg">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="GymTracker">
```

- [ ] **Step 9: Full frontend suite + production build**

Run: `cd frontend && npx ng test --watch=false && npx ng build && ls dist/frontend/browser | grep -E '^(ngsw.json|ngsw-worker.js|manifest.webmanifest|index.html|icons)$'`
Expected: tests en verde, build sin errores de budget, y los 5 nombres listados.

- [ ] **Step 10: Check the service worker in a browser**

1. Servir el build en background: `cd frontend && npx --yes http-server@14 dist/frontend/browser -p 4300 -c-1 --proxy http://localhost:4300?`
2. Con chrome-devtools, abrir `http://localhost:4300/` y recargar una vez.
3. Correr `(await navigator.serviceWorker.getRegistrations()).length`.

Expected: `1`, y `fetch('/manifest.webmanifest')` responde 200. Detener el servidor después.

- [ ] **Step 11: Commit**

```bash
git add frontend/ngsw-config.json frontend/public frontend/src frontend/angular.json frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): make the app an installable PWA with an update banner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Proyecto CDK + base de datos (VPC sin NAT y Aurora con auto-pausa)

**Files:**
- Create: `infra/package.json` (vía npm), `infra/tsconfig.json`, `infra/cdk.json`, `infra/vitest.config.ts`, `infra/.gitignore`
- Create: `infra/bin/gymtracker.ts`, `infra/lib/gymtracker-stack.ts`, `infra/lib/database.ts`
- Create: `infra/test/helpers.ts`, `infra/test/database.test.ts`
- Create: `infra/test/fixtures/backend/public/index.php`, `infra/test/fixtures/backend/artisan`, `infra/test/fixtures/frontend/index.html`

**Interfaces:**
- Produces:
  - `GymTrackerStack(scope, id, props: GymTrackerStackProps)`, con `GymTrackerStackProps extends StackProps { backendPath: string; frontendPath: string; warmUp: WarmUpSchedule }`.
  - `WarmUpSchedule { minute: string; hour: string; weekDay: string }`.
- Produces: `CfnParameter` `AppKey` y `DbPassword`.
- Produces:
  - `Database` con `vpc`, `cluster` y `clientSecurityGroup`.
  - `DB_NAME = 'gymtracker'` y `DB_USER = 'gymtracker'`.
- Produces: `synth(): Template` en `test/helpers.ts`.

- [ ] **Step 1: Scaffold**

```bash
mkdir -p infra/bin infra/lib infra/test/fixtures/backend/public infra/test/fixtures/frontend infra/scripts
cd infra && npm init -y >/dev/null
npm i aws-cdk-lib@2.275.0 constructs@^10 @bref.sh/constructs@2.0.6
npm i -D aws-cdk@2.1147.0 typescript@~6.0.2 tsx@^4 vitest@^5.0.0 @types/node@^24
npm pkg set private=true --json && npm pkg delete main keywords author license description
npm pkg set scripts.test="vitest run" scripts.typecheck="tsc --noEmit" scripts.cdk="cdk"
```

`infra/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["bin", "lib", "test"]
}
```

`infra/cdk.json`:

```json
{
  "app": "npx tsx bin/gymtracker.ts",
  "context": {
    "account": "000000000000",
    "region": "us-east-2",
    "githubRepo": "LucianoGrasso/gym-tracker",
    "warmUp": { "minute": "45", "hour": "18", "weekDay": "MON,TUE,THU,FRI" }
  }
}
```

`infra/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Sintetizar el stack (y hashear los assets) tarda unos segundos.
export default defineConfig({ test: { testTimeout: 60_000 } });
```

`infra/.gitignore`:

```
node_modules/
cdk.out/
outputs.json
```

Fixtures, para que los tests no hasheen el backend real con `vendor/`:
- `infra/test/fixtures/backend/public/index.php` → `<?php // fixture`
- `infra/test/fixtures/backend/artisan` → `<?php // fixture`
- `infra/test/fixtures/frontend/index.html` → `<!doctype html><title>fixture</title>`

- [ ] **Step 2: Write the failing test**

`infra/test/helpers.ts`:

```ts
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as path from 'node:path';
import { GymTrackerStack } from '../lib/gymtracker-stack';

export const WARM_UP = { minute: '45', hour: '18', weekDay: 'MON,TUE,THU,FRI' };

export function synth(): Template {
  const app = new App();
  const stack = new GymTrackerStack(app, 'Test', {
    env: { account: '123456789012', region: 'us-east-2' },
    backendPath: path.join(__dirname, 'fixtures/backend'),
    frontendPath: path.join(__dirname, 'fixtures/frontend'),
    warmUp: WARM_UP,
  });
  return Template.fromStack(stack);
}
```

`infra/test/database.test.ts`:

```ts
import { Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { synth } from './helpers';

describe('Database', () => {
  const template = synth();

  it('has no NAT gateways and no internet gateway', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
    template.resourceCountIs('AWS::EC2::InternetGateway', 0);
  });

  it('runs Aurora Serverless v2 Postgres 17 that pauses at 0 ACU', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      EngineVersion: Match.stringLikeRegexp('^17\\.'),
      DatabaseName: 'gymtracker',
      MasterUsername: 'gymtracker',
      MasterUserPassword: { Ref: 'DbPassword' },
      StorageEncrypted: true,
      DeletionProtection: true,
      ServerlessV2ScalingConfiguration: { MinCapacity: 0, MaxCapacity: 2, SecondsUntilAutoPause: 600 },
    });
    template.hasResourceProperties('AWS::RDS::DBInstance', { DBInstanceClass: 'db.serverless' });
  });

  it('keeps secrets out of Secrets Manager and out of the template', () => {
    template.resourceCountIs('AWS::SecretsManager::Secret', 0);
    expect(template.toJSON().Parameters.AppKey).toMatchObject({ Type: 'String', NoEcho: true });
    expect(template.toJSON().Parameters.DbPassword).toMatchObject({ Type: 'String', NoEcho: true });
  });

  it('only lets the client security group reach Postgres', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      SourceSecurityGroupId: { 'Fn::GetAtt': [Match.stringLikeRegexp('DatabaseClientSg'), 'GroupId'] },
    });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd infra && npm test`
Expected: FAIL con `Cannot find module '../lib/gymtracker-stack'`.

- [ ] **Step 4: Implement `Database`**

Ver qué versión 17.x trae la CDK instalada:

Run: `cd infra && grep -oE "VER_17_[0-9]+" node_modules/aws-cdk-lib/aws-rds/lib/cluster-engine.d.ts | sort -t_ -k3 -n | tail -1`

Usar esa constante en `version:`. Si imprime `VER_17_6`, se escribe `rds.AuroraPostgresEngineVersion.VER_17_6`.

`infra/lib/database.ts`:

```ts
import { Duration, RemovalPolicy, SecretValue } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export const DB_NAME = 'gymtracker';
export const DB_USER = 'gymtracker';

export interface DatabaseProps {
  /** Contraseña maestra (parámetro NoEcho; su valor vive en SSM). */
  readonly password: SecretValue;
}

/** VPC sin salida a internet + Aurora Serverless v2 que se pausa sola. */
export class Database extends Construct {
  readonly vpc: ec2.Vpc;
  readonly cluster: rds.DatabaseCluster;
  /** Security group que deben usar las Lambdas para llegar a Postgres. */
  readonly clientSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    // Solo subredes aisladas: sin NAT (USD ~32/mes) ni IPs públicas.
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }],
    });

    this.clientSecurityGroup = new ec2.SecurityGroup(this, 'ClientSg', {
      vpc: this.vpc,
      description: 'Lambdas de GymTracker',
    });

    this.cluster = new rds.DatabaseCluster(this, 'Cluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_17_6, // la del grep del step 4
      }),
      writer: rds.ClusterInstance.serverlessV2('Writer'),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      serverlessV2AutoPauseDuration: Duration.minutes(10),
      credentials: rds.Credentials.fromPassword(DB_USER, props.password),
      defaultDatabaseName: DB_NAME,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      storageEncrypted: true,
      backup: { retention: Duration.days(7) },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
    });

    this.cluster.connections.allowDefaultPortFrom(this.clientSecurityGroup, 'Lambdas a Postgres');
  }
}
```

- [ ] **Step 5: Stack and CDK app**

`infra/lib/gymtracker-stack.ts`:

```ts
import { CfnParameter, SecretValue, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Database } from './database';

export interface WarmUpSchedule {
  readonly minute: string;
  readonly hour: string;
  readonly weekDay: string;
}

export interface GymTrackerStackProps extends StackProps {
  /** Carpeta de Laravel ya instalada con `composer install --no-dev`. */
  readonly backendPath: string;
  /** Salida de `ng build` (`frontend/dist/frontend/browser`). */
  readonly frontendPath: string;
  /** Hora del despertar programado de Aurora (America/Santiago). */
  readonly warmUp: WarmUpSchedule;
}

export class GymTrackerStack extends Stack {
  constructor(scope: Construct, id: string, props: GymTrackerStackProps) {
    super(scope, id, props);

    // Los valores reales viven en SSM (SecureString); el workflow los pasa al desplegar.
    const appKey = new CfnParameter(this, 'AppKey', {
      type: 'String',
      noEcho: true,
      description: 'APP_KEY de Laravel (base64:...)',
    });
    const dbPassword = new CfnParameter(this, 'DbPassword', {
      type: 'String',
      noEcho: true,
      minLength: 16,
      description: 'Contraseña maestra de Aurora',
    });

    const database = new Database(this, 'Database', { password: SecretValue.cfnParameter(dbPassword) });
    void appKey; // se usa en la tarea 4
    void database; // se usa en la tarea 4
  }
}
```

`infra/bin/gymtracker.ts`:

```ts
import { App } from 'aws-cdk-lib';
import * as path from 'node:path';
import { GymTrackerStack, type WarmUpSchedule } from '../lib/gymtracker-stack';

const app = new App();
const env = { account: app.node.getContext('account') as string, region: app.node.getContext('region') as string };

new GymTrackerStack(app, 'GymTrackerStack', {
  env,
  description: 'GymTracker: CloudFront + S3, API Gateway + Lambda (Bref), Aurora Serverless v2',
  backendPath: path.join(__dirname, '../../backend'),
  frontendPath: path.join(__dirname, '../../frontend/dist/frontend/browser'),
  warmUp: app.node.getContext('warmUp') as WarmUpSchedule,
});
```

- [ ] **Step 6: Tests + typecheck**

Run: `cd infra && npm test && npm run typecheck`
Expected: PASS (4 tests), `tsc` sin errores.

- [ ] **Step 7: Commit**

```bash
git add infra
git commit -m "feat(infra): add CDK project with isolated VPC and auto-pausing Aurora Serverless v2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Backend en Lambda (Bref) + HTTP API + despertar programado

**Files:**
- Create: `infra/lib/backend.ts`, `infra/lib/warm-up.ts`, `infra/test/backend.test.ts`
- Modify: `infra/lib/gymtracker-stack.ts`

**Interfaces:**
- Consumes: `Database`, `DB_NAME`, `DB_USER`, `AppKey`, `DbPassword`.
- Produces: `Backend` con:
  - `http: PhpFpmFunction`, nombre `gymtracker-http`;
  - `artisan: ConsoleFunction`, nombre `gymtracker-artisan`;
  - `api: apigwv2.HttpApi`.
- Produces: `WarmUp(scope, id, { target, schedule })`. `WarmUpSchedule` se mueve a `lib/warm-up.ts` y `gymtracker-stack.ts` la reexporta.

- [ ] **Step 1: Write the failing test**

`infra/test/backend.test.ts`:

```ts
import { Match } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { synth } from './helpers';

describe('Backend', () => {
  const template = synth();

  const sharedEnv = {
    APP_ENV: 'production',
    APP_DEBUG: 'false',
    APP_KEY: { Ref: 'AppKey' },
    LOG_CHANNEL: 'stderr',
    DB_CONNECTION: 'pgsql',
    DB_HOST: { 'Fn::GetAtt': [Match.stringLikeRegexp('DatabaseCluster'), 'Endpoint.Address'] },
    DB_DATABASE: 'gymtracker',
    DB_USERNAME: 'gymtracker',
    DB_PASSWORD: { Ref: 'DbPassword' },
    DB_SSLMODE: 'require',
    SESSION_DRIVER: 'database',
    SESSION_SECURE_COOKIE: 'true',
    CACHE_STORE: 'database',
  };

  it('runs Laravel over PHP-FPM inside the isolated subnets', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gymtracker-http',
      Handler: 'public/index.php',
      Runtime: 'provided.al2023',
      Timeout: 28,
      VpcConfig: Match.objectLike({ SecurityGroupIds: Match.anyValue(), SubnetIds: Match.anyValue() }),
      Environment: { Variables: Match.objectLike({ ...sharedEnv, BREF_RUNTIME: 'fpm' }) },
    });
  });

  it('has a console function for artisan with a longer timeout', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gymtracker-artisan',
      Handler: 'artisan',
      Timeout: 120,
      Environment: { Variables: Match.objectLike({ ...sharedEnv, BREF_RUNTIME: 'console' }) },
    });
  });

  it('exposes the HTTP function through an HTTP API', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: '$default' });
  });

  it('wakes Aurora up before training (Mon, Tue, Thu, Fri 18:45 Santiago)', () => {
    template.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'cron(45 18 ? * MON,TUE,THU,FRI *)',
      ScheduleExpressionTimezone: 'America/Santiago',
      Target: Match.objectLike({
        Arn: { 'Fn::GetAtt': [Match.stringLikeRegexp('BackendArtisan'), 'Arn'] },
        Input: '"app:wake-db"',
      }),
    });
  });

  it('keeps logs for a month', () => {
    template.allResourcesProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd infra && npm test -- test/backend.test.ts`
Expected: FAIL. No existe la función `gymtracker-http`.

- [ ] **Step 3: Implement `Backend`**

`infra/lib/backend.ts`:

```ts
import { ConsoleFunction, PhpFpmFunction, packagePhpCode } from '@bref.sh/constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface BackendProps {
  /** Carpeta de Laravel instalada sin dependencias de desarrollo. */
  readonly codePath: string;
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly environment: Record<string, string>;
}

/** Laravel en Lambda con Bref: una función HTTP (PHP-FPM) y otra de consola (artisan). */
export class Backend extends Construct {
  readonly http: PhpFpmFunction;
  readonly artisan: ConsoleFunction;
  readonly api: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: BackendProps) {
    super(scope, id);

    const code = packagePhpCode(props.codePath, {
      exclude: ['.env', '.env.*', 'storage/logs/*.log', 'database/*.sqlite', 'Dockerfile.dev'],
    });
    const logGroup = (name: string) =>
      new logs.LogGroup(this, `${name}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    const shared = {
      code,
      phpVersion: '8.5' as const,
      memorySize: 1024,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.securityGroup],
      environment: props.environment,
    };

    this.http = new PhpFpmFunction(this, 'Http', {
      ...shared,
      functionName: 'gymtracker-http',
      handler: 'public/index.php',
      logGroup: logGroup('Http'),
    });

    // Migraciones, crear usuario y despertar Aurora: el arranque de Aurora (~15 s) cabe de sobra.
    this.artisan = new ConsoleFunction(this, 'Artisan', {
      ...shared,
      functionName: 'gymtracker-artisan',
      handler: 'artisan',
      timeout: Duration.minutes(2),
      logGroup: logGroup('Artisan'),
    });

    this.api = new apigwv2.HttpApi(this, 'Api', {
      description: 'GymTracker (solo se usa detrás de CloudFront)',
      defaultIntegration: new HttpLambdaIntegration('Laravel', this.http),
    });
  }
}
```

- [ ] **Step 4: Implement `WarmUp`**

`infra/lib/warm-up.ts`:

```ts
import { TimeZone } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as targets from 'aws-cdk-lib/aws-scheduler-targets';
import { Construct } from 'constructs';

export interface WarmUpSchedule {
  readonly minute: string;
  readonly hour: string;
  readonly weekDay: string;
}

export interface WarmUpProps {
  /** Función de consola de Bref; recibe el comando artisan como string JSON. */
  readonly target: lambda.IFunction;
  readonly schedule: WarmUpSchedule;
}

/** Despierta Aurora un rato antes de entrenar para no esperar los ~15 s al abrir la app. */
export class WarmUp extends Construct {
  constructor(scope: Construct, id: string, props: WarmUpProps) {
    super(scope, id);

    new scheduler.Schedule(this, 'Schedule', {
      description: 'Despierta Aurora antes de ir al gimnasio',
      schedule: scheduler.ScheduleExpression.cron({ ...props.schedule, timeZone: TimeZone.AMERICA_SANTIAGO }),
      target: new targets.LambdaInvoke(props.target, {
        input: scheduler.ScheduleTargetInput.fromObject('app:wake-db'),
        retryAttempts: 0,
      }),
    });
  }
}
```

- [ ] **Step 5: Wire them into the stack**

En `infra/lib/gymtracker-stack.ts`:
- Borrar la interfaz `WarmUpSchedule` y agregar `export type { WarmUpSchedule } from './warm-up';`.
- Imports nuevos:
  - `import { Backend } from './backend';`
  - `import { DB_NAME, DB_USER, Database } from './database';` (reemplaza el import anterior de `Database`)
  - `import { WarmUp, type WarmUpSchedule } from './warm-up';`
- Reemplazar las dos líneas `void …` por:

```ts
    const backend = new Backend(this, 'Backend', {
      codePath: props.backendPath,
      vpc: database.vpc,
      securityGroup: database.clientSecurityGroup,
      environment: {
        APP_NAME: 'GymTracker',
        APP_ENV: 'production',
        APP_DEBUG: 'false',
        APP_KEY: appKey.valueAsString,
        APP_LOCALE: 'es',
        APP_USER_TIMEZONE: 'America/Santiago',
        LOG_CHANNEL: 'stderr',
        LOG_LEVEL: 'warning',
        DB_CONNECTION: 'pgsql',
        DB_HOST: database.cluster.clusterEndpoint.hostname,
        DB_PORT: '5432',
        DB_DATABASE: DB_NAME,
        DB_USERNAME: DB_USER,
        DB_PASSWORD: dbPassword.valueAsString,
        DB_SSLMODE: 'require',
        SESSION_DRIVER: 'database',
        SESSION_SECURE_COOKIE: 'true',
        CACHE_STORE: 'database',
        QUEUE_CONNECTION: 'sync',
      },
    });

    new WarmUp(this, 'WarmUp', { target: backend.artisan, schedule: props.warmUp });
```

- [ ] **Step 6: Tests + typecheck**

Run: `cd infra && npm test && npm run typecheck`
Expected: PASS (9 tests).

Si falla solo el test del Scheduler porque `Input` no es `'"app:wake-db"'`, cambiar `fromObject('app:wake-db')` por `fromText('"app:wake-db"')`. La consola de Bref espera el comando como string JSON.

- [ ] **Step 7: Commit**

```bash
git add infra
git commit -m "feat(infra): run Laravel on Lambda with Bref behind an HTTP API and schedule the Aurora warm-up

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend en S3 + CloudFront (mismo origen para la API)

**Files:**
- Create: `infra/lib/frontend.ts`, `infra/test/frontend.test.ts`, `infra/test/no-cycles.ts`
- Modify: `infra/lib/gymtracker-stack.ts`

**Interfaces:**
- Consumes: `Backend.api`, `Backend.http`, `Backend.artisan`.
- Produces: `Frontend.distribution`. Outputs del stack: `Url` (`https://<dominio>`) y `ArtisanFunction`. `deploy.yml` lee `Url`.

- [ ] **Step 1: Write the failing tests**

`infra/test/no-cycles.ts`: CloudFormation recién detecta los ciclos al desplegar. El cableado `Lambda → CloudFront → HTTP API → Lambda` es justo el caso de riesgo, así que se revisa acá.

```ts
type Node = Record<string, unknown>;

function refsOf(value: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => refsOf(v, out));
  else if (value && typeof value === 'object') {
    const obj = value as Node;
    if (typeof obj.Ref === 'string') out.add(obj.Ref);
    const getAtt = obj['Fn::GetAtt'];
    if (Array.isArray(getAtt) && typeof getAtt[0] === 'string') out.add(getAtt[0]);
    Object.values(obj).forEach((v) => refsOf(v, out));
  }
  return out;
}

/** Devuelve un ciclo de dependencias entre recursos, o null si no hay. */
export function findCycle(template: { Resources: Record<string, Node> }): string[] | null {
  const ids = Object.keys(template.Resources);
  const deps = new Map(
    ids.map((id) => {
      const res = template.Resources[id];
      const set = refsOf(res.Properties ?? {}, new Set());
      const dependsOn = res.DependsOn;
      (Array.isArray(dependsOn) ? dependsOn : dependsOn ? [dependsOn] : []).forEach((d) => set.add(d as string));
      return [id, [...set].filter((d) => d in template.Resources)];
    }),
  );
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of deps.get(id) ?? []) {
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };
  for (const id of ids) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}
```

`infra/test/frontend.test.ts`:

```ts
import { Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { synth } from './helpers';
import { findCycle } from './no-cycles';

describe('Frontend', () => {
  const template = synth();

  it('serves the SPA from a private bucket through CloudFront', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  it('routes /api, /auth and /sanctum to the HTTP API without caching', () => {
    const distribution = Object.values(template.findResources('AWS::CloudFront::Distribution'))[0] as {
      Properties: { DistributionConfig: { CacheBehaviors: { PathPattern: string; AllowedMethods: string[] }[] } };
    };
    const behaviors = distribution.Properties.DistributionConfig.CacheBehaviors;

    expect(behaviors.map((b) => b.PathPattern).sort()).toEqual(['/api/*', '/auth/*', '/sanctum/*']);
    behaviors.forEach((b) => expect(b.AllowedMethods).toContain('POST'));
  });

  it('rewrites SPA routes to index.html with a CloudFront Function, not with error responses', () => {
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp("r.uri = '/index.html'"),
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.absent(),
        DefaultCacheBehavior: Match.objectLike({
          FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
        }),
      }),
    });
  });

  it('tells Laravel its public URL so Sanctum treats the SPA as first-party', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gymtracker-http',
      Environment: {
        Variables: Match.objectLike({
          SANCTUM_STATEFUL_DOMAINS: { 'Fn::GetAtt': [Match.stringLikeRegexp('FrontendCdn'), 'DomainName'] },
          APP_URL: Match.anyValue(),
        }),
      },
    });
    template.hasOutput('Url', Match.anyValue());
    template.hasOutput('ArtisanFunction', Match.anyValue());
  });

  it('uploads the build twice: hashed assets cached for a year, the app shell never cached', () => {
    template.resourceCountIs('Custom::CDKBucketDeployment', 2);
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      SystemMetadata: { 'cache-control': 'public, max-age=31536000, immutable' },
    });
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      SystemMetadata: { 'cache-control': 'no-cache' },
      DistributionPaths: ['/*'],
    });
  });

  it('has no dependency cycles', () => {
    expect(findCycle(template.toJSON())).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd infra && npm test -- test/frontend.test.ts`
Expected: FAIL. Todavía no hay bucket ni distribución.

- [ ] **Step 3: Implement `Frontend`**

`infra/lib/frontend.ts`:

```ts
import { RemovalPolicy } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface FrontendProps {
  /** Salida de `ng build`. */
  readonly distPath: string;
  /** Dominio de la HTTP API (`<id>.execute-api.<región>.amazonaws.com`). */
  readonly apiDomain: string;
}

/** Archivos sin hash en el nombre: deben revalidarse siempre (si no, el SW no ve versiones nuevas). */
const APP_SHELL = [
  'index.html',
  'manifest.webmanifest',
  'ngsw.json',
  'ngsw-worker.js',
  'safety-worker.js',
  'worker-basic.min.js',
];

/** CloudFront delante de S3 (la SPA) y de la API: mismo origen, así Sanctum funciona con cookies. */
export class Frontend extends Construct {
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendProps) {
    super(scope, id);

    const bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Rutas de Angular (/hoy, /rutinas/3…) → index.html. Solo en S3: los 404 de la API llegan intactos.
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event) { var r = event.request; if (r.uri.indexOf('.') === -1) { r.uri = '/index.html'; } return r; }",
      ),
    });

    const api: cloudfront.BehaviorOptions = {
      origin: new origins.HttpOrigin(props.apiDomain, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY }),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    };

    this.distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: 'GymTracker',
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: { '/api/*': api, '/auth/*': api, '/sanctum/*': api },
    });

    // Primero los assets con hash (inmutables; los íconos también: si cambian, se renombran),
    // después el shell que los referencia.
    const assets = new s3deploy.BucketDeployment(this, 'Assets', {
      sources: [s3deploy.Source.asset(props.distPath, { exclude: APP_SHELL })],
      destinationBucket: bucket,
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
    });
    const shell = new s3deploy.BucketDeployment(this, 'Shell', {
      sources: [s3deploy.Source.asset(props.distPath, { exclude: ['*', ...APP_SHELL.map((f) => `!${f}`)] })],
      destinationBucket: bucket,
      prune: false,
      cacheControl: [s3deploy.CacheControl.noCache()],
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
    shell.node.addDependency(assets);
  }
}
```

- [ ] **Step 4: Wire it into the stack**

En `infra/lib/gymtracker-stack.ts`, agregar `CfnOutput` al import de `aws-cdk-lib` e `import { Frontend } from './frontend';`. Después de `new WarmUp(...)`:

```ts
    // La HTTP API (el recurso) no depende de las Lambdas, sus rutas sí: no hay ciclo
    // Lambda → CloudFront → API → Lambda. Lo verifica test/frontend.test.ts.
    const frontend = new Frontend(this, 'Frontend', {
      distPath: props.frontendPath,
      apiDomain: `${backend.api.apiId}.execute-api.${this.region}.${this.urlSuffix}`,
    });
    const domain = frontend.distribution.distributionDomainName;
    for (const fn of [backend.http, backend.artisan]) {
      fn.addEnvironment('APP_URL', `https://${domain}`);
      fn.addEnvironment('SANCTUM_STATEFUL_DOMAINS', domain);
    }

    new CfnOutput(this, 'Url', { value: `https://${domain}`, description: 'URL pública de GymTracker' });
    new CfnOutput(this, 'ArtisanFunction', { value: backend.artisan.functionName });
```

- [ ] **Step 5: Tests + typecheck**

Run: `cd infra && npm test && npm run typecheck`
Expected: PASS (15 tests).

Si falla `has no dependency cycles`:
1. Quitar `defaultIntegration` del `HttpApi`.
2. Agregar después:

```ts
this.api.addRoutes({
  path: '/{proxy+}',
  methods: [apigwv2.HttpMethod.ANY],
  integration: new HttpLambdaIntegration('Laravel', this.http),
});
```

3. Ajustar en `backend.test.ts` el `RouteKey` a `'ANY /{proxy+}'`.

- [ ] **Step 6: Synthesize the real app**

Run: `cd frontend && npx ng build && cd ../infra && npx cdk synth GymTrackerStack --quiet && echo OK`
Expected: `OK`. No hacen falta credenciales: la cuenta y la región vienen de `cdk.json`.

- [ ] **Step 7: Commit**

```bash
git add infra
git commit -m "feat(infra): serve the SPA and the API from one CloudFront origin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: CI/CD con GitHub Actions (OIDC), scripts y documentación

**Files:**
- Create: `infra/lib/github-ci-stack.ts`, `infra/test/github-ci.test.ts`
- Modify: `infra/bin/gymtracker.ts`
- Create: `infra/scripts/init-secrets.sh`, `infra/scripts/artisan.sh`
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: el output `Url` y la función `gymtracker-artisan`.
- Produces:
  - `GymTrackerCiStack`, con el output `DeployRoleArn`;
  - la variable de repo `AWS_DEPLOY_ROLE_ARN` (se crea en la tarea 7);
  - los parámetros SSM `/gymtracker/prod/app-key` y `/gymtracker/prod/db-password`.

- [ ] **Step 1: Write the failing test**

`infra/test/github-ci.test.ts`:

```ts
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { GithubCiStack } from '../lib/github-ci-stack';

function synthCi(oidcProviderArn?: string): Template {
  const app = new App();
  const stack = new GithubCiStack(app, 'Ci', {
    env: { account: '123456789012', region: 'us-east-2' },
    githubRepo: 'LucianoGrasso/gym-tracker',
    oidcProviderArn,
  });
  return Template.fromStack(stack);
}

describe('GithubCiStack', () => {
  it('lets only the main branch of the repo assume the deploy role', () => {
    synthCi().hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'gymtracker-github-deploy',
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub': 'repo:LucianoGrasso/gym-tracker:ref:refs/heads/main',
              },
            },
          }),
        ],
      },
    });
  });

  it('grants only CDK bootstrap roles, the prod secrets and the artisan function', () => {
    synthCi().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'sts:AssumeRole', Resource: Match.stringLikeRegexp('cdk-hnb659fds-') }),
          Match.objectLike({ Action: 'ssm:GetParameter', Resource: Match.stringLikeRegexp('parameter/gymtracker/prod/\\*') }),
          Match.objectLike({ Action: 'lambda:InvokeFunction', Resource: Match.stringLikeRegexp('function:gymtracker-artisan') }),
        ]),
      },
    });
  });

  it('creates the GitHub OIDC provider unless one already exists', () => {
    synthCi().resourceCountIs('AWS::IAM::OIDCProvider', 1);
    synthCi('arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com').resourceCountIs(
      'AWS::IAM::OIDCProvider',
      0,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd infra && npm test -- test/github-ci.test.ts`
Expected: FAIL con `Cannot find module '../lib/github-ci-stack'`.

- [ ] **Step 3: Implement `GithubCiStack`**

`infra/lib/github-ci-stack.ts`: los ARN se arman con `this.account` y `this.region` concretos (el stack tiene `env` explícito), así que en el template quedan como strings literales.

```ts
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GithubCiStackProps extends StackProps {
  /** `owner/repo` en GitHub. */
  readonly githubRepo: string;
  /** ARN de un proveedor OIDC de GitHub que ya exista en la cuenta (solo puede haber uno). */
  readonly oidcProviderArn?: string;
}

/** Rol que GitHub Actions asume con OIDC (sin access keys) para desplegar desde `main`. */
export class GithubCiStack extends Stack {
  constructor(scope: Construct, id: string, props: GithubCiStackProps) {
    super(scope, id, props);

    const providerArn =
      props.oidcProviderArn ??
      new iam.OidcProviderNative(this, 'GithubOidc', {
        url: 'https://token.actions.githubusercontent.com',
        clientIds: ['sts.amazonaws.com'],
      }).oidcProviderArn;

    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'gymtracker-github-deploy',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${props.githubRepo}:ref:refs/heads/main`,
        },
      }),
    });

    const { account, region } = this;
    // cdk deploy usa los roles del bootstrap; este rol solo puede asumirlos.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${account}:role/cdk-hnb659fds-*-${account}-${region}`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:${region}:${account}:parameter/gymtracker/prod/*`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [`arn:aws:lambda:${region}:${account}:function:gymtracker-artisan`],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
```

En `infra/bin/gymtracker.ts`, agregar `import { GithubCiStack } from '../lib/github-ci-stack';` y al final:

```ts
new GithubCiStack(app, 'GymTrackerCiStack', {
  env,
  description: 'GymTracker: rol OIDC para desplegar desde GitHub Actions',
  githubRepo: app.node.getContext('githubRepo') as string,
  oidcProviderArn: app.node.tryGetContext('githubOidcProviderArn') as string | undefined,
});
```

- [ ] **Step 4: Tests + typecheck**

Run: `cd infra && npm test && npm run typecheck`
Expected: PASS (18 tests).

- [ ] **Step 5: Operation scripts**

`infra/scripts/init-secrets.sh`:

```bash
#!/usr/bin/env bash
# Crea los secretos de producción en SSM Parameter Store (SecureString). Idempotente: nunca sobrescribe.
set -euo pipefail
REGION="${AWS_REGION:-us-east-2}"

put() { # nombre valor
  if aws ssm get-parameter --region "$REGION" --name "$1" >/dev/null 2>&1; then
    echo "$1 ya existe (no se toca)"
    return
  fi
  aws ssm put-parameter --region "$REGION" --name "$1" --type SecureString --value "$2" >/dev/null
  echo "$1 creado"
}

put /gymtracker/prod/app-key "base64:$(openssl rand -base64 32)"
# Hex: Aurora no acepta / @ " ni espacios en la contraseña.
put /gymtracker/prod/db-password "$(openssl rand -hex 24)"
```

`infra/scripts/artisan.sh`:

```bash
#!/usr/bin/env bash
# Ejecuta un comando artisan en la Lambda de consola. Uso: infra/scripts/artisan.sh "migrate --force"
set -euo pipefail
REGION="${AWS_REGION:-us-east-2}"
[[ $# -eq 1 ]] || { echo 'uso: artisan.sh "<comando>"' >&2; exit 2; }

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT
PAYLOAD="$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1")"

ERROR="$(aws lambda invoke --region "$REGION" --function-name gymtracker-artisan \
  --cli-binary-format raw-in-base64-out --payload "$PAYLOAD" \
  --query FunctionError --output text "$OUT")"

python3 -c 'import json,sys
d = json.load(open(sys.argv[1]))
print(d.get("output", d) if isinstance(d, dict) else d)' "$OUT"
[[ "$ERROR" == "None" ]] || { echo "artisan falló ($ERROR)" >&2; exit 1; }
```

Run: `chmod +x infra/scripts/*.sh && bash -n infra/scripts/init-secrets.sh && bash -n infra/scripts/artisan.sh && echo OK`
Expected: `OK`.

- [ ] **Step 6: Workflows**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches-ignore: [main]
  workflow_call:

permissions:
  contents: read

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v5
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.5'
          coverage: none
      - run: composer install --no-interaction --prefer-dist
      - run: cp .env.example .env && php artisan key:generate
      - run: ./vendor/bin/pint --test
      - run: ./vendor/bin/pest

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npx ng test --watch=false
      - run: npx ng build

  infra:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: infra
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: infra/package-lock.json
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  ci:
    uses: ./.github/workflows/ci.yml

  deploy:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    env:
      AWS_REGION: us-east-2
    steps:
      - uses: actions/checkout@v5

      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.5'
          coverage: none
      - name: Backend sin dependencias de desarrollo
        working-directory: backend
        run: composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist

      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: |
            frontend/package-lock.json
            infra/package-lock.json
      - name: Build del frontend
        working-directory: frontend
        run: npm ci && npx ng build
      - name: Dependencias de CDK
        working-directory: infra
        run: npm ci

      - uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-2

      - name: Leer secretos de SSM
        run: |
          for name in app-key db-password; do
            value="$(aws ssm get-parameter --name "/gymtracker/prod/$name" --with-decryption --query Parameter.Value --output text)"
            echo "::add-mask::$value"
            echo "SECRET_$(echo "$name" | tr 'a-z-' 'A-Z_')=$value" >> "$GITHUB_ENV"
          done

      - name: Desplegar
        working-directory: infra
        run: >
          npx cdk deploy GymTrackerStack --require-approval never
          --parameters AppKey="$SECRET_APP_KEY"
          --parameters DbPassword="$SECRET_DB_PASSWORD"
          --outputs-file outputs.json

      - name: Migrar
        run: infra/scripts/artisan.sh "migrate --force"

      - name: Probar
        run: |
          URL="$(python3 -c "import json; print(json.load(open('infra/outputs.json'))['GymTrackerStack']['Url'])")"
          curl -fsS --retry 6 --retry-delay 10 --retry-all-errors "$URL/api/health"
          curl -fsS -o /dev/null "$URL/hoy"
          echo "### Desplegado en $URL" >> "$GITHUB_STEP_SUMMARY"
```

Run: `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]; print('OK')" .github/workflows/ci.yml .github/workflows/deploy.yml`
Expected: `OK`. Si no hay PyYAML: `npx --yes yaml-lint@1 .github/workflows/*.yml`.

- [ ] **Step 7: Docs**

En `README.md`, agregar una sección `## Producción (AWS)` con:
- La URL (se completa en la tarea 7).
- El diagrama de la spec §10.
- Cómo se despliega: push a `main` → workflow `Deploy`.
- Los comandos `infra/scripts/artisan.sh "migrate:status"` e `infra/scripts/artisan.sh "app:create-user <email> <nombre> --password=<pwd> --seed"`.
- Dónde viven los secretos (`/gymtracker/prod/*` en SSM).
- Cómo cambiar el horario del despertar (`infra/cdk.json` → `context.warmUp`, luego push).
- La advertencia de no correr `cdk deploy GymTrackerStack` desde el PC.

En `CLAUDE.md`:
- En `## Comandos`, agregar:
  - `- Tests infra: \`cd infra && npm test\`.`
  - `- Artisan en producción: \`infra/scripts/artisan.sh "<comando>"\` (requiere \`aws login\`).`
- En `## Convenciones`, agregar:
  - `- Producción: se despliega solo desde GitHub Actions (push a main). Secretos en SSM \`/gymtracker/prod/*\`, pasados como parámetros NoEcho.`

- [ ] **Step 8: Commit**

```bash
git add infra .github README.md CLAUDE.md
git commit -m "ci: add GitHub Actions CI and OIDC-based deploy to AWS, plus operation scripts and docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Primer despliegue (con aprobación) y prueba en el celular

Esta tarea toca AWS de verdad. Cada paso con ⚠️ se ejecuta solo después de que Luciano lo apruebe.

**Files:**
- Modify: `README.md` (URL final)

- [ ] **Step 1: AWS session**

Run: `aws sts get-caller-identity --query Account --output text`
Expected: `000000000000`. Si la sesión expiró, pedir a Luciano `! aws login`.

- [ ] **Step 2: Confirm prices with the Pricing API**

```bash
price() { # usagetype
  aws pricing get-products --region us-east-1 --service-code AmazonRDS \
    --filters Type=TERM_MATCH,Field=regionCode,Value=us-east-2 Type=TERM_MATCH,Field=usagetype,Value="$1" \
    --query 'PriceList[0]' --output text |
  python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print('$1', [p['pricePerUnit']['USD'] + '/' + p['unit'] for t in d['terms']['OnDemand'].values() for p in t['priceDimensions'].values()])"
}
price USE2-Aurora:ServerlessV2Usage
price USE2-Aurora:StorageUsage
price USE2-Aurora:StorageIOUsage
```

Recalcular la tabla "Costo estimado" con los precios reales y mostrársela a Luciano. **Detenerse y esperar su OK.**

- [ ] **Step 3: ⚠️ CDK bootstrap (if needed) + secrets**

```bash
aws cloudformation describe-stacks --region us-east-2 --stack-name CDKToolkit --query 'Stacks[0].StackStatus' --output text \
  || (cd infra && npx cdk bootstrap aws://000000000000/us-east-2)
infra/scripts/init-secrets.sh
```

- [ ] **Step 4: ⚠️ CI role (from the PC, once)**

```bash
EXISTING=$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')].Arn" --output text)
cd infra && npx cdk deploy GymTrackerCiStack --require-approval never --outputs-file ci-outputs.json \
  ${EXISTING:+-c githubOidcProviderArn=$EXISTING}
ROLE=$(python3 -c "import json; print(json.load(open('ci-outputs.json'))['GymTrackerCiStack']['DeployRoleArn'])")
gh variable set AWS_DEPLOY_ROLE_ARN --body "$ROLE" --repo LucianoGrasso/gym-tracker
rm ci-outputs.json
```

- [ ] **Step 5: CI on the branch**

Run: `git push -u origin fase-5a-despliegue`, luego `gh run watch --exit-status $(gh run list --branch fase-5a-despliegue --workflow CI --limit 1 --json databaseId -q '.[0].databaseId')`
Expected: `backend`, `frontend` e `infra` en verde.

- [ ] **Step 6: ⚠️ Merge to main and watch the deploy**

Solo cuando Luciano diga "intégralo a main":

```bash
git push . HEAD:main && git checkout main && git push origin main
gh run watch --exit-status $(gh run list --branch main --workflow Deploy --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected:
- `Deploy` en verde. El primer despliegue tarda unos 15 a 25 minutos.
- El resumen del run muestra la URL.
- Si falla: `gh run view --log-failed` y superpowers:systematic-debugging.

- [ ] **Step 7: ⚠️ Production user (Luciano runs it himself, so the password doesn't go through the chat)**

```
! read -rsp "Contraseña: " P && infra/scripts/artisan.sh "app:create-user <su-email> Luciano --password=$P --seed"; unset P
```

- [ ] **Step 8: End-to-end check against production**

1. Adaptar `/tmp/claude-1000/-home-luciano-Proyecto-Gym-Tracker/7dfc8e04-0e03-489f-9225-cc32d077eaae/scratchpad/verify-fase4.sh`:
   - `BASE` = la URL de producción;
   - un usuario temporal creado con `infra/scripts/artisan.sh`;
   - verificar login, `PUT` de entrenamiento y series, y `GET /api/stats/overview`.
2. Borrar los workouts del usuario temporal y después el usuario.
3. Con chrome-devtools en emulación móvil, revisar:
   - que no haya errores en la consola;
   - que `navigator.serviceWorker.controller` no sea `null` tras recargar;
   - que el manifest no tenga advertencias.

- [ ] **Step 9: Phone test (Luciano)**

1. Abrir la URL, iniciar sesión y ver la rutina en "Hoy". Revisar también las estadísticas de la fase 4.
2. Instalar la app: en Android, Chrome → "Instalar app"; en iPhone, Safari → Compartir → "Agregar a inicio".
3. Probar offline: con modo avión, abrir la app instalada, registrar una serie y desactivar el modo avión. La serie debe sincronizarse.

- [ ] **Step 10: Docs + memory + commit**

1. Completar la URL en `README.md`.
2. Actualizar la memoria `gymtracker-stack.md`: URL, fase 5a desplegada, y que lo siguiente es la fase 5b.

```bash
git add README.md
git commit -m "docs: add production URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

---

## Costo estimado (us-east-2, a validar en la tarea 7, step 2)

Supuesto: 4 sesiones por semana de unos 1,5 h, más 10 min de auto-pausa, más el despertar 15 min antes. Eso da unas 35 h/mes, más unas 10 h de uso suelto: **unas 45 h/mes a 0,5 ACU**.

| Servicio | Cálculo | USD/mes |
|---|---|---|
| Aurora Serverless v2 (cómputo) | 45 h × 0,5 ACU × 0,12 | ~2,70 |
| Aurora (almacenamiento + I/O) | <1 GB × 0,10 + <1 M I/O × 0,20 | ~0,20 |
| Backups de Aurora (7 días) | dentro del tamaño de la BD | 0 |
| Lambda + API Gateway HTTP | capa gratuita / USD 1 por millón | ~0 |
| CloudFront + S3 | capa gratuita | ~0 |
| CloudWatch Logs (30 días) | pocos MB | ~0,05 |
| SSM Parameter Store + KMS `aws/ssm` | gratis | 0 |
| NAT, RDS Proxy, VPC endpoints, IPv4 pública | no se usan | 0 |
| **Total** | | **~USD 3** |
