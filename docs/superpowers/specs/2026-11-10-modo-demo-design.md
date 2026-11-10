# Modo demo ("Probar demo") — diseño

Fecha: 2026-11-10 · Estado: aprobado por Luciano

## Objetivo

Que cualquiera que llegue desde LinkedIn pruebe la app completa sin registrarse: un botón en el login
crea una cuenta temporal con datos realistas, y hoy siempre hay un entreno listo para empezar.

## Decisiones

- El invitado puede hacer **todo** (rutinas, entrenar, estadísticas), en su propia cuenta aislada.
- Dura **2 horas** (`users.demo_expires_at`). Sin tareas programadas (despertarían Aurora): al crear una
  demo nueva se borran las vencidas.
- Datos: los 15 ejercicios iniciales + la rutina de 4 días de Luciano (`GymTrackerSeeder`), con los días
  **corridos** para que el primero caiga hoy (misma separación: hoy, +1, +3, +4) y los nombres con el día
  correcto. 6 semanas de historial creíble + peso corporal semanal.
- Seguridad: la demo no puede crear invitaciones (403); `POST /auth/demo` con límite de 5 por hora por IP (limitador `demo`) y
  tope global de 50 demos activas (503 "La demo está llena. Intenta en un rato.").
- Una demo vencida recibe 401 en `/api/*` (middleware `demo.active`) y su sesión se cierra.
- Push funciona igual que para cualquier usuario.

## Backend

- Migración: `users.demo_expires_at` timestamp nullable. `User::isDemo()`. `UserResource` expone
  `demo_expires_at` (ISO 8601 o null).
- `App\Http\Middleware\EnsureDemoActive` (alias `demo.active`) en el grupo `auth:sanctum` de `api.php`.
- `InvitationController::store` → 403 si `isDemo()`.
- `App\Services\Demo\CreateDemoAccount`: `purgeExpired()`, `isFull()`, `create()`.
  - Borrado: workouts → routines → user (workout_exercises y routine_day_exercises restringen el borrado
    de exercises).
- `App\Services\Demo\DemoHistory::generate(User, Routine, CarbonImmutable $today)`: pseudoaleatorio con
  semilla fija (`Mt19937(2026)`).
  - Recorre los últimos 42 días; en los días de la rutina crea el entreno (19:00-19:40 hora Santiago,
    55-80 min), salvo hasta 2 saltados.
  - Carga base por ejercicio; sube 2,5 kg cada 3 sesiones del ejercicio. Peso corporal = 0 kg siempre.
  - Pesada: 2 calentamientos (50 % × 8, 70 % × 4) antes de las efectivas.
  - Bilbo: 40 kg fijos, reps 28 + n.º de sesión (+0/1).
  - Peso corporal: 7 registros semanales (hoy y 6 semanas atrás), de ~79,2 bajando ~0,25 kg/semana ± 0,3.
- `POST /auth/demo` (`DemoController`): purga, 503 si está llena, crea, inicia sesión, 201 con el usuario.

## Frontend

- `User.demo_expires_at: string | null`.
- `AuthService.startDemo()`.
- Login: botón "Probar demo (sin registro)" bajo el formulario; errores 429 ("Ya creaste varias demos.
  Intenta en un rato.") y 503 (mensaje del servidor).
- `DemoBanner` (arriba del contenido en el shell): "Modo demo · se borra en 1 h 52 min" + "Salir". Se
  actualiza cada 30 s; al vencer cierra la sesión y lleva a `/login`.
- `AccountMenu`: sin "Invitar a alguien" ni invitaciones pendientes en una demo.

## Tests

- Pest: acceso (resource, 401 al vencer, 403 invitar), creación (sesión, hoy con entreno, historial,
  calentamientos, progresión, peso corporal), purga con historial, tope de 50, throttle.
- Vitest: `startDemo`, botón del login, `DemoBanner` (texto, salir, vencimiento), menú sin invitar.
