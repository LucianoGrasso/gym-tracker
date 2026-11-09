# Avisos de descanso (Web Push) — diseño

Fecha: 2026-11-09 · Estado: aprobado en brainstorming

## Objetivo

Cuando termina el descanso entre series, el teléfono avisa con una notificación push aunque la app esté en segundo plano o el teléfono bloqueado (iPhone con la PWA instalada, iOS ≥ 16.4; Android/escritorio con navegadores compatibles).

Notificación: título **"¡Descanso terminado!"**, texto **"Press de banca · serie 3 de 4"** (la serie que viene). Al tocarla se abre `/entrenamiento/:id`.

Fuera de alcance: cuenta regresiva dentro de la notificación (imposible en web), sonido propio, botones de acción en la notificación, otros tipos de aviso.

## Restricción que define la arquitectura

Las Lambdas de Laravel corren en subredes aisladas sin NAT (para no pagar NAT ni VPC endpoints). No pueden llamar a EventBridge Scheduler ni a los servicios de push. Por eso el push lo maneja **una Lambda aparte, fuera de la VPC**, que no toca Aurora. Costo esperado: ~USD 0/mes (dentro de la capa gratuita de Lambda y Scheduler).

## Autenticación: token firmado

Laravel firma la suscripción; la Lambda verifica la firma. Sin tablas nuevas.

1. Al activar avisos, la app envía `POST /api/push/token { endpoint }` (sesión Sanctum). Laravel responde `{ data: { signature } }` con `signature = hex(HMAC-SHA256(endpoint, PUSH_SIGNING_KEY))`.
2. La app guarda suscripción + firma en `localStorage` (por dispositivo).
3. Cada llamada a la Lambda lleva `endpoint` y `signature`; la Lambda recalcula el HMAC y compara con `timingSafeEqual`. Si no coincide: 403.

## Backend (Laravel)

- `App\Services\Push\PushSigner::sign(string $endpoint): string`. Lee `config('services.push.signing_key')`; sin clave lanza excepción.
- `PushTokenRequest`: `endpoint` requerido, URL, `starts_with:https://`, máx. 1000 caracteres.
- `PushController` (`config` y `token`) en `routes/api.php` dentro de `auth:sanctum`.
- `GET /api/push/config` (con sesión) devuelve `{ data: { public_key } }`: la clave pública VAPID vive en SSM igual que la privada, así no hay que editar el repo al generarla.
- `config/services.php`: `push.signing_key` (`PUSH_SIGNING_KEY`) y `push.vapid_public_key` (`PUSH_VAPID_PUBLIC_KEY`). `.env.example` y `phpunit.xml` incluyen una clave de desarrollo.

## Lambda `gymtracker-push` (infra)

Código en `infra/lambda/push/`, Node 22, empaquetado con `NodejsFunction` (esbuild). Fuera de la VPC. Una función, dos orígenes de evento:

**HTTP (API Gateway v2, rutas `POST /push/rest` y `POST /push/cancel`; se evita DELETE con cuerpo porque CloudFront no lo garantiza):**
- `POST` body: `{ subscription: { endpoint, keys: { p256dh, auth } }, signature, seconds, title, body, url }`.
  Validación: endpoint https; `seconds` entero 1–3600; `title`/`body` 1–120 caracteres; `url` empieza con `/` (no `//`) y máx. 200. Error → 422; firma inválida → 403.
  Acción: crea el horario `rest-<sha256(endpoint) primeros 32 hex>` en el grupo `gymtracker-rest`, expresión `at(<ahora + seconds, UTC, yyyy-mm-ddThh:mm:ss>)`, `FlexibleTimeWindow: OFF`, `ActionAfterCompletion: DELETE`, target = esta misma Lambda con input `{ kind: 'send', subscription, title, body, url }`. Si ya existe (`ConflictException`) lo actualiza. Responde 204.
- `POST /push/cancel` body: `{ endpoint, signature }`. Borra el horario (ignora `ResourceNotFoundException`). Responde 204.

**Scheduler (input `{ kind: 'send', … }`):** envía con `web-push` (VAPID) el payload que entiende el service worker de Angular:

```json
{ "notification": { "title": "...", "body": "...", "icon": "/icons/icon-192.png", "tag": "rest",
  "data": { "onActionClick": { "default": { "operation": "navigateLastFocusedOrOpen", "url": "/entrenamiento/…" } } } } }
```

Si el servicio de push responde 404/410 (suscripción vencida) se registra en el log y termina sin error; otros errores se registran y se relanzan.

Variables de entorno: `PUSH_SIGNING_KEY`, `VAPID_PRIVATE_KEY` (parámetros NoEcho), `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` (URL https de la app), `SCHEDULE_GROUP`, `SCHEDULER_ROLE_ARN`, `TARGET_ARN` (ARN propio construido a partir del nombre fijo, para evitar dependencias circulares).

**Infra (construct `infra/lib/push.ts`):**
- `CfnScheduleGroup` `gymtracker-rest`.
- Rol para Scheduler que solo puede `lambda:InvokeFunction` sobre `gymtracker-push`.
- Rol de la Lambda: `scheduler:CreateSchedule|UpdateSchedule|DeleteSchedule` solo en `schedule/gymtracker-rest/*`, `iam:PassRole` solo sobre el rol de Scheduler.
- Ruta `ANY /push/{proxy+}` en la HTTP API existente → Lambda de push. CloudFront agrega el behavior `/push/*` igual a `/api/*`.
- Parámetros nuevos del stack: `PushSigningKey` y `VapidPrivateKey` (NoEcho) y `VapidPublicKey`. Laravel recibe `PUSH_SIGNING_KEY` y `PUSH_VAPID_PUBLIC_KEY`.
- `infra/scripts/init-secrets.sh` crea `/gymtracker/prod/push-signing-key`, `vapid-public-key` y `vapid-private-key` (el par VAPID se genera junto). `deploy.yml` los lee y los pasa como parámetros.

## Frontend (Angular)

**`PushService` (`core/push/push.service.ts`):**
- Estado por dispositivo en `localStorage` (`gymtracker.push`): `{ status: 'on' | 'declined', subscription?, signature? }`; ausencia = "sin preguntar". Señal `status: 'unsupported' | 'unasked' | 'on' | 'declined' | 'blocked'`.
- `unsupported` si `SwPush.isEnabled` es falso o no existe `PushManager`; `blocked` si `Notification.permission === 'denied'`.
- `enable()`: pide la clave pública a `/api/push/config` → `SwPush.requestSubscription({ serverPublicKey })` → `POST /api/push/token` → guarda `on`. Si el usuario niega el permiso → `blocked`. Devuelve si quedó activo.
- `disable()`: `SwPush.unsubscribe()` (ignora errores) y guarda `declined`.
- `decline()`: guarda `declined` ("Ahora no").
- `schedule(seconds, body, url)` (título fijo "¡Descanso terminado!") y `cancel()`: solo si `on`; llaman a `/push/rest` y `/push/cancel`; los errores se ignoran.
- Al iniciar: si está `on` pero `SwPush.subscription` emite `null`, vuelve a "sin preguntar".

**`RestTimerService`:** `start(seconds, notice?: RestNotice)` donde `RestNotice = { body: string; url: string }`. Programa el push al iniciar; `add()` reprograma con el mismo aviso y los segundos restantes; `stop()` cancela. Si el descanso termina solo no se hace nada.

**`exercise-card.ts`:** arma el aviso: `"<ejercicio> · serie <n+1> de <objetivo>"` (si no hay objetivo de series: `"<ejercicio> · serie <n+1>"`), url `/entrenamiento/<id de la sesión>`.

**Tarjeta de primera vez (`RestTimerBar`):** si el descanso está corriendo y `status === 'unasked'`, aparece sobre la barra: "¿Te aviso cuando termine el descanso, aunque tengas el teléfono bloqueado?" con **[Activar]** y **[Ahora no]**. Al activar, se programa de inmediato el descanso en curso.

**Mi cuenta:** sección "Avisos de descanso" con un interruptor (`role="switch"`). Mensajes:
- `unsupported`: "Este navegador no permite avisos. En iPhone, instala la app en tu pantalla de inicio."
- `blocked`: "Bloqueaste las notificaciones. Actívalas en Ajustes del teléfono."

## Errores

| Caso | Comportamiento |
|---|---|
| Sin señal / Lambda caída al programar o cancelar | Se ignora; barra y vibración siguen funcionando |
| "Saltar" no logra cancelar | Llega un aviso de más (aceptado) |
| Suscripción vencida (404/410) | Log en la Lambda; la app la detecta al abrirse y vuelve a preguntar |
| Firma inválida | 403 |
| Reloj del teléfono desfasado | No afecta: se mandan segundos relativos |

## Pruebas

- **Pest:** `PushSigner` (firma determinista, falla sin clave); `POST /api/push/token` (401 sin sesión, 422 endpoint inválido, firma correcta).
- **Vitest frontend:** `PushService` (estados, enable/disable, schedule/cancel, errores silenciosos) con `SwPush` y HTTP simulados; `RestTimerService` (programa, reprograma, cancela); `RestTimerBar` (tarjeta de primera vez); `AccountMenu` (interruptor y mensajes).
- **Vitest infra:** handler de la Lambda con Scheduler y `web-push` inyectados (firma, validaciones, horario armado, payload, 410); pruebas CDK (Lambda sin VPC, IAM acotado al grupo, rutas `/push/*`, behavior de CloudFront, parámetros NoEcho).

## Despliegue y verificación

1. Con OK de Luciano: `infra/scripts/init-secrets.sh` crea las claves en SSM.
2. Push a `main` → GitHub Actions despliega.
3. Prueba en iPhone: activar avisos, bloquear el teléfono, descanso de 30 s, medir el retraso.

En local los avisos no funcionan (no hay Scheduler); la app sigue con barra y vibración.
