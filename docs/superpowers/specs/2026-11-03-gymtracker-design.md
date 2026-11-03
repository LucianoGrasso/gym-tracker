# GymTracker — Especificación de diseño

- **Fecha:** 03/11/2026
- **Estado:** aprobado
- **Autor:** Luciano (con Claude Code)

Este documento reemplaza la sección "Stack técnico" del documento de contexto original (Laravel + Inertia + React) y fija las decisiones de arquitectura acordadas. El resto del contexto de producto (usuario, funcionalidades, datos iniciales) se mantiene y se resume aquí para que la spec sea autocontenida.

---

## 1. Objetivo

Aplicación web para **planificar rutinas de gimnasio, registrar cada serie (peso y reps) y ver el progreso**. Reemplaza una planilla Excel. Uso personal (un usuario), pero con modelo multiusuario (`user_id` + políticas).

Prioridades, en orden:
1. Registrar una serie en el celular en **≤ 5 segundos**, incluso con mala señal.
2. Gestionar ejercicios y rutinas sin tocar código.
3. Estadísticas que digan si hay progreso o estancamiento.

Además, el proyecto es una pieza de **portafolio/CV**: Angular + TypeScript, Laravel API y AWS serverless.

## 2. Contexto del usuario (resumen)

- Entrena 4 días/semana (lun, mar, jue, vie); descansa el miércoles.
- Dominadas casi diarias: importa el **total de reps por sesión**.
- Press banca PR 90 kg, estancado. Usa el **método Bilbo** (~30 reps explosivas al 45-50 % del 1RM; al llegar a ~35-40 reps limpias, subir 2,5-5 kg).
- Dolor en muñeca derecha y asimetría de fuerza en pecho: anotar **molestia por serie** y **lado** (izq/der).
- Equipamiento: mancuernas, barra, peso corporal, poleas, máquinas.

## 3. Stack

| Capa | Tecnología |
|---|---|
| Frontend | Angular (última versión estable), TypeScript estricto, componentes standalone, Signals |
| UI | Tailwind CSS + spartan/ui + Angular CDK (drag & drop) |
| Gráficos | ngx-echarts (Apache ECharts) |
| Datos locales | IndexedDB vía Dexie |
| Backend | Laravel (última estable) como API REST, Laravel Sanctum (modo SPA, cookies) |
| Base de datos | Postgres (desarrollo en Docker; producción Aurora Serverless v2 PostgreSQL) |
| Tests | Pest (backend, SQLite en memoria), Vitest (frontend) |
| Entorno | Docker Compose, Git, GitHub Actions |
| Infraestructura | AWS CDK en TypeScript (fase 5) |
| Locale | UI en español (Chile), kg, `dd/mm/aaaa`, zona `America/Santiago`, semanas desde el lunes, decimales con coma (`42,5 kg`) |

Código, tablas y variables en inglés; textos de interfaz en español.

## 4. Arquitectura

### 4.1 Repositorio (monorepo)

```
gym-tracker/
├── backend/            Laravel (solo API, sin vistas)
├── frontend/           Angular (SPA; PWA en fase 5)
├── infra/              AWS CDK (fase 5)
├── docker-compose.yml  postgres + backend + frontend (desarrollo)
├── docs/               specs y planes
└── CLAUDE.md           contexto del proyecto actualizado al nuevo stack
```

### 4.2 Mismo origen

- **Desarrollo:** el dev server de Angular hace proxy de `/api/*`, `/login`, `/logout` y `/sanctum/*` a Laravel. Frontend y API comparten origen.
- **Producción:** CloudFront sirve `/*` desde S3 y `/api/*` (más rutas de auth) desde API Gateway → Lambda.
- Consecuencia: Sanctum en modo SPA con cookies de sesión + CSRF funciona igual en ambos entornos.

### 4.3 Capas del backend

```
Route → Controller (delgado) → FormRequest (validación) → Service (lógica) → Model (Eloquent)
                                                                     ↓
                                                         API Resource (JSON)
```

- Todos los modelos de usuario usan un trait `BelongsToUser` con *global scope* por usuario autenticado; además, **Policies** por recurso.
- La lógica de estadísticas vive en `app/Services/Stats/*`, nunca en controladores.
- Requisitos "serverless-friendly" desde el inicio: `SESSION_DRIVER=database`, `CACHE_STORE=database`, sin escritura en disco local, `LOG_CHANNEL=stderr` en producción.

### 4.4 Autenticación

- Solo login/logout; **sin registro público**. El usuario se crea por seeder o comando `php artisan app:create-user`.
- Rutas: `GET /sanctum/csrf-cookie`, `POST /login`, `POST /logout`, `GET /api/user`.

## 5. Modelo de datos

Los enums se guardan en inglés; la UI los traduce.

- `muscle_group`: `chest`, `back`, `shoulders`, `biceps`, `triceps`, `legs`, `core`, `other`
- `equipment`: `barbell`, `dumbbell`, `bodyweight`, `machine`, `cable`
- `set_type`: `warmup`, `normal`, `bilbo`, `heavy`, `failure`, `dropset`
- `side`: `both`, `left`, `right`

| Tabla | PK | Campos |
|---|---|---|
| `users` | bigint | estándar Laravel |
| `exercises` | bigint | `user_id`, `name`, `muscle_group`, `equipment`, `is_unilateral` (bool), `uses_bodyweight` (bool), `notes`, `archived_at` (nullable), timestamps |
| `routines` | bigint | `user_id`, `name`, `notes`, `is_active` (bool), timestamps |
| `routine_days` | bigint | `routine_id`, `name`, `weekday` (1=lunes … 7=domingo, nullable), `position`, timestamps |
| `routine_day_exercises` | bigint | `routine_day_id`, `exercise_id`, `position`, `target_sets` (int), `target_reps_min`, `target_reps_max` (nullable), `target_text` (nullable, ej. "~30 explosivas"), `default_set_type`, `rest_seconds` (default 150), `notes`, timestamps |
| `workouts` | **ULID** | `user_id`, `routine_day_id` (nullable = sesión libre), `date`, `started_at`, `finished_at` (nullable), `bodyweight_kg` (decimal 5,2, nullable), `notes`, timestamps |
| `workout_exercises` | **ULID** | `workout_id`, `exercise_id`, `position`, copia de objetivos: `target_sets`, `target_reps_min`, `target_reps_max`, `target_text`, `default_set_type`, `rest_seconds`; `notes`, timestamps |
| `workout_sets` | **ULID** | `workout_exercise_id`, `set_number`, `set_type`, `weight_kg` (decimal 6,2), `reps` (int), `side` (default `both`), `rir` (0-10, nullable), `pain_level` (0-10, nullable), `notes`, timestamps |
| `body_metrics` | bigint | `user_id`, `date`, `bodyweight_kg`; único `(user_id, date)` |

Reglas:

1. **ULID en `workouts`, `workout_exercises` y `workout_sets`**: los genera el cliente para permitir creación sin conexión e idempotencia al sincronizar.
2. **Plantilla vs. historial**: al iniciar una sesión desde un día de rutina, se **copian** sus ejercicios y objetivos a `workout_exercises`. Editar la rutina nunca modifica el historial. Quitar o agregar ejercicios en una sesión solo afecta a esa sesión.
3. **Archivar, no borrar**: un ejercicio con historial no se elimina; se marca `archived_at`. Archivar solo lo oculta de selectores y listados por defecto; las estadísticas siempre lo incluyen. Un ejercicio sin historial sí puede eliminarse.
4. **`weight_kg`**: en mancuerna es el peso **por mano**; en ejercicios con `uses_bodyweight` es el **peso extra** (0 si no hay).
5. **Peso corporal efectivo de una sesión**: `workouts.bodyweight_kg` si existe; si no, el último `body_metrics` con `date <= workouts.date`; si no hay ninguno, la carga corporal se considera desconocida y la serie se excluye de cálculos que dependen de carga (no de los de reps).
6. Fechas y horas se guardan en UTC; `workouts.date` es la fecha local (`America/Santiago`) de la sesión.

## 6. API REST

Todas las rutas `/api/*` requieren autenticación (`auth:sanctum`) y se restringen al usuario.

```
Salud      GET    /api/health                              consulta mínima a la BD (despierta Aurora)
Hoy        GET    /api/today                               día de rutina activa según weekday + "última vez" por ejercicio

Ejercicios GET    /api/exercises?search=&muscle_group=&archived=
           POST   /api/exercises
           GET    /api/exercises/{id}
           PUT    /api/exercises/{id}
           DELETE /api/exercises/{id}                      solo si no tiene historial (409 si lo tiene)
           POST   /api/exercises/{id}/archive
           POST   /api/exercises/{id}/restore
           GET    /api/exercises/{id}/history              sesiones pasadas con sus series
           GET    /api/exercises/{id}/last-performance

Rutinas    GET|POST          /api/routines
           GET|PUT|DELETE    /api/routines/{id}
           POST              /api/routines/{id}/activate   desactiva las demás
           POST              /api/routines/{id}/days
           PUT|DELETE        /api/routine-days/{id}
           PUT               /api/routines/{id}/days/reorder
           POST              /api/routine-days/{id}/duplicate
           POST              /api/routine-days/{id}/exercises
           PUT|DELETE        /api/routine-day-exercises/{id}
           PUT               /api/routine-days/{id}/exercises/reorder

Sesiones   GET    /api/workouts?page=                      paginado, más reciente primero
           GET    /api/workouts/{ulid}
           PUT    /api/workouts/{ulid}                     upsert idempotente
           DELETE /api/workouts/{ulid}
           PUT    /api/workout-exercises/{ulid}            upsert idempotente
           DELETE /api/workout-exercises/{ulid}
           PUT    /api/workout-sets/{ulid}                 upsert idempotente
           DELETE /api/workout-sets/{ulid}

Peso       GET    /api/body-metrics?from=&to=
           PUT    /api/body-metrics/{date}                 upsert por fecha (aaaa-mm-dd)

Stats      GET    /api/stats/exercises/{id}?period=4w|12w|6m|1y|all
           GET    /api/stats/overview?period=
           GET    /api/stats/weekly-volume?period=&muscle_group=
           GET    /api/stats/consistency?period=
           GET    /api/stats/bodyweight?period=
```

Semántica de sincronización:
- `PUT /{ulid}` crea si no existe y actualiza si existe; repetir la misma petición produce el mismo estado. Si el ULID existe pero pertenece a otro usuario → 404.
- `DELETE /{ulid}` de un recurso inexistente responde `204` (idempotente).
- Al crear un `workout_set`, su `workout_exercise` y `workout` deben existir; la cola del cliente garantiza el orden (FIFO).
- Errores de validación → `422` con el formato estándar de Laravel; el cliente los marca como fallidos permanentes (no reintenta) y los muestra.

## 7. Frontend

### 7.1 Estructura

```
frontend/src/app/
├── core/
│   ├── auth/          AuthService, guard, interceptor CSRF/credenciales
│   ├── api/           servicios HTTP tipados por recurso
│   ├── models/        interfaces TS: Exercise, Routine, RoutineDay, Workout, WorkoutExercise, WorkoutSet, ...
│   ├── local-db/      Dexie: tablas cache y outbox
│   ├── sync/          SyncService (outbox → API)
│   └── format/        formatters es-CL (kg, fechas, números)
├── shared/ui/         componentes spartan/ui, NumberStepper, RestTimer, BottomNav, SyncIndicator
└── features/          today, workout-logger, routines, exercises, stats (rutas con lazy loading)
```

- Estado con **servicios + Signals**; sin NgRx.
- Navegación inferior en móvil: **Hoy · Rutinas · Ejercicios · Estadísticas**.
- Tema oscuro por defecto, alto contraste, objetivos táctiles ≥ 48 px, mobile-first.

### 7.2 Pantalla "Hoy"

- Muestra el día de la rutina activa cuyo `weekday` coincide con hoy (`America/Santiago`); si no hay, ofrece elegir un día o sesión libre.
- Botón "Empezar entrenamiento"; si hay una sesión sin terminar, "Continuar entrenamiento".
- Al abrir la app se llama a `/api/health` (despertar BD) sin bloquear la UI.

### 7.3 Registro de entrenamiento

- Una tarjeta por `workout_exercise` con: "Última vez: 42,5 kg × 30" y objetivo de hoy.
- Entrada de serie: peso y reps con `−`/`+` (2,5 kg y 1 rep), teclado numérico al tocar el valor, botón "Copiar serie anterior"; valores iniciales = última serie de esta sesión o, si no hay, primera serie de la última vez.
- Botón "Guardar serie" grande; la serie aparece al instante (escritura local).
- Opcionales colapsables: lado, RIR, molestia 0-10, nota.
- Temporizador de descanso: arranca al guardar, duración `rest_seconds` del ejercicio; calculado desde un timestamp guardado (sobrevive recargas); vibración al terminar donde el navegador lo soporte.
- Agregar ejercicio extra / quitar ejercicio solo para esta sesión; reordenar.
- Editar y borrar series y sesiones pasadas (también por la outbox).
- Series Bilbo: objetivo "superar N reps" (N = reps de la última serie Bilbo de ese ejercicio) y aviso de subir 2,5-5 kg cuando reps ≥ 35.
- Botón "Terminar entrenamiento" fija `finished_at`.

### 7.4 Guardado local y sincronización

```
Acción del usuario → escribe en IndexedDB (cache) → encola op en outbox → SyncService
                                                                         ↓ online, FIFO
                                                                    API (PUT/DELETE por ULID)
                                                                         ↓ 2xx
                                                                    elimina op de outbox
```

- **cache:** rutina activa, datos de "Hoy", "última vez" por ejercicio, lista de ejercicios, sesión en curso.
- **outbox:** `{ id, method, url, body, createdAt, attempts, lastError }`.
- SyncService procesa en orden FIFO cuando hay conexión (`online`, al guardar, al volver a la app y cada 30 s mientras haya pendientes). Errores de red/5xx → reintento con backoff exponencial (máx. 5 min); `401` → pedir login sin perder la outbox; `422` → marcar como fallida y mostrar.
- Conflictos: gana la última escritura (un solo usuario, IDs ULID).
- `SyncIndicator` muestra: sincronizado · pendientes (n) · sin conexión · error.

## 8. Estadísticas

Servicios en `backend/app/Services/Stats/`, funciones puras sobre colecciones donde sea posible:

| Servicio | Responsabilidad |
|---|---|
| `EffectiveLoadResolver` | Carga de una serie: `weight_kg`, o `peso corporal efectivo + weight_kg` si `uses_bodyweight` |
| `OneRepMaxCalculator` | Epley: `carga × (1 + reps / 30)`; si `reps = 1`, devuelve la carga |
| `VolumeCalculator` | `Σ carga × reps` por sesión / semana |
| `PersonalRecordsService` | PR de peso, de reps (con cualquier peso), de 1RM estimado, con fecha |
| `ConsistencyService` | Sesiones por semana, racha de semanas con ≥ 1 sesión, datos de mapa de calor |
| `WeeklyMuscleVolumeService` | Volumen semanal por grupo muscular |

Reglas de cálculo:
1. Las series `warmup` se excluyen de todos los cálculos (1RM, PRs, volumen y total de reps). Siguen visibles en el historial.
2. El **1RM estimado** solo usa series con **1 a 12 reps** y `set_type != bilbo`.
3. Las series Bilbo tienen su propia serie temporal (reps y carga por sesión).
4. Volumen de ejercicios unilaterales: cada serie (izq/der) suma por separado con su peso por mano.
5. Períodos: `4w`, `12w`, `6m`, `1y`, `all`, calculados en `America/Santiago`; semanas de lunes a domingo.
6. Ejercicios archivados se incluyen siempre.

Endpoint por ejercicio devuelve por sesión: fecha, 1RM estimado máx., mejor carga y reps con esa carga, volumen, total de reps, series Bilbo; más la tabla de PRs.

Visualización (fase 4, ECharts): líneas para 1RM/mejor peso/volumen/reps totales; barras apiladas para volumen semanal por grupo; calendario tipo heatmap para constancia; línea de peso corporal; tarjetas de resumen (sesiones, volumen total, PRs recientes).

## 9. Testing

- **Pest unitario:** cada servicio de estadísticas, con casos borde: Bilbo, calentamiento, peso corporal (con/sin registro previo), reps = 1, reps > 12, unilaterales, ejercicio archivado, límites de semana y zona horaria.
- **Pest feature:** aislamiento entre usuarios en todos los recursos, upsert/delete idempotentes por ULID, validación de Form Requests, archivar vs. borrar, copia de plantilla al iniciar sesión.
- **Vitest:** SyncService/outbox (orden, reintentos, 422, 401), lógica del stepper, formatters es-CL, cálculo del temporizador.
- Cada fase termina con todos los tests en verde y un commit.

## 10. Despliegue en AWS (fase 5)

```
gym.dominio ──► CloudFront ──┬── /*                            → S3 (Angular build)
                             └── /api/*, /login, /logout,
                                 /sanctum/*                    → API Gateway HTTP API → Lambda (Laravel + Bref)
                                                                                         │ (VPC, subredes privadas, sin NAT)
                                                                                         ▼
                                                                Aurora Serverless v2 PostgreSQL (min 0 ACU, auto-pause)
EventBridge Scheduler (lun, mar, jue, vie 18:45 America/Santiago) → Lambda "warm-up" → consulta mínima a Aurora
```

- Infraestructura en **AWS CDK (TypeScript)** en `infra/`; despliegue con **GitHub Actions**.
- Secretos en **SSM Parameter Store** (no Secrets Manager). Sin NAT Gateway ni RDS Proxy.
- Horario del despertar programado configurable por parámetro.
- Costo objetivo ~USD 2-3/mes con el uso esperado (≈ 4 sesiones/semana); validar con AWS Pricing Calculator antes de desplegar.
- Mitigación del despertar de Aurora (~15 s): despertar programado + ping a `/api/health` al abrir + guardado local (sección 7.4).

## 11. Fases

| Fase | Contenido | Criterio de cierre |
|---|---|---|
| 1. Base | Monorepo, Laravel + Sanctum, Angular + Tailwind + spartan/ui, Docker Compose, migraciones, modelos, policies, seeders (ejercicios y rutina de la sección 12), login, `CLAUDE.md` actualizado | Login funciona en el navegador vía proxy; migraciones + seeders corren; tests en verde |
| 2. Ejercicios y rutinas | CRUD con búsqueda y filtro, archivar/restaurar, rutinas con días, reordenar (CDK), duplicar día, rutina activa, pantalla "Hoy" | Crear ejercicio y rutina y ver "hoy te toca…" |
| 3. Registro | Flujo de sesión, series, stepper, temporizador, "última vez", Bilbo, editar/borrar pasado, **guardado local + outbox** | Sesión completa en el celular, también sin conexión |
| 4. Estadísticas | Servicios con tests; endpoints; gráficos ECharts | 1RM, volumen y reps totales por ejercicio en el tiempo |
| 5. Producción | Importar CSV/Excel (`Fecha, Ejercicio, Serie, Peso (kg), Reps, 1RM estimado, Notas`, ofreciendo crear ejercicios faltantes), exportar CSV, PWA instalable, infraestructura AWS y CI/CD | App desplegada y accesible en AWS |
| 6. Extras | Sugerencias de progresión (doble progresión, Bilbo, estancamiento 4-6 semanas), asimetría izq/der, gráfico de molestias | — |

## 12. Datos iniciales (seeder)

**Lunes – Pecho (Bilbo):** Serie Bilbo con barra (1 serie, ~30 reps explosivas, 40-45 kg) · Press con mancuernas 3×8-12 · Press inclinado con mancuernas 3×8-12 · Elevaciones laterales 3×12-15

**Martes – Espalda y bíceps:** Dominadas 6×5-6 (texto: "5-6 series, parar con 1-2 RIR", descanso 150 s) · Remo con barra o mancuerna 3×8-10 · Jalón o remo en polea 3×10-12 · Curl de bíceps 3×10-12

**Jueves – Pecho pesado y tríceps:** Press de banca pesado 5×2-4 (texto: "4-5 series, 70-80 kg") · Fondos o press cerrado 3×6-10 · Press de hombro 3×8-10 · Tríceps 3×10-12

**Viernes – Piernas:** Sentadilla o prensa 4×6-10 (texto: "3-4 series") · Peso muerto rumano 3×8-10 · Curl femoral 3×10-15 · Gemelos 3×10-15 · Dominadas suaves 3×4-5 (texto: "día liviano")

Cuando el documento original da un rango de series, `target_sets` toma el máximo y el rango completo va en `target_text`.

## 13. Criterios de aceptación del MVP (fases 1-4)

- Crear un ejercicio y una rutina, y ver "hoy te toca…" al abrir la app.
- Registrar un entrenamiento completo en el celular; cada serie toma pocos segundos; nada se pierde al cerrar la pestaña o perder la señal.
- Al abrir un ejercicio se ve lo que se hizo la última vez.
- Estadísticas por ejercicio: 1RM estimado, volumen y reps totales por sesión a lo largo del tiempo.
- Archivar un ejercicio no cambia las estadísticas pasadas.
- Los cálculos (Epley, volumen, PRs) tienen tests y pasan.

## 14. Fuera de alcance (por ahora)

Registro público de usuarios, NgRx, notificaciones push, app nativa, integración con wearables, sugerencias automáticas de horario de despertar.
