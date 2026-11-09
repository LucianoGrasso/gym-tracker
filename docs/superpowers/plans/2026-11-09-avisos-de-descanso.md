# Avisos de descanso (Web Push) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notificación push "¡Descanso terminado!" cuando termina el descanso, aunque el teléfono esté bloqueado.

**Architecture:** Laravel firma (HMAC) la suscripción push del dispositivo. Una Lambda Node aparte, fuera de la VPC, verifica la firma, crea un horario de una sola vez en EventBridge Scheduler y, cuando este la invoca, manda el push con VAPID. Angular usa `SwPush` y el service worker `ngsw` ya existente para mostrar la notificación.

**Tech Stack:** Laravel 13 + Pest; Node 22 + `web-push` + `@aws-sdk/client-scheduler`; CDK (`NodejsFunction`, `aws-scheduler`, `aws-apigatewayv2`); Angular 22 (`SwPush`, Signals) + Vitest.

Spec: `docs/superpowers/specs/2026-11-09-avisos-de-descanso-design.md`. Rama: `avisos-descanso`.

## Global Constraints

- Textos de UI en español de Chile; código, nombres y comentarios técnicos en inglés salvo los comentarios explicativos existentes (en español, como el resto del repo).
- Laravel sigue apto para Lambda: sin tablas nuevas, sin escribir en disco.
- Lambda de push: nombre `gymtracker-push`, Node 22, **fuera de la VPC**, no toca Aurora.
- Grupo de horarios `gymtracker-rest`; nombre de horario `rest-<primeros 32 hex de sha256(endpoint)>`; `FlexibleTimeWindow: OFF`; `ActionAfterCompletion: DELETE`.
- Firma: `hex(HMAC-SHA256(endpoint, PUSH_SIGNING_KEY))`. Vector compartido: clave `test-signing-key`, endpoint `https://push.example.com/send/abc` → `dfad34ed1137f5f974053060f49ea947a78018b6f8dbb6ec21c1899314ba4555`.
- Validación Lambda: endpoint `https://` (máx. 1000); `seconds` entero 1–3600; `title`/`body` 1–120; `url` empieza con `/` y no con `//` (máx. 200).
- Título fijo: `¡Descanso terminado!`. Texto: `<ejercicio> · serie <n> de <total>` o `<ejercicio> · serie <n>` si no hay total o ya se pasó.
- Rutas: `GET /api/push/config`, `POST /api/push/token` (Laravel, con sesión); `POST /push/rest`, `POST /push/cancel` (Lambda).
- SSM: `/gymtracker/prod/push-signing-key`, `/gymtracker/prod/vapid-public-key`, `/gymtracker/prod/vapid-private-key`. Parámetros CFN: `PushSigningKey` (NoEcho), `VapidPrivateKey` (NoEcho), `VapidPublicKey`.
- Errores al programar/cancelar desde la app se ignoran (la barra y la vibración siguen funcionando).
- Composer dentro de Docker (`docker compose exec -T backend composer …`); npm con reintentos si la red falla.
- Un commit por tarea, mensaje en inglés estilo Conventional Commits, terminado con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `backend/app/Services/Push/PushSigner.php` | Firma HMAC de un endpoint |
| `backend/app/Http/Requests/PushTokenRequest.php` | Valida `endpoint` |
| `backend/app/Http/Controllers/PushController.php` | `config` (clave pública) y `token` (firma) |
| `infra/lambda/push/core.ts` | Funciones puras: firma, validación, nombre/expresión del horario, payload |
| `infra/lambda/push/handler.ts` | Enruta eventos HTTP/Scheduler usando dependencias inyectadas |
| `infra/lambda/push/index.ts` | Adaptador real: SDK de Scheduler + `web-push` |
| `infra/lib/push.ts` | Construct CDK: Lambda, grupo, roles, ruta |
| `frontend/src/app/core/models/push.ts` | Tipos compartidos de push |
| `frontend/src/app/core/api/push-api.ts` | HTTP: config, token, rest, cancel |
| `frontend/src/app/core/push/push.service.ts` | Estado por dispositivo, activar/desactivar, programar/cancelar |
| `frontend/src/app/core/workout/rest-timer.service.ts` | Conecta el temporizador con `PushService` |
| `frontend/src/app/shared/ui/rest-timer-bar.ts` | Tarjeta de primera vez |
| `frontend/src/app/features/account/account-menu.ts` | Interruptor "Avisos de descanso" |

---

### Task 1: Laravel — firma y clave pública

**Files:**
- Create: `backend/app/Services/Push/PushSigner.php`
- Create: `backend/app/Http/Requests/PushTokenRequest.php`
- Create: `backend/app/Http/Controllers/PushController.php`
- Modify: `backend/config/services.php` (agregar clave `push` antes del cierre `];`)
- Modify: `backend/routes/api.php` (import + 2 rutas dentro de `auth:sanctum`)
- Modify: `backend/phpunit.xml` (2 `<env>`), `backend/.env.example` (2 variables)
- Test: `backend/tests/Feature/Services/PushSignerTest.php`, `backend/tests/Feature/Api/PushTest.php`

**Interfaces:**
- Produces: `GET /api/push/config` → `{ "data": { "public_key": string|null } }`; `POST /api/push/token {endpoint}` → `{ "data": { "signature": string } }`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/Feature/Services/PushSignerTest.php`:

```php
<?php

use App\Services\Push\PushSigner;

it('signs an endpoint with HMAC-SHA256 (same vector as the push Lambda)', function () {
    config()->set('services.push.signing_key', 'test-signing-key');

    expect(app(PushSigner::class)->sign('https://push.example.com/send/abc'))
        ->toBe('dfad34ed1137f5f974053060f49ea947a78018b6f8dbb6ec21c1899314ba4555');
});

it('refuses to sign without a key', function () {
    config()->set('services.push.signing_key', null);

    app(PushSigner::class)->sign('https://push.example.com/send/abc');
})->throws(RuntimeException::class);
```

`backend/tests/Feature/Api/PushTest.php`:

```php
<?php

use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    config()->set('services.push.signing_key', 'test-signing-key');
    config()->set('services.push.vapid_public_key', 'BPublicKey');
});

it('requires authentication', function () {
    $this->getJson('/api/push/config')->assertUnauthorized();
    $this->postJson('/api/push/token', ['endpoint' => 'https://push.example.com/send/abc'])->assertUnauthorized();
});

it('returns the VAPID public key', function () {
    $this->actingAs($this->user)->getJson('/api/push/config')
        ->assertOk()
        ->assertExactJson(['data' => ['public_key' => 'BPublicKey']]);
});

it('signs the subscription endpoint', function () {
    $this->actingAs($this->user)
        ->postJson('/api/push/token', ['endpoint' => 'https://push.example.com/send/abc'])
        ->assertOk()
        ->assertExactJson(['data' => ['signature' => 'dfad34ed1137f5f974053060f49ea947a78018b6f8dbb6ec21c1899314ba4555']]);
});

it('rejects endpoints that are not https URLs', function (mixed $endpoint) {
    $this->actingAs($this->user)
        ->postJson('/api/push/token', ['endpoint' => $endpoint])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('endpoint');
})->with([
    'missing' => [null],
    'http' => ['http://push.example.com/send/abc'],
    'not a url' => ['hola'],
    'too long' => ['https://push.example.com/'.str_repeat('a', 1000)],
]);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Services/PushSignerTest.php tests/Feature/Api/PushTest.php`
Expected: FAIL (`Class "App\Services\Push\PushSigner" not found`, rutas 404).

- [ ] **Step 3: Implement**

`backend/app/Services/Push/PushSigner.php`:

```php
<?php

namespace App\Services\Push;

use RuntimeException;

/** Firma la suscripción push de un dispositivo; la Lambda de push verifica la firma con la misma clave. */
class PushSigner
{
    public function sign(string $endpoint): string
    {
        $key = config('services.push.signing_key');

        if (! is_string($key) || $key === '') {
            throw new RuntimeException('PUSH_SIGNING_KEY no está configurada.');
        }

        return hash_hmac('sha256', $endpoint, $key);
    }
}
```

`backend/app/Http/Requests/PushTokenRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class PushTokenRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'endpoint' => ['required', 'string', 'url', 'starts_with:https://', 'max:1000'],
        ];
    }
}
```

`backend/app/Http/Controllers/PushController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\PushTokenRequest;
use App\Services\Push\PushSigner;
use Illuminate\Http\JsonResponse;

class PushController extends Controller
{
    public function config(): JsonResponse
    {
        return response()->json(['data' => ['public_key' => config('services.push.vapid_public_key')]]);
    }

    public function token(PushTokenRequest $request, PushSigner $signer): JsonResponse
    {
        return response()->json(['data' => ['signature' => $signer->sign($request->validated('endpoint'))]]);
    }
}
```

En `backend/config/services.php`, antes del `];` final:

```php
    'push' => [
        'signing_key' => env('PUSH_SIGNING_KEY'),
        'vapid_public_key' => env('PUSH_VAPID_PUBLIC_KEY'),
    ],
```

En `backend/routes/api.php`: agregar `use App\Http\Controllers\PushController;` en orden alfabético (después de `InvitationController`), y dentro del grupo `auth:sanctum`, justo después de las rutas de invitaciones:

```php
    Route::get('/push/config', [PushController::class, 'config']);
    Route::post('/push/token', [PushController::class, 'token']);
```

En `backend/phpunit.xml`, junto a los otros `<env>`:

```xml
        <env name="PUSH_SIGNING_KEY" value="test-signing-key"/>
        <env name="PUSH_VAPID_PUBLIC_KEY" value=""/>
```

En `backend/.env.example`, al final:

```
PUSH_SIGNING_KEY=dev-push-signing-key-change-me-0123456789
PUSH_VAPID_PUBLIC_KEY=
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./vendor/bin/pest`
Expected: todo en verde (los anteriores más los nuevos).

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(push): sign push subscriptions and expose the VAPID public key"
```

---

### Task 2: Lambda de push — lógica pura y handler

**Files:**
- Modify: `infra/package.json` (deps), `infra/tsconfig.json` (`include`)
- Create: `infra/lambda/push/core.ts`, `infra/lambda/push/handler.ts`
- Test: `infra/test/push-handler.test.ts`

**Interfaces:**
- Produces (`core.ts`): `PushSubscriptionJson`, `RestRequest`, `CancelRequest`, `SendEvent`, `sign(endpoint, key)`, `verify(endpoint, signature, key)`, `scheduleName(endpoint)`, `atExpression(date)`, `parseRest(input)`, `parseCancel(input)`, `notificationPayload({title, body, url})`.
- Produces (`handler.ts`): `ScheduleInput`, `Deps`, `HttpEvent`, `HttpResult`, `createHandler(deps)`.

- [ ] **Step 1: Install dependencies**

```bash
cd infra
npm install web-push @aws-sdk/client-scheduler
npm install -D esbuild @types/web-push
```

Si la red falla, reintentar. En `infra/tsconfig.json` cambiar `"include": ["bin", "lib", "test"]` por `"include": ["bin", "lib", "lambda", "test"]`.

- [ ] **Step 2: Write the failing test**

`infra/test/push-handler.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { atExpression, notificationPayload, scheduleName, sign, verify } from '../lambda/push/core';
import { createHandler, type Deps, type HttpEvent } from '../lambda/push/handler';

const KEY = 'test-signing-key';
const ENDPOINT = 'https://push.example.com/send/abc';
const SIGNATURE = 'dfad34ed1137f5f974053060f49ea947a78018b6f8dbb6ec21c1899314ba4555';
const subscription = { endpoint: ENDPOINT, keys: { p256dh: 'p256', auth: 'auth' } };
const rest = {
  subscription,
  signature: SIGNATURE,
  seconds: 90,
  title: '¡Descanso terminado!',
  body: 'Press de banca · serie 3 de 4',
  url: '/entrenamiento/01JABC',
};

const post = (rawPath: string, body: unknown): HttpEvent => ({
  rawPath,
  requestContext: { http: { method: 'POST' } },
  body: typeof body === 'string' ? body : JSON.stringify(body),
  isBase64Encoded: false,
});

describe('push core', () => {
  it('signs exactly like Laravel and verifies in constant time', () => {
    expect(sign(ENDPOINT, KEY)).toBe(SIGNATURE);
    expect(verify(ENDPOINT, SIGNATURE, KEY)).toBe(true);
    expect(verify(ENDPOINT, SIGNATURE.replace('d', 'e'), KEY)).toBe(false);
    expect(verify(ENDPOINT, 'abc', KEY)).toBe(false);
    expect(verify('https://other.example.com', SIGNATURE, KEY)).toBe(false);
  });

  it('derives one stable schedule name per device', () => {
    expect(scheduleName(ENDPOINT)).toMatch(/^rest-[0-9a-f]{32}$/);
    expect(scheduleName(ENDPOINT)).toBe(scheduleName(ENDPOINT));
    expect(scheduleName('https://other.example.com')).not.toBe(scheduleName(ENDPOINT));
  });

  it('builds a one-time UTC expression to the second', () => {
    expect(atExpression(new Date('2026-11-09T22:01:30.400Z'))).toBe('at(2026-11-09T22:01:30)');
  });

  it('builds the payload Angular service worker understands', () => {
    expect(JSON.parse(notificationPayload({ title: 'T', body: 'B', url: '/entrenamiento/1' }))).toEqual({
      notification: {
        title: 'T',
        body: 'B',
        icon: '/icons/icon-192.png',
        tag: 'rest',
        renotify: true,
        data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: '/entrenamiento/1' } } },
      },
    });
  });
});

describe('push handler', () => {
  const upsert = vi.fn();
  const remove = vi.fn();
  const sendPush = vi.fn();
  const deps: Deps = {
    scheduler: { upsert, remove },
    sendPush,
    now: () => new Date('2026-11-09T22:00:00.000Z'),
    config: {
      signingKey: KEY,
      group: 'gymtracker-rest',
      roleArn: 'arn:aws:iam::1:role/scheduler',
      targetArn: 'arn:aws:lambda:us-east-2:1:function:gymtracker-push',
    },
  };
  const handler = createHandler(deps);

  beforeEach(() => {
    upsert.mockReset().mockResolvedValue(undefined);
    remove.mockReset().mockResolvedValue(undefined);
    sendPush.mockReset().mockResolvedValue('sent');
  });

  it('schedules the push for now + seconds, carrying everything needed to send it', async () => {
    expect(await handler(post('/push/rest', rest))).toEqual({ statusCode: 204 });

    expect(upsert).toHaveBeenCalledWith({
      name: scheduleName(ENDPOINT),
      group: 'gymtracker-rest',
      expression: 'at(2026-11-09T22:01:30)',
      roleArn: deps.config.roleArn,
      targetArn: deps.config.targetArn,
      input: expect.any(String),
    });
    expect(JSON.parse(upsert.mock.calls[0][0].input)).toEqual({
      kind: 'send',
      subscription,
      title: rest.title,
      body: rest.body,
      url: rest.url,
    });
  });

  it('rejects a forged signature', async () => {
    expect(await handler(post('/push/rest', { ...rest, signature: '0'.repeat(64) }))).toEqual({ statusCode: 403 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['broken json', '{'],
    ['zero seconds', { ...rest, seconds: 0 }],
    ['too many seconds', { ...rest, seconds: 3601 }],
    ['fractional seconds', { ...rest, seconds: 1.5 }],
    ['http endpoint', { ...rest, subscription: { ...subscription, endpoint: 'http://push.example.com' } }],
    ['missing keys', { ...rest, subscription: { endpoint: ENDPOINT } }],
    ['empty body', { ...rest, body: '' }],
    ['long title', { ...rest, title: 'x'.repeat(121) }],
    ['absolute url', { ...rest, url: 'https://evil.example.com' }],
    ['protocol-relative url', { ...rest, url: '//evil.example.com' }],
  ])('rejects invalid input: %s', async (_name, body) => {
    expect(await handler(post('/push/rest', body))).toEqual({ statusCode: 422 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('cancels the device schedule', async () => {
    expect(await handler(post('/push/cancel', { endpoint: ENDPOINT, signature: SIGNATURE }))).toEqual({
      statusCode: 204,
    });
    expect(remove).toHaveBeenCalledWith(scheduleName(ENDPOINT), 'gymtracker-rest');
  });

  it('validates cancel requests too', async () => {
    expect(await handler(post('/push/cancel', { endpoint: ENDPOINT, signature: '0'.repeat(64) }))).toEqual({
      statusCode: 403,
    });
    expect(await handler(post('/push/cancel', { endpoint: ENDPOINT }))).toEqual({ statusCode: 422 });
    expect(remove).not.toHaveBeenCalled();
  });

  it('reads base64 bodies', async () => {
    const event = {
      ...post('/push/rest', ''),
      body: Buffer.from(JSON.stringify(rest)).toString('base64'),
      isBase64Encoded: true,
    };
    expect(await handler(event)).toEqual({ statusCode: 204 });
  });

  it('answers 404 and 405 for anything else', async () => {
    expect(await handler(post('/push/other', rest))).toEqual({ statusCode: 404 });
    expect(await handler({ ...post('/push/rest', rest), requestContext: { http: { method: 'GET' } } })).toEqual({
      statusCode: 405,
    });
  });

  it('sends the push when the scheduler fires', async () => {
    await handler({ kind: 'send', subscription, title: rest.title, body: rest.body, url: rest.url });

    expect(sendPush).toHaveBeenCalledWith(subscription, notificationPayload(rest));
  });

  it('does not fail when the subscription expired', async () => {
    sendPush.mockResolvedValue('gone');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(handler({ kind: 'send', subscription, title: 'T', body: 'B', url: '/' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd infra && npx vitest run test/push-handler.test.ts`
Expected: FAIL (`Cannot find module '../lambda/push/core'`).

- [ ] **Step 4: Implement**

`infra/lambda/push/core.ts`:

```ts
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface RestRequest {
  subscription: PushSubscriptionJson;
  signature: string;
  seconds: number;
  title: string;
  body: string;
  url: string;
}

export interface CancelRequest {
  endpoint: string;
  signature: string;
}

/** Lo que Scheduler le devuelve a la Lambda cuando se cumple la hora. */
export interface SendEvent {
  kind: 'send';
  subscription: PushSubscriptionJson;
  title: string;
  body: string;
  url: string;
}

const MAX_SECONDS = 3600;

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= max;

const isHttps = (value: unknown): value is string => isText(value, 1000) && value.startsWith('https://');

/** Solo rutas internas de la app: nada de URLs absolutas ni `//otro-sitio`. */
const isAppPath = (value: unknown): value is string =>
  isText(value, 200) && value.startsWith('/') && !value.startsWith('//');

export function sign(endpoint: string, key: string): string {
  return createHmac('sha256', key).update(endpoint).digest('hex');
}

export function verify(endpoint: string, signature: string, key: string): boolean {
  const expected = Buffer.from(sign(endpoint, key), 'hex');
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Un horario por dispositivo: un descanso nuevo reemplaza al anterior. */
export function scheduleName(endpoint: string): string {
  return `rest-${createHash('sha256').update(endpoint).digest('hex').slice(0, 32)}`;
}

export function atExpression(date: Date): string {
  return `at(${date.toISOString().slice(0, 19)})`;
}

export function parseRest(input: unknown): RestRequest | null {
  if (typeof input !== 'object' || input === null) return null;
  const b = input as Record<string, unknown>;
  const sub = (b['subscription'] ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  const { signature, seconds, title, body, url } = b;

  if (!isHttps(endpoint) || !isText(p256dh, 200) || !isText(auth, 100) || !isText(signature, 128)) return null;
  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SECONDS) return null;
  if (!isText(title, 120) || !isText(body, 120) || !isAppPath(url)) return null;

  return { subscription: { endpoint, keys: { p256dh, auth } }, signature, seconds, title, body, url };
}

export function parseCancel(input: unknown): CancelRequest | null {
  if (typeof input !== 'object' || input === null) return null;
  const { endpoint, signature } = input as Record<string, unknown>;
  return isHttps(endpoint) && isText(signature, 128) ? { endpoint, signature } : null;
}

/** Formato que entiende el service worker de Angular (ngsw): muestra la notificación y abre `url` al tocarla. */
export function notificationPayload(n: { title: string; body: string; url: string }): string {
  return JSON.stringify({
    notification: {
      title: n.title,
      body: n.body,
      icon: '/icons/icon-192.png',
      tag: 'rest',
      renotify: true,
      data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: n.url } } },
    },
  });
}
```

`infra/lambda/push/handler.ts`:

```ts
import {
  atExpression,
  notificationPayload,
  parseCancel,
  parseRest,
  scheduleName,
  verify,
  type PushSubscriptionJson,
  type SendEvent,
} from './core';

export interface ScheduleInput {
  name: string;
  group: string;
  expression: string;
  roleArn: string;
  targetArn: string;
  input: string;
}

export interface Deps {
  scheduler: {
    upsert(schedule: ScheduleInput): Promise<void>;
    remove(name: string, group: string): Promise<void>;
  };
  sendPush(subscription: PushSubscriptionJson, payload: string): Promise<'sent' | 'gone'>;
  now(): Date;
  config: { signingKey: string; group: string; roleArn: string; targetArn: string };
}

/** Lo que usamos del evento de API Gateway HTTP API (payload 2.0). */
export interface HttpEvent {
  rawPath: string;
  requestContext: { http: { method: string } };
  body?: string;
  isBase64Encoded?: boolean;
}

export interface HttpResult {
  statusCode: number;
}

const status = (statusCode: number): HttpResult => ({ statusCode });

function readJson(event: HttpEvent): unknown {
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : (event.body ?? '');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Una sola Lambda: la llama la app (HTTP) para programar/cancelar, y Scheduler para enviar. */
export function createHandler(deps: Deps) {
  const { config } = deps;

  async function rest(body: unknown): Promise<HttpResult> {
    const request = parseRest(body);
    if (!request) return status(422);
    if (!verify(request.subscription.endpoint, request.signature, config.signingKey)) return status(403);

    const at = new Date(deps.now().getTime() + request.seconds * 1000);
    const input: SendEvent = {
      kind: 'send',
      subscription: request.subscription,
      title: request.title,
      body: request.body,
      url: request.url,
    };
    await deps.scheduler.upsert({
      name: scheduleName(request.subscription.endpoint),
      group: config.group,
      expression: atExpression(at),
      roleArn: config.roleArn,
      targetArn: config.targetArn,
      input: JSON.stringify(input),
    });
    return status(204);
  }

  async function cancel(body: unknown): Promise<HttpResult> {
    const request = parseCancel(body);
    if (!request) return status(422);
    if (!verify(request.endpoint, request.signature, config.signingKey)) return status(403);

    await deps.scheduler.remove(scheduleName(request.endpoint), config.group);
    return status(204);
  }

  async function send(event: SendEvent): Promise<void> {
    const outcome = await deps.sendPush(event.subscription, notificationPayload(event));
    if (outcome === 'gone') console.warn(`Suscripción vencida: ${scheduleName(event.subscription.endpoint)}`);
  }

  return async (event: HttpEvent | SendEvent): Promise<HttpResult | void> => {
    if ('kind' in event && event.kind === 'send') return send(event);

    const http = event as HttpEvent;
    if (http.requestContext?.http?.method !== 'POST') return status(405);
    if (http.rawPath === '/push/rest') return rest(readJson(http));
    if (http.rawPath === '/push/cancel') return cancel(readJson(http));
    return status(404);
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd infra && npx vitest run test/push-handler.test.ts && npm run typecheck`
Expected: PASS, sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add infra/package.json infra/package-lock.json infra/tsconfig.json infra/lambda infra/test/push-handler.test.ts
git commit -m "feat(push): Lambda logic to schedule, cancel and send rest-end pushes"
```

---

### Task 3: Infra — Lambda real, construct CDK, secretos y deploy

**Files:**
- Create: `infra/lambda/push/index.ts`, `infra/lib/push.ts`
- Modify: `infra/lib/gymtracker-stack.ts`, `infra/lib/frontend.ts:62`, `infra/scripts/init-secrets.sh`, `.github/workflows/deploy.yml`
- Test: `infra/test/push.test.ts`, modify `infra/test/frontend.test.ts`

**Interfaces:**
- Consumes: `createHandler`, `ScheduleInput` (Task 2).
- Produces: `Push` construct (`readonly fn: NodejsFunction`), constantes `PUSH_FUNCTION_NAME = 'gymtracker-push'`, `REST_SCHEDULE_GROUP = 'gymtracker-rest'`; parámetros CFN `PushSigningKey`, `VapidPrivateKey`, `VapidPublicKey`; env de Laravel `PUSH_SIGNING_KEY`, `PUSH_VAPID_PUBLIC_KEY`.

- [ ] **Step 1: Write the failing tests**

`infra/test/push.test.ts`:

```ts
import { Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { synth } from './helpers';

type Statement = { Action: string | string[]; Resource: unknown };

describe('Push', () => {
  const template = synth();
  const statements = (): Statement[] =>
    Object.values(template.findResources('AWS::IAM::Policy')).flatMap(
      (p) => (p as { Properties: { PolicyDocument: { Statement: Statement[] } } }).Properties.PolicyDocument.Statement,
    );
  const statementWith = (action: string) =>
    statements().find((s) => (Array.isArray(s.Action) ? s.Action : [s.Action]).includes(action));

  it('runs on Node 22 outside the VPC (it needs internet, not Aurora)', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gymtracker-push',
      Runtime: 'nodejs22.x',
      VpcConfig: Match.absent(),
      Environment: {
        Variables: Match.objectLike({
          PUSH_SIGNING_KEY: { Ref: 'PushSigningKey' },
          VAPID_PRIVATE_KEY: { Ref: 'VapidPrivateKey' },
          VAPID_PUBLIC_KEY: { Ref: 'VapidPublicKey' },
          SCHEDULE_GROUP: 'gymtracker-rest',
          VAPID_SUBJECT: Match.anyValue(),
          SCHEDULER_ROLE_ARN: Match.anyValue(),
          TARGET_ARN: Match.anyValue(),
        }),
      },
    });
  });

  it('keeps the push secrets out of the template', () => {
    template.hasParameter('PushSigningKey', { NoEcho: true });
    template.hasParameter('VapidPrivateKey', { NoEcho: true });
    template.hasParameter('VapidPublicKey', Match.objectLike({ Type: 'String' }));
  });

  it('gives Laravel the signing key and the public key', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gymtracker-http',
      Environment: {
        Variables: Match.objectLike({
          PUSH_SIGNING_KEY: { Ref: 'PushSigningKey' },
          PUSH_VAPID_PUBLIC_KEY: { Ref: 'VapidPublicKey' },
        }),
      },
    });
  });

  it('creates the schedule group and can only manage schedules inside it', () => {
    template.hasResourceProperties('AWS::Scheduler::ScheduleGroup', { Name: 'gymtracker-rest' });

    const manage = statementWith('scheduler:CreateSchedule');
    expect(manage?.Action).toEqual([
      'scheduler:CreateSchedule',
      'scheduler:UpdateSchedule',
      'scheduler:DeleteSchedule',
    ]);
    expect(JSON.stringify(manage?.Resource)).toContain(':schedule/gymtracker-rest/*');
    expect(statementWith('iam:PassRole')).toBeDefined();
  });

  it('lets Scheduler invoke only the push function', () => {
    const invoke = statements().filter((s) => s.Action === 'lambda:InvokeFunction');
    expect(invoke.some((s) => JSON.stringify(s.Resource).includes('function:gymtracker-push'))).toBe(true);
  });

  it('exposes POST /push/* on the HTTP API', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'POST /push/{proxy+}' });
  });
});
```

En `infra/test/frontend.test.ts`, cambiar el nombre del test de behaviors:

```ts
  it('routes /api, /auth, /sanctum and /push to the HTTP API without caching', () => {
```

y la expectativa:

```ts
    expect(behaviors.map((b) => b.PathPattern).sort()).toEqual(['/api/*', '/auth/*', '/push/*', '/sanctum/*']);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd infra && npx vitest run test/push.test.ts test/frontend.test.ts`
Expected: FAIL (no existe `gymtracker-push`, falta `/push/*`).

- [ ] **Step 3: Implement the real adapter**

`infra/lambda/push/index.ts`:

```ts
import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
  UpdateScheduleCommand,
  type CreateScheduleCommandInput,
} from '@aws-sdk/client-scheduler';
import webpush from 'web-push';
import { createHandler, type ScheduleInput } from './handler';

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

const client = new SchedulerClient({});
webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

function toCommand(s: ScheduleInput): CreateScheduleCommandInput {
  return {
    Name: s.name,
    GroupName: s.group,
    ScheduleExpression: s.expression,
    ScheduleExpressionTimezone: 'UTC',
    FlexibleTimeWindow: { Mode: 'OFF' },
    ActionAfterCompletion: 'DELETE',
    // Un aviso atrasado no sirve: sin reintentos.
    Target: { Arn: s.targetArn, RoleArn: s.roleArn, Input: s.input, RetryPolicy: { MaximumRetryAttempts: 0 } },
  };
}

const errorName = (e: unknown) => (e as { name?: string }).name;

export const handler = createHandler({
  scheduler: {
    async upsert(schedule) {
      try {
        await client.send(new CreateScheduleCommand(toCommand(schedule)));
      } catch (e) {
        if (errorName(e) !== 'ConflictException') throw e;
        await client.send(new UpdateScheduleCommand(toCommand(schedule)));
      }
    },
    async remove(name, group) {
      try {
        await client.send(new DeleteScheduleCommand({ Name: name, GroupName: group }));
      } catch (e) {
        if (errorName(e) !== 'ResourceNotFoundException') throw e;
      }
    },
  },
  async sendPush(subscription, payload) {
    try {
      // TTL corto: si el teléfono no lo recibe en un minuto, ya no tiene sentido.
      await webpush.sendNotification(subscription, payload, { TTL: 60, urgency: 'high' });
      return 'sent';
    } catch (e) {
      const statusCode = (e as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) return 'gone';
      throw e;
    }
  },
  now: () => new Date(),
  config: {
    signingKey: env('PUSH_SIGNING_KEY'),
    group: env('SCHEDULE_GROUP'),
    roleArn: env('SCHEDULER_ROLE_ARN'),
    targetArn: env('TARGET_ARN'),
  },
});
```

- [ ] **Step 4: Implement the construct**

`infra/lib/push.ts`:

```ts
import { ArnFormat, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';
import * as path from 'node:path';

export const PUSH_FUNCTION_NAME = 'gymtracker-push';
export const REST_SCHEDULE_GROUP = 'gymtracker-rest';

export interface PushProps {
  readonly api: apigwv2.HttpApi;
  readonly signingKey: string;
  readonly vapidPublicKey: string;
  readonly vapidPrivateKey: string;
}

/**
 * Avisos de fin de descanso. Fuera de la VPC (necesita internet para Scheduler y los servicios
 * de push, y no usa Aurora): así no hace falta NAT ni VPC endpoints.
 */
export class Push extends Construct {
  readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: PushProps) {
    super(scope, id);
    const stack = Stack.of(this);

    new scheduler.CfnScheduleGroup(this, 'Group', { name: REST_SCHEDULE_GROUP });

    // ARN armado con el nombre fijo: referenciar fn.functionArn en su propio entorno sería circular.
    const targetArn = stack.formatArn({
      service: 'lambda',
      resource: 'function',
      resourceName: PUSH_FUNCTION_NAME,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Scheduler invoca la Lambda de push al terminar un descanso',
    });
    schedulerRole.addToPolicy(new iam.PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [targetArn] }));

    this.fn = new NodejsFunction(this, 'Function', {
      functionName: PUSH_FUNCTION_NAME,
      entry: path.join(__dirname, '../lambda/push/index.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      logGroup: new logs.LogGroup(this, 'Logs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      bundling: { format: OutputFormat.CJS, minify: true },
      environment: {
        PUSH_SIGNING_KEY: props.signingKey,
        VAPID_PUBLIC_KEY: props.vapidPublicKey,
        VAPID_PRIVATE_KEY: props.vapidPrivateKey,
        SCHEDULE_GROUP: REST_SCHEDULE_GROUP,
        SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
        TARGET_ARN: targetArn,
      },
    });

    this.fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['scheduler:CreateSchedule', 'scheduler:UpdateSchedule', 'scheduler:DeleteSchedule'],
        resources: [
          stack.formatArn({ service: 'scheduler', resource: 'schedule', resourceName: `${REST_SCHEDULE_GROUP}/*` }),
        ],
      }),
    );
    this.fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['iam:PassRole'], resources: [schedulerRole.roleArn] }));

    props.api.addRoutes({
      path: '/push/{proxy+}',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('Push', this.fn),
    });
  }
}
```

- [ ] **Step 5: Wire it into the stack**

En `infra/lib/gymtracker-stack.ts`:

1. Import: `import { Push } from './push';`
2. Después del parámetro `dbPassword`:

```ts
    const pushSigningKey = new CfnParameter(this, 'PushSigningKey', {
      type: 'String',
      noEcho: true,
      minLength: 32,
      description: 'Clave HMAC con que Laravel firma las suscripciones push',
    });
    const vapidPrivateKey = new CfnParameter(this, 'VapidPrivateKey', {
      type: 'String',
      noEcho: true,
      description: 'Clave privada VAPID (Web Push)',
    });
    const vapidPublicKey = new CfnParameter(this, 'VapidPublicKey', {
      type: 'String',
      description: 'Clave pública VAPID (Web Push)',
    });
```

3. En el `environment` del `Backend`, después de `QUEUE_CONNECTION: 'sync',`:

```ts
        PUSH_SIGNING_KEY: pushSigningKey.valueAsString,
        PUSH_VAPID_PUBLIC_KEY: vapidPublicKey.valueAsString,
```

4. Después de `new WarmUp(...)`:

```ts
    const push = new Push(this, 'Push', {
      api: backend.api,
      signingKey: pushSigningKey.valueAsString,
      vapidPublicKey: vapidPublicKey.valueAsString,
      vapidPrivateKey: vapidPrivateKey.valueAsString,
    });
```

5. Después del `for (const fn of [backend.http, backend.artisan]) {...}`:

```ts
    // Los servicios de push piden un contacto (mailto: o https:); usamos la URL de la app.
    push.fn.addEnvironment('VAPID_SUBJECT', `https://${domain}`);
```

En `infra/lib/frontend.ts`, cambiar la línea de `additionalBehaviors`:

```ts
      additionalBehaviors: { '/api/*': api, '/auth/*': api, '/sanctum/*': api, '/push/*': api },
```

- [ ] **Step 6: Secrets script and deploy workflow**

En `infra/scripts/init-secrets.sh`, al final:

```bash
put /gymtracker/prod/push-signing-key "$(openssl rand -hex 32)"

# Par VAPID: las dos mitades deben calzar, así que se crean juntas y solo si falta la privada.
if aws ssm get-parameter --region "$REGION" --name /gymtracker/prod/vapid-private-key >/dev/null 2>&1; then
  echo "/gymtracker/prod/vapid-private-key ya existe (no se toca)"
else
  keys="$("$(dirname "$0")/../node_modules/.bin/web-push" generate-vapid-keys --json)"
  aws ssm put-parameter --region "$REGION" --name /gymtracker/prod/vapid-public-key --type SecureString --overwrite \
    --value "$(node -pe 'JSON.parse(process.argv[1]).publicKey' "$keys")" >/dev/null
  aws ssm put-parameter --region "$REGION" --name /gymtracker/prod/vapid-private-key --type SecureString \
    --value "$(node -pe 'JSON.parse(process.argv[1]).privateKey' "$keys")" >/dev/null
  echo "/gymtracker/prod/vapid-public-key y vapid-private-key creados"
fi
```

En `.github/workflows/deploy.yml`, paso "Leer secretos de SSM": cambiar `for name in app-key db-password; do` por:

```yaml
          for name in app-key db-password push-signing-key vapid-private-key vapid-public-key; do
```

y en "Desplegar", después de `--parameters DbPassword="$SECRET_DB_PASSWORD"`:

```yaml
          --parameters PushSigningKey="$SECRET_PUSH_SIGNING_KEY"
          --parameters VapidPrivateKey="$SECRET_VAPID_PRIVATE_KEY"
          --parameters VapidPublicKey="$SECRET_VAPID_PUBLIC_KEY"
```

- [ ] **Step 7: Run all infra tests**

Run: `cd infra && npm test && npm run typecheck && bash -n scripts/init-secrets.sh`
Expected: todo en verde (incluye `no-cycles` y los tests existentes de Backend/Frontend).

- [ ] **Step 8: Commit**

```bash
git add infra .github/workflows/deploy.yml
git commit -m "feat(push): push Lambda outside the VPC with Scheduler, routes and secrets"
```

---

### Task 4: Frontend — `PushApi` y `PushService`

**Files:**
- Create: `frontend/src/app/core/models/push.ts`, `frontend/src/app/core/api/push-api.ts`, `frontend/src/app/core/push/push.service.ts`
- Test: `frontend/src/app/core/push/push.service.spec.ts`

**Interfaces:**
- Produces: `PushStatus = 'unsupported' | 'unasked' | 'on' | 'declined' | 'blocked'`; `PushService.status: Signal<PushStatus>`, `enable(): Promise<boolean>`, `disable(): Promise<void>`, `decline(): void`, `schedule(seconds: number, body: string, url: string): Promise<void>`, `cancel(): Promise<void>`; `REST_PUSH_TITLE = '¡Descanso terminado!'`.

- [ ] **Step 1: Write the failing test**

`frontend/src/app/core/push/push.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PushApi } from '../api/push-api';
import { PushService, REST_PUSH_TITLE } from './push.service';

const SUB = { endpoint: 'https://push.example.com/send/abc', keys: { p256dh: 'p', auth: 'a' } };
const STORAGE_KEY = 'gymtracker.push';

function setup(opts: { stored?: unknown; supported?: boolean; liveSubscription?: boolean } = {}) {
  const { stored, supported = true, liveSubscription = true } = opts;
  localStorage.clear();
  if (stored) localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  if (supported) Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true });

  const sw = {
    isEnabled: supported,
    subscription: of(liveSubscription ? {} : null),
    requestSubscription: vi.fn().mockResolvedValue({ toJSON: () => SUB }),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
  const api = {
    publicKey: vi.fn().mockResolvedValue('BPublicKey'),
    token: vi.fn().mockResolvedValue('sig'),
    schedule: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SwPush, useValue: sw },
      { provide: PushApi, useValue: api },
    ],
  });
  return { sw, api, push: TestBed.inject(PushService) };
}

const ON = { status: 'on', subscription: SUB, signature: 'sig' };

describe('PushService', () => {
  afterEach(() => {
    delete (window as { PushManager?: unknown }).PushManager;
    vi.unstubAllGlobals();
  });

  it('is unsupported without the service worker or the Push API', () => {
    expect(setup({ supported: false }).push.status()).toBe('unsupported');
  });

  it('starts unasked and turns on after subscribing and getting a signature', async () => {
    const { push, sw, api } = setup();
    expect(push.status()).toBe('unasked');

    expect(await push.enable()).toBe(true);

    expect(sw.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'BPublicKey' });
    expect(api.token).toHaveBeenCalledWith(SUB.endpoint);
    expect(push.status()).toBe('on');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(ON);
  });

  it('reports blocked when the user denies the permission', async () => {
    const { push, sw } = setup();
    sw.requestSubscription.mockRejectedValue(new Error('denied'));
    vi.stubGlobal('Notification', { permission: 'denied' });

    expect(await push.enable()).toBe(false);
    expect(push.status()).toBe('blocked');
  });

  it('stays unasked when enabling fails for another reason', async () => {
    const { push, api } = setup();
    api.token.mockRejectedValue(new Error('offline'));

    expect(await push.enable()).toBe(false);
    expect(push.status()).toBe('unasked');
  });

  it('remembers "Ahora no"', () => {
    const { push } = setup();
    push.decline();
    expect(push.status()).toBe('declined');
    expect(setup({ stored: { status: 'declined' } }).push.status()).toBe('declined');
  });

  it('turns off: unsubscribes and remembers it', async () => {
    const { push, sw } = setup({ stored: ON });
    await push.disable();
    expect(sw.unsubscribe).toHaveBeenCalled();
    expect(push.status()).toBe('declined');
  });

  it('asks again when the browser lost the subscription', () => {
    expect(setup({ stored: ON, liveSubscription: false }).push.status()).toBe('unasked');
  });

  it('schedules and cancels with the stored subscription and signature', async () => {
    const { push, api } = setup({ stored: ON });

    await push.schedule(90.4, 'Press de banca · serie 2 de 4', '/entrenamiento/w1');
    expect(api.schedule).toHaveBeenCalledWith({
      subscription: SUB,
      signature: 'sig',
      seconds: 90,
      title: REST_PUSH_TITLE,
      body: 'Press de banca · serie 2 de 4',
      url: '/entrenamiento/w1',
    });

    await push.cancel();
    expect(api.cancel).toHaveBeenCalledWith({ endpoint: SUB.endpoint, signature: 'sig' });
  });

  it('clamps the seconds to what the Lambda accepts', async () => {
    const { push, api } = setup({ stored: ON });
    await push.schedule(0.2, 'x', '/');
    await push.schedule(5000, 'x', '/');
    expect(api.schedule.mock.calls.map((c) => c[0].seconds)).toEqual([1, 3600]);
  });

  it('does nothing when it is not on, and ignores network errors', async () => {
    const off = setup({ stored: { status: 'declined' } });
    await off.push.schedule(90, 'x', '/');
    await off.push.cancel();
    expect(off.api.schedule).not.toHaveBeenCalled();
    expect(off.api.cancel).not.toHaveBeenCalled();

    const on = setup({ stored: ON });
    on.api.schedule.mockRejectedValue(new Error('offline'));
    on.api.cancel.mockRejectedValue(new Error('offline'));
    await expect(on.push.schedule(90, 'x', '/')).resolves.toBeUndefined();
    await expect(on.push.cancel()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include src/app/core/push/push.service.spec.ts`
Expected: FAIL (`Cannot find module './push.service'`).

- [ ] **Step 3: Implement**

`frontend/src/app/core/models/push.ts`:

```ts
export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface RestPushRequest {
  subscription: PushSubscriptionJson;
  signature: string;
  seconds: number;
  title: string;
  body: string;
  url: string;
}

export interface CancelPushRequest {
  endpoint: string;
  signature: string;
}

export type PushStatus = 'unsupported' | 'unasked' | 'on' | 'declined' | 'blocked';
```

`frontend/src/app/core/api/push-api.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CancelPushRequest, RestPushRequest } from '../models/push';

@Injectable({ providedIn: 'root' })
export class PushApi {
  private readonly http = inject(HttpClient);

  async publicKey(): Promise<string | null> {
    const res = await firstValueFrom(this.http.get<{ data: { public_key: string | null } }>('/api/push/config'));
    return res.data.public_key;
  }

  async token(endpoint: string): Promise<string> {
    const res = await firstValueFrom(
      this.http.post<{ data: { signature: string } }>('/api/push/token', { endpoint }),
    );
    return res.data.signature;
  }

  /** Lambda de push (fuera de Laravel). */
  async schedule(request: RestPushRequest): Promise<void> {
    await firstValueFrom(this.http.post('/push/rest', request));
  }

  async cancel(request: CancelPushRequest): Promise<void> {
    await firstValueFrom(this.http.post('/push/cancel', request));
  }
}
```

`frontend/src/app/core/push/push.service.ts`:

```ts
import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { take } from 'rxjs';
import { PushApi } from '../api/push-api';
import type { PushStatus, PushSubscriptionJson } from '../models/push';

export const REST_PUSH_TITLE = '¡Descanso terminado!';

const STORAGE_KEY = 'gymtracker.push';
const MAX_SECONDS = 3600;

interface Stored {
  status: 'on' | 'declined';
  subscription?: PushSubscriptionJson;
  signature?: string;
}

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function notificationPermission(): NotificationPermission | null {
  return typeof Notification === 'undefined' ? null : Notification.permission;
}

/** Avisos push de fin de descanso, activados por dispositivo. */
@Injectable({ providedIn: 'root' })
export class PushService {
  // Opcional: en desarrollo (y en tests) no hay service worker.
  private readonly sw = inject(SwPush, { optional: true });
  private readonly injector = inject(Injector);
  private readonly stored = signal<Stored | null>(readStored());
  private readonly denied = signal(notificationPermission() === 'denied');

  private readonly supported = !!this.sw?.isEnabled && typeof window !== 'undefined' && 'PushManager' in window;

  readonly status = computed<PushStatus>(() => {
    if (!this.supported) return 'unsupported';
    if (this.denied()) return 'blocked';
    return this.stored()?.status ?? 'unasked';
  });

  constructor() {
    // iOS puede borrar la suscripción (p. ej. al reinstalar la app): entonces volvemos a preguntar.
    if (this.supported && this.stored()?.status === 'on') {
      this.sw!.subscription.pipe(take(1)).subscribe((sub) => {
        if (sub === null) this.save(null);
      });
    }
  }

  /** Pide permiso y suscribe este dispositivo. Debe llamarse desde un toque del usuario (iOS lo exige). */
  async enable(): Promise<boolean> {
    if (!this.supported) return false;
    try {
      const serverPublicKey = await this.api.publicKey();
      if (!serverPublicKey) return false;
      const sub = await this.sw!.requestSubscription({ serverPublicKey });
      const subscription = sub.toJSON() as PushSubscriptionJson;
      const signature = await this.api.token(subscription.endpoint);
      this.save({ status: 'on', subscription, signature });
      return true;
    } catch {
      this.denied.set(notificationPermission() === 'denied');
      return false;
    }
  }

  async disable(): Promise<void> {
    this.save({ status: 'declined' });
    try {
      await this.sw?.unsubscribe();
    } catch {
      // Ya no había suscripción: nada que hacer.
    }
  }

  decline(): void {
    this.save({ status: 'declined' });
  }

  async schedule(seconds: number, body: string, url: string): Promise<void> {
    const active = this.active();
    if (!active) return;
    try {
      await this.api.schedule({
        subscription: active.subscription,
        signature: active.signature,
        seconds: Math.min(MAX_SECONDS, Math.max(1, Math.round(seconds))),
        title: REST_PUSH_TITLE,
        body,
        url,
      });
    } catch {
      // Sin señal: la barra y la vibración siguen avisando con la app abierta.
    }
  }

  async cancel(): Promise<void> {
    const active = this.active();
    if (!active) return;
    try {
      await this.api.cancel({ endpoint: active.subscription.endpoint, signature: active.signature });
    } catch {
      // Peor caso: llega un aviso de más.
    }
  }

  /** Se pide recién al usarla: sin soporte (o en tests de otros servicios) no hace falta HttpClient. */
  private get api(): PushApi {
    return this.injector.get(PushApi);
  }

  private active(): Required<Stored> | null {
    const s = this.stored();
    return s?.status === 'on' && s.subscription && s.signature ? (s as Required<Stored>) : null;
  }

  private save(value: Stored | null): void {
    this.stored.set(value);
    try {
      if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Sin almacenamiento: queda solo en memoria.
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include src/app/core/push/push.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/models/push.ts frontend/src/app/core/api/push-api.ts frontend/src/app/core/push
git commit -m "feat(push): PushService to enable rest notifications per device"
```

---

### Task 5: Conectar el temporizador y la tarjeta de ejercicio

**Files:**
- Modify: `frontend/src/app/core/workout/rest-timer.service.ts`
- Modify: `frontend/src/app/features/workout/exercise-card.ts` (método `save()`)
- Test: `frontend/src/app/core/workout/rest-timer.service.spec.ts`, `frontend/src/app/features/workout/exercise-card.spec.ts`

**Interfaces:**
- Consumes: `PushService.schedule(seconds, body, url)`, `PushService.cancel()` (Task 4).
- Produces: `RestNotice { body: string; url: string }`, `restNoticeBody(name: string, nextSet: number, targetSets: number | null): string`, `RestTimerService.start(seconds: number, notice?: RestNotice)`, `RestTimerService.scheduleCurrent(): void`.

- [ ] **Step 1: Write the failing tests**

En `frontend/src/app/core/workout/rest-timer.service.spec.ts`, cambiar los imports a `import { PushService } from '../push/push.service';` y `import { RestTimerService, remainingSeconds, restNoticeBody } from './rest-timer.service';`, y agregar al final:

```ts
describe('restNoticeBody', () => {
  it('names the exercise and the coming set', () => {
    expect(restNoticeBody('Press de banca', 3, 4)).toBe('Press de banca · serie 3 de 4');
    expect(restNoticeBody('Press de banca', 5, 4)).toBe('Press de banca · serie 5');
    expect(restNoticeBody('Dominadas', 2, null)).toBe('Dominadas · serie 2');
  });
});

describe('RestTimerService push notices', () => {
  const NOTICE = { body: 'Press de banca · serie 2 de 4', url: '/entrenamiento/w1' };
  const push = { schedule: vi.fn(), cancel: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T22:00:00Z'));
    localStorage.clear();
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true });
    push.schedule.mockReset().mockResolvedValue(undefined);
    push.cancel.mockReset().mockResolvedValue(undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PushService, useValue: push }] });
  });

  afterEach(() => vi.useRealTimers());

  it('schedules the push, reschedules it on +30 s and cancels it on skip', () => {
    const timer = TestBed.inject(RestTimerService);

    timer.start(90, NOTICE);
    expect(push.schedule).toHaveBeenLastCalledWith(90, NOTICE.body, NOTICE.url);

    vi.advanceTimersByTime(10_000);
    timer.add(30);
    expect(push.schedule).toHaveBeenLastCalledWith(110, NOTICE.body, NOTICE.url);

    timer.stop();
    expect(push.cancel).toHaveBeenCalledTimes(1);
  });

  it('leaves push alone when there is no notice', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(90);
    timer.add(30);
    timer.stop();
    expect(push.schedule).not.toHaveBeenCalled();
    expect(push.cancel).not.toHaveBeenCalled();
  });

  it('does not cancel after the rest ended by itself (the push already fired)', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(5, NOTICE);
    vi.advanceTimersByTime(6_000);
    timer.stop();
    expect(push.cancel).not.toHaveBeenCalled();
  });

  it('schedules the running rest on demand (after enabling notifications)', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(90, NOTICE);
    push.schedule.mockClear();
    vi.advanceTimersByTime(20_000);

    timer.scheduleCurrent();
    expect(push.schedule).toHaveBeenCalledWith(70, NOTICE.body, NOTICE.url);
  });
});
```

En `frontend/src/app/features/workout/exercise-card.spec.ts`:
1. En `render()`, agregar al objeto `sessions`: `session: () => ({ id: 'w1' }),`
2. Reemplazar `expect(timer.start).toHaveBeenCalledWith(180);` por:

```ts
    expect(timer.start).toHaveBeenCalledWith(180, {
      body: 'Press de banca · serie 2',
      url: '/entrenamiento/w1',
    });
```

(`addSet` devuelve `undefined` en ese test → se asume que la guardada es la serie 1; `target_sets` es 1, así que la siguiente, la 2, va sin "de".)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include src/app/core/workout/rest-timer.service.spec.ts --include src/app/features/workout/exercise-card.spec.ts`
Expected: FAIL (`restNoticeBody` no existe; `start` llamado con un solo argumento).

- [ ] **Step 3: Implement**

En `frontend/src/app/core/workout/rest-timer.service.ts`:

1. Imports: cambiar la primera línea por `import { Injectable, computed, inject, signal } from '@angular/core';` y agregar `import { PushService } from '../push/push.service';`.
2. Después de la función `remainingSeconds(...)`:

```ts
/** Texto del aviso push: qué serie viene. */
export interface RestNotice {
  body: string;
  url: string;
}

export function restNoticeBody(name: string, nextSet: number, targetSets: number | null): string {
  return targetSets !== null && nextSet <= targetSets
    ? `${name} · serie ${nextSet} de ${targetSets}`
    : `${name} · serie ${nextSet}`;
}
```

3. En la clase, después de `private finishedHandle ...`:

```ts
  private readonly push = inject(PushService);
  /** Aviso del descanso en curso (null: sin push programado). */
  private notice: RestNotice | null = null;
```

4. Reemplazar `start`, `add` y `stop` por:

```ts
  start(seconds: number, notice?: RestNotice): void {
    this.dismiss();
    this.notice = notice ?? null;
    this.setEndsAt(Date.now() + seconds * 1000);
    this.scheduleCurrent();
  }

  add(seconds: number): void {
    this.setEndsAt(Math.max(this.endsAt() ?? 0, Date.now()) + seconds * 1000);
    this.scheduleCurrent();
  }

  stop(): void {
    this.dismiss();
    this.setEndsAt(null);
    if (this.notice) void this.push.cancel();
    this.notice = null;
  }

  /** Programa (o reprograma) el push para lo que queda del descanso en curso. */
  scheduleCurrent(): void {
    if (this.notice && this.running()) {
      void this.push.schedule(this.remaining(), this.notice.body, this.notice.url);
    }
  }
```

5. En `tick()`, dentro de `if (this.endsAt() !== null) {`, antes de `navigator.vibrate?.(...)`, agregar `this.notice = null;` (el push ya se disparó; "Saltar" después no debe cancelar nada).

En `frontend/src/app/features/workout/exercise-card.ts`:
1. Cambiar el import a `import { RestTimerService, restNoticeBody } from '../../core/workout/rest-timer.service';`
2. En `save()`, reemplazar `if (!this.finished()) this.timer.start(this.item().rest_seconds);` por:

```ts
    if (!this.finished()) {
      const ex = this.item();
      const done = saved?.set_number ?? ex.sets.length + 1;
      const sessionId = this.sessions.session()?.id;
      this.timer.start(
        ex.rest_seconds,
        sessionId
          ? { body: restNoticeBody(ex.exercise.name, done + 1, ex.target_sets), url: `/entrenamiento/${sessionId}` }
          : undefined,
      );
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: todo en verde (los tests anteriores de `RestTimerService` siguen pasando: sin `SwPush`, `PushService` queda `unsupported` y no toca HTTP).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/workout frontend/src/app/features/workout/exercise-card.ts frontend/src/app/features/workout/exercise-card.spec.ts
git commit -m "feat(push): schedule, reschedule and cancel the rest push from the timer"
```

---

### Task 6: Tarjeta de primera vez en la barra de descanso

**Files:**
- Modify: `frontend/src/app/shared/ui/rest-timer-bar.ts`
- Test: `frontend/src/app/shared/ui/rest-timer-bar.spec.ts` (nuevo)

**Interfaces:**
- Consumes: `PushService.status`, `enable()`, `decline()` (Task 4); `RestTimerService.scheduleCurrent()` (Task 5).

- [ ] **Step 1: Write the failing test**

`frontend/src/app/shared/ui/rest-timer-bar.spec.ts`:

```ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { PushStatus } from '../../core/models/push';
import { PushService } from '../../core/push/push.service';
import { RestTimerService } from '../../core/workout/rest-timer.service';
import { RestTimerBar } from './rest-timer-bar';

async function render(status: PushStatus, running = true) {
  const push = {
    status: signal<PushStatus>(status),
    enable: vi.fn().mockResolvedValue(true),
    decline: vi.fn(),
  };
  const timer = {
    running: signal(running),
    finished: signal(false),
    ending: signal(false),
    remaining: signal(90),
    add: vi.fn(),
    stop: vi.fn(),
    dismiss: vi.fn(),
    scheduleCurrent: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: PushService, useValue: push },
      { provide: RestTimerService, useValue: timer },
    ],
  });
  const fixture = TestBed.createComponent(RestTimerBar);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  return { fixture, el, push, timer, button };
}

describe('RestTimerBar', () => {
  it('offers rest notifications the first time a rest starts', async () => {
    const { el, button, push, timer, fixture } = await render('unasked');
    expect(el.textContent).toContain('¿Te aviso cuando termine el descanso');

    button('Activar')!.click();
    await fixture.whenStable();

    expect(push.enable).toHaveBeenCalled();
    expect(timer.scheduleCurrent).toHaveBeenCalled();
  });

  it('remembers "Ahora no"', async () => {
    const { button, push } = await render('unasked');
    button('Ahora no')!.click();
    expect(push.decline).toHaveBeenCalled();
  });

  it('does not schedule when enabling failed', async () => {
    const { button, push, timer, fixture } = await render('unasked');
    push.enable.mockResolvedValue(false);
    button('Activar')!.click();
    await fixture.whenStable();
    expect(timer.scheduleCurrent).not.toHaveBeenCalled();
  });

  it.each<PushStatus>(['on', 'declined', 'blocked', 'unsupported'])('does not ask when status is %s', async (status) => {
    const { el } = await render(status);
    expect(el.textContent).not.toContain('¿Te aviso');
  });

  it('does not ask without a running rest', async () => {
    const { el } = await render('unasked', false);
    expect(el.textContent).not.toContain('¿Te aviso');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include src/app/shared/ui/rest-timer-bar.spec.ts`
Expected: FAIL (no aparece el texto "¿Te aviso…").

- [ ] **Step 3: Implement**

Reemplazar `frontend/src/app/shared/ui/rest-timer-bar.ts` completo:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBell, lucideBellRing, lucideTimer } from '@ng-icons/lucide';
import { PushService } from '../../core/push/push.service';
import { RestTimerService } from '../../core/workout/rest-timer.service';

/** Banda lima de descanso, fija sobre la navegación inferior (al alcance del pulgar). */
@Component({
  selector: 'app-rest-timer-bar',
  imports: [NgIcon],
  providers: [provideIcons({ lucideBell, lucideBellRing, lucideTimer })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (timer.running() || timer.finished()) {
      <div class="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-4 pb-2">
        @if (askPush()) {
          <div
            class="rest-bar-in mx-auto mb-2 max-w-lg rounded-2xl border border-border bg-card p-3 shadow-lg"
            role="group"
            aria-label="Avisos de descanso"
          >
            <p class="flex items-start gap-2 text-sm">
              <ng-icon name="lucideBell" size="18" class="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              ¿Te aviso cuando termine el descanso, aunque tengas el teléfono bloqueado?
            </p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                class="h-11 flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground"
                (click)="enablePush()"
              >
                Activar
              </button>
              <button
                type="button"
                class="h-11 flex-1 rounded-xl border border-border text-sm font-semibold"
                (click)="push.decline()"
              >
                Ahora no
              </button>
            </div>
          </div>
        }
        <div
          class="rest-bar-in mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-primary px-4 py-2 text-primary-foreground shadow-lg"
          [class.rest-done]="timer.finished()"
          role="timer"
          aria-live="off"
        >
          @if (timer.finished()) {
            <ng-icon name="lucideBellRing" size="22" aria-hidden="true" />
            <span class="flex-1" role="status">
              <span class="block text-lg leading-tight font-bold">¡Descanso terminado!</span>
              <span class="block text-sm opacity-80">A la siguiente serie</span>
            </span>
            <button
              type="button"
              class="h-12 rounded-xl px-4 text-sm font-bold tracking-wide uppercase hover:bg-black/10"
              (click)="timer.dismiss()"
            >
              OK
            </button>
          } @else {
            <ng-icon name="lucideTimer" size="22" aria-hidden="true" />
            <span class="text-sm font-semibold tracking-[0.06em] uppercase">Descanso</span>
            <span class="num ml-auto text-3xl leading-none font-bold" [class.rest-ending]="timer.ending()">{{
              label()
            }}</span>
            <button
              type="button"
              class="num h-12 rounded-xl px-3 text-lg font-bold hover:bg-black/10"
              (click)="timer.add(30)"
            >
              +30 s
            </button>
            <button
              type="button"
              class="h-12 rounded-xl px-3 text-sm font-semibold tracking-wide uppercase hover:bg-black/10"
              (click)="timer.stop()"
            >
              Saltar
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class RestTimerBar {
  protected readonly timer = inject(RestTimerService);
  protected readonly push = inject(PushService);
  protected readonly label = computed(() => {
    const total = this.timer.remaining();
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  });
  /** Primera vez: se pregunta durante un descanso, cuando el aviso tiene sentido. */
  protected readonly askPush = computed(() => this.timer.running() && this.push.status() === 'unasked');

  protected async enablePush(): Promise<void> {
    if (await this.push.enable()) this.timer.scheduleCurrent();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/ui/rest-timer-bar.ts frontend/src/app/shared/ui/rest-timer-bar.spec.ts
git commit -m "feat(push): ask to enable rest notifications during the first rest"
```

---

### Task 7: Interruptor en "Mi cuenta"

**Files:**
- Modify: `frontend/src/app/features/account/account-menu.ts`
- Test: `frontend/src/app/features/account/account-menu.spec.ts`

**Interfaces:**
- Consumes: `PushService.status`, `enable()`, `disable()` (Task 4).

- [ ] **Step 1: Write the failing tests**

En `frontend/src/app/features/account/account-menu.spec.ts`:
1. Imports: agregar `import type { PushStatus } from '../../core/models/push';` y `import { PushService } from '../../core/push/push.service';`.
2. Cambiar la firma `async function render(pending: Invitation[] = [])` por `async function render(pending: Invitation[] = [], pushStatus: PushStatus = 'unsupported')`.
3. Antes de `TestBed.configureTestingModule`, agregar:

```ts
  const push = {
    status: signal<PushStatus>(pushStatus),
    enable: vi.fn().mockResolvedValue(true),
    disable: vi.fn().mockResolvedValue(undefined),
  };
```

4. Agregar `{ provide: PushService, useValue: push },` a `providers` y `push` al objeto que devuelve `render` (`return { api, auth, el, settle, button, open, push };`).
5. Al final del `describe('AccountMenu', ...)`:

```ts
  describe('rest notifications', () => {
    const toggle = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[role="switch"]')!;

    it('turns them on from the switch', async () => {
      const { el, open, settle, push } = await render([], 'declined');
      await open();
      expect(toggle(el).getAttribute('aria-checked')).toBe('false');

      toggle(el).click();
      await settle();
      expect(push.enable).toHaveBeenCalled();
    });

    it('turns them off from the switch', async () => {
      const { el, open, settle, push } = await render([], 'on');
      await open();
      expect(toggle(el).getAttribute('aria-checked')).toBe('true');

      toggle(el).click();
      await settle();
      expect(push.disable).toHaveBeenCalled();
    });

    it('explains how to get them on an iPhone without the installed app', async () => {
      const { el, open } = await render([], 'unsupported');
      await open();
      expect(toggle(el).disabled).toBe(true);
      expect(el.textContent).toContain('instala la app en tu pantalla de inicio');
    });

    it('explains how to unblock them', async () => {
      const { el, open } = await render([], 'blocked');
      await open();
      expect(toggle(el).disabled).toBe(true);
      expect(el.textContent).toContain('Actívalas en Ajustes del teléfono');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include src/app/features/account/account-menu.spec.ts`
Expected: FAIL (no hay `[role="switch"]`).

- [ ] **Step 3: Implement**

En `frontend/src/app/features/account/account-menu.ts`:

1. Import: `import { PushService } from '../../core/push/push.service';`
2. En el template, justo antes de `<div class="my-4 border-t border-border"></div>` (el separador previo a "Cerrar sesión"), insertar:

```html
        <div class="my-4 border-t border-border"></div>
        <div class="flex items-center gap-3">
          <span id="push-label" class="flex-1 text-sm font-semibold">Avisos de descanso</span>
          <button
            type="button"
            role="switch"
            aria-labelledby="push-label"
            [attr.aria-checked]="pushOn()"
            [disabled]="pushBusy() || pushLocked()"
            class="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50"
            [class.bg-primary]="pushOn()"
            [class.bg-muted]="!pushOn()"
            (click)="togglePush()"
          >
            <span
              class="absolute top-1 left-1 size-5 rounded-full bg-background transition-transform"
              [class.translate-x-5]="pushOn()"
            ></span>
          </button>
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          @switch (push.status()) {
            @case ('unsupported') {
              Este navegador no permite avisos. En iPhone, instala la app en tu pantalla de inicio.
            }
            @case ('blocked') {
              Bloqueaste las notificaciones. Actívalas en Ajustes del teléfono.
            }
            @default {
              Te llega una notificación cuando termina el descanso, aunque tengas el teléfono bloqueado.
            }
          }
        </p>
```

3. En la clase, después de `protected readonly error = signal<string | null>(null);`:

```ts
  protected readonly push = inject(PushService);
  protected readonly pushBusy = signal(false);
  protected readonly pushOn = computed(() => this.push.status() === 'on');
  protected readonly pushLocked = computed(() => ['unsupported', 'blocked'].includes(this.push.status()));
```

4. Después del método `revoke(...)`:

```ts
  async togglePush(): Promise<void> {
    this.pushBusy.set(true);
    try {
      if (this.pushOn()) await this.push.disable();
      else await this.push.enable();
    } finally {
      this.pushBusy.set(false);
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/account
git commit -m "feat(push): rest notifications switch in the account menu"
```

---

### Task 8: Verificación completa

- [ ] **Step 1: Run every suite and the builds**

```bash
cd backend && ./vendor/bin/pest
cd ../frontend && npx ng test --watch=false && npx ng build
cd ../infra && npm test && npm run typecheck
```

Expected: todo en verde; `ng build` sin errores (incluidos los presupuestos de tamaño).

- [ ] **Step 2: Check local behavior (desarrollo, sin service worker)**

Con `docker compose up -d` y `cd frontend && npx ng serve --port 4200`: entrar con `luciano@gymtracker.test` / `password` y guardar una serie. La barra de descanso aparece **sin** la tarjeta de avisos (en desarrollo no hay SW → `unsupported`). En "Mi cuenta" el interruptor está deshabilitado con el mensaje de instalar la app.

- [ ] **Step 3: Commit only if something changed**

Si hubo arreglos: un commit `fix(push): …` con el detalle.

---

### Task 9: Secretos, despliegue y prueba en iPhone (requiere a Luciano)

- [ ] **Step 1: Crear los secretos (con su OK explícito: crea recursos en AWS)**

Luciano lo corre (requiere `aws login` e `infra/node_modules` instalado):

```bash
! bash infra/scripts/init-secrets.sh
```

Expected: `/gymtracker/prod/push-signing-key creado` y `/gymtracker/prod/vapid-public-key y vapid-private-key creados` (app-key y db-password: "ya existe").

- [ ] **Step 2: Su revisión local** → él dice "intégralo a main".

- [ ] **Step 3: Merge y deploy**

```bash
git push . HEAD:main && git checkout main && git push origin main
```

Seguir el run con `gh run list --limit 1` y `gh run view <id> --json conclusion` (no confiar en `gh run watch` si está en cola).

- [ ] **Step 4: Verificación en producción**

- `curl -s -o /dev/null -w '%{http_code}' -X POST https://d2vs4ifr98bzf3.cloudfront.net/push/rest -H 'content-type: application/json' -d '{}'` → `422` (la Lambda responde detrás de CloudFront).
- En el iPhone (PWA instalada; si hay versión nueva, aceptar el banner de actualización): guardar una serie → tarjeta "¿Te aviso…?" → **Activar** → aceptar el permiso de iOS. Hacer un descanso corto, bloquear el teléfono y medir el retraso de la notificación respecto de 0:00. Tocarla → abre el entrenamiento.
- Probar "Saltar" (no debe llegar aviso) y "+30 s" (llega 30 s más tarde).

- [ ] **Step 5: Actualizar la memoria** con el estado final y el retraso medido.
