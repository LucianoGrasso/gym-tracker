# Invitaciones y cuenta — Especificación de diseño

- **Fecha:** 06/11/2026
- **Estado:** aprobado (diseño conversado con Luciano)
- **Autor:** Luciano (con Claude Code)

## 1. Objetivo

Permitir que otras personas usen GymTracker **solo por invitación**, sin abrir un registro público:
- Cualquier usuario genera un link de invitación y lo comparte. Quien lo abre crea su cuenta y entra directo.
- No hay registro sin link: el formulario no es accesible para cualquiera y el costo de Aurora queda acotado a gente conocida.
- Se agrega la pantalla **Cuenta**, con las invitaciones y "Cerrar sesión" (hoy la app no tiene cómo cerrar sesión).
- Para contener el costo, la auto-pausa de Aurora baja de 10 a 5 minutos (el mínimo de AWS).

Fuera de alcance: registro abierto, verificación por email, recuperación de contraseña, roles o administrador, borrar la cuenta y limpiar los datos locales (Dexie) al cambiar de usuario en el mismo dispositivo.

## 2. Reglas

- Cualquier usuario autenticado puede invitar.
- El link es de **un solo uso** y **vence a los 7 días**.
- Cada usuario tiene como máximo **5 invitaciones pendientes** (sin usar y sin vencer). Si llega al tope, debe anular una.
- El token es aleatorio de 40 caracteres y en la BD se guarda solo su **SHA-256**. El token en claro se devuelve una sola vez, al crear la invitación.
- El usuario invitado parte con los **15 ejercicios base y sin rutina**.
- Al registrarse queda con sesión iniciada (cookie de Sanctum), igual que tras un login.

## 3. Backend

### 3.1 Datos

Tabla `invitations`:
- `id`;
- `user_id` (quien invita; FK con `cascadeOnDelete`);
- `token_hash` (string 64, único);
- `expires_at`;
- `accepted_at` (nullable);
- `accepted_user_id` (FK nullable a `users`, `nullOnDelete`);
- timestamps.

Modelo `Invitation` con `BelongsToUser` (scope por quien invita) y:
- `scopePending`: `accepted_at` nulo y `expires_at` en el futuro;
- `isUsable()`;
- `static findByToken(string $token): ?Invitation`, que busca sin global scope por `hash('sha256', $token)`.

### 3.2 Endpoints con sesión (`routes/api.php`, `auth:sanctum`)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/invitations` | 200: pendientes del usuario `{id, expires_at}`, la más nueva primero |
| POST | `/api/invitations` | 201: `{id, expires_at, token}` · 422 si ya tiene 5 pendientes ("Tienes 5 invitaciones pendientes. Anula una para crear otra.") |
| DELETE | `/api/invitations/{invitation}` | 204 · 404 si no es suya (lo resuelve el global scope) |

### 3.3 Endpoints públicos (`routes/web.php`, prefijo `auth`, con sesión web)

| Método | Ruta | Límite | Respuesta |
|---|---|---|---|
| GET | `/auth/invitations/{token}` | `throttle:30,1` | 200: `{inviter_name, expires_at}` · 404 si no existe · 410 si está usada o vencida |
| POST | `/auth/register` | `throttle:6,1` | 201: `UserResource` con sesión iniciada · 422 de validación · 410 si el token ya no sirve |

`RegisterRequest`: `token` requerido; `name` requerido (máximo 100); `email` requerido, email válido, máximo 255 y único en `users`; `password` requerido, mínimo 8, `confirmed`.

Mensaje del 410: "Este link de invitación ya no es válido."

### 3.4 Servicios

- `App\Services\Invitations\CreateInvitation::handle(User $inviter): array{invitation: Invitation, token: string}`. Valida el tope (lanza `ValidationException` con el mensaje de 3.2).
- `App\Services\Invitations\AcceptInvitation::handle(string $token, array $data): User`. En una transacción:
  - bloquea la invitación (`lockForUpdate`) y verifica `isUsable()`; si no sirve, `abort(410, …)`;
  - crea el usuario y siembra los ejercicios base;
  - marca `accepted_at` y `accepted_user_id`.
- `GymTrackerSeeder` expone `seedExercises(User $user): Collection` (solo los 15 ejercicios); `run()` la usa y luego crea la rutina.
- El controlador `RegisteredUserController` llama a `AcceptInvitation`, hace `Auth::guard('web')->login($user, remember: true)` y regenera la sesión.

### 3.5 Infraestructura

`infra/lib/database.ts`: `serverlessV2AutoPauseDuration: Duration.minutes(5)` (test: `SecondsUntilAutoPause: 300`). Se aplica sin reemplazo del cluster en el próximo deploy.

### 3.6 Tests (Pest)

- **Invitaciones:**
  - requiere sesión;
  - crear devuelve un token de 40 caracteres y vence en 7 días; la BD guarda el hash y no el token;
  - el listado muestra solo las pendientes propias;
  - el tope de 5 responde 422;
  - anular una propia da 204 y una ajena da 404.
- **Vista previa:** válida (muestra el nombre de quien invita), inexistente (404), vencida (410), usada (410).
- **Registro:**
  - crea el usuario con la contraseña hasheada, queda autenticado, siembra 15 ejercicios, no crea rutina y marca la invitación como aceptada;
  - un email duplicado o una confirmación distinta dan 422 y no consumen la invitación;
  - un token vencido o usado da 410 y no crea el usuario.
- **Seeder:** `run()` sigue igual (sus tests actuales).

## 4. Frontend

### 4.1 Pantallas

**`/cuenta`** (dentro del shell, con sesión). Se entra desde el nombre en "Hoy".
- Muestra el nombre y el email.
- **Invitar a alguien:** crea la invitación, arma la URL `${location.origin}/registro/${token}` y llama a `navigator.share({ title: 'GymTracker', text: '<nombre> te invitó a GymTracker', url })`. Si `share` no existe, usa `navigator.clipboard.writeText(url)` y muestra "Link copiado". Si el usuario cancela el menú de compartir (`AbortError`), no muestra nada.
- **Invitaciones pendientes:** cada una con "Vence el dd/mm/aaaa" y un botón **Anular**. Con 5 pendientes, el botón de invitar se desactiva y aparece el aviso del tope.
- **Cerrar sesión:** llama a `auth.logout()` y navega a `/login`.

**`/registro/:token`** (pública, mismo estilo que el login).
- Al entrar consulta si ya hay sesión (`auth.loadUser()`, ignorando errores). Si hay sesión, muestra "Ya tienes una sesión iniciada" con dos botones: "Ir a GymTracker" (`/hoy`) y "Cerrar sesión para usar esta invitación", que cierra la sesión y vuelve a mostrar el formulario.
- Consulta la vista previa del link:
  - **válido:** "**<nombre>** te invitó a GymTracker" y el formulario (nombre, correo, contraseña, confirmar contraseña);
  - **inválido** (cualquier error): "Este link de invitación ya no es válido. Pídele uno nuevo a quien te invitó." y un enlace al login.
- Al enviar se llama a `auth.register(...)`, después a `sync.flush()`, y se navega a `/hoy`.
  - Un 422 muestra el primer error de cada campo bajo el campo.
  - Un 410 muestra el mensaje de link inválido.
  - Otros errores muestran "No se pudo conectar. Intenta de nuevo."

### 4.2 Cambios en lo existente

- **`AuthService.register(input: RegisterInput): Promise<User>`.** Pide `/sanctum/csrf-cookie`, hace el POST a `/auth/register` y fija el usuario.
- **Hoy:**
  - el saludo con el nombre pasa a ser un enlace a `/cuenta` (`aria-label="Mi cuenta"`);
  - el estado sin rutina cambia a "Elige una plantilla para empezar", con el texto "Parte con una rutina de un programa o atleta conocido, o crea la tuya.", el botón "Ver plantillas" (`/rutinas/plantillas`), el enlace secundario "Ir a mis rutinas" y "Sesión libre" como hoy.
- **Rutas:**
  - `registro/:token` va fuera del shell y sin guard, junto a `login`;
  - `cuenta` va dentro del shell.

### 4.3 Código

- `core/api/invitations-api.ts`: `list()`, `create()`, `revoke(id)`, `preview(token)`.
- `core/models/invitation.ts`: `Invitation`, `CreatedInvitation` e `InvitationPreview`.
- `features/account/account-page.ts` y `features/auth/register-page.ts`.

### 4.4 Tests (Vitest)

- **`InvitationsApi`:** URLs y verbos.
- **`AuthService.register`:** pide el CSRF, luego el POST, y fija el usuario.
- **Cuenta:**
  - con `share` disponible, lo llama con la URL `/registro/<token>`;
  - sin `share`, copia al portapapeles y muestra "Link copiado";
  - con 5 pendientes, el botón queda desactivado;
  - anular quita la invitación de la lista.
- **Registro:**
  - un link inválido muestra su mensaje;
  - uno válido muestra quién invita, y al enviar registra y navega a `/hoy`;
  - un 422 muestra el error bajo el campo del email.
- **Hoy:** sin rutina muestra "Elige una plantilla para empezar" y el enlace a `/rutinas/plantillas`.

## 5. Entrega

Rama `invitaciones`, con un commit por tarea y los tests en verde. Luciano prueba en local el flujo completo: invitar, abrir el link en una ventana privada, registrarse y elegir una plantilla. Después dice "intégralo a main".
