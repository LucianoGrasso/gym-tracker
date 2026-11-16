# Cardio — diseño

Fecha: 2026-11-16 · Rama: `cardio`.

## Objetivo

Registrar cardio en GymTracker (por ejemplo, caminata inclinada en trotadora los miércoles) con duración, velocidad, inclinación, distancia, FC promedio y calorías, y ver un resumen y el progreso por ejercicio en Estadísticas, sin contaminar las estadísticas de fuerza.

Fuera de alcance: importar desde Apple Health (proyecto siguiente, vía Atajo de iOS → endpoint con token) y récords de cardio (sesión más larga, mayor distancia).

## 1. Datos

### Ejercicios

- Enum nuevo `App\Enums\ExerciseKind`: `strength` | `cardio`.
- Migración: `exercises.kind` string(10), default `strength`, no nulo.
- Un ejercicio de cardio se guarda con `muscle_group = 'other'`, `secondary_muscles = []`, `is_unilateral = false`, `uses_bodyweight = false` (el `ExerciseRequest` fuerza esos valores cuando `kind = cardio`). La columna `muscle_group` sigue NOT NULL y `MuscleGroup::from()` sigue funcionando.
- `kind` no se puede cambiar si el ejercicio ya tiene historial (`workout_exercises`): validación en el `ExerciseRequest` de actualización.
- Biblioteca (`ExerciseCatalog`): las tuplas suman `kind` y se agregan 8 ejercicios de cardio:

| Nombre | Equipamiento |
|---|---|
| Caminata inclinada en trotadora | machine |
| Trote en trotadora | machine |
| Bicicleta estática | machine |
| Elíptica | machine |
| Remoergómetro | machine |
| Escaladora | machine |
| Caminata al aire libre | bodyweight |
| Trote al aire libre | bodyweight |

### Series (tramos)

Un tramo de cardio es una fila de `workout_sets` (caminata continua = 1 tramo; intervalos = varios). Se reusan el ULID, la cola offline y la sincronización existentes.

Migración: `workout_sets` suma columnas nullable:

| Columna | Tipo | Validación |
|---|---|---|
| `duration_seconds` | unsignedInteger | 1–86400 |
| `speed_kmh` | decimal(4,1) | 0–60 |
| `incline_pct` | decimal(3,1) | 0–40 |
| `distance_km` | decimal(6,2) | 0–999,99 |
| `avg_heart_rate` | unsignedSmallInteger | 30–250 |
| `calories` | unsignedSmallInteger | 0–9999 |

- En cardio: `weight_kg = 0`, `reps = 0`, `set_type = normal`, `side = both` (lo envía el cliente; el backend no los recalcula).
- `WorkoutSetRequest`: `duration_seconds` es `required` cuando el ejercicio del `workout_exercise_id` es de cardio; los demás campos de cardio son `nullable`. En fuerza, los campos de cardio llegan nulos y se guardan nulos.
- La cola offline del frontend (Dexie) y el `WorkoutSetResource` llevan los seis campos nuevos.

## 2. Registro en la sesión

Tarjeta de ejercicio de cardio (componente propio, la tarjeta de fuerza no cambia):

- Botones ±: Duración ±1 min, Velocidad ±0,5 km/h, Inclinación ±0,5 %.
- "Más" despliega Distancia (km), FC promedio y Calorías.
- Prellenado del tramo nuevo: el tramo anterior de la sesión; si no hay, el primer tramo de la última vez que se hizo el ejercicio; si no hay historial, 30 min y el resto vacío.
- Filas: "35 min · 5,5 km/h · 12 %" (solo los campos presentes). Pie: "Total: 35 min · 3,2 km" (distancia solo si algún tramo la tiene).
- Sin temporizador de descanso, sin chip de calentamiento, sin sugerencia de progresión, sin aviso de estancamiento.

## 3. Rutinas

- Ítem de cardio en un día de rutina: `target_sets` = número de tramos (default 1) y `target_text` libre (ej. "35 min · 12 %"). Se ocultan reps objetivo y descanso en el formulario y en la vista.
- Al iniciar la sesión se copian igual que hoy a `workout_exercises`.
- En "Hoy", el ítem de cardio queda hecho al registrar el primer tramo.

## 4. Estadísticas

### Separar fuerza y cardio

- `StatsDataLoader::sets()` filtra `e.kind = 'strength'`. Así quedan sin cardio, sin tocar sus servicios: mapa corporal, series por músculo, récords, 1RM, series efectivas y estancamiento.
- Sesiones, racha y constancia siguen usando `workoutDates()`: una sesión solo de cardio cuenta como sesión y semana de racha.

### Carga de datos

`StatsDataLoader::cardioSegments(?int $exerciseId = null): Collection<int, CardioRow>` — tramos de ejercicios `kind = cardio` del usuario (archivados incluidos), del más antiguo al más nuevo.

`CardioRow` (readonly): `workoutId`, `date`, `exerciseId`, `exerciseName`, `durationSeconds`, `speedKmh`, `inclinePct`, `distanceKm`, `avgHeartRate`, `calories` (los opcionales son `?float`/`?int`).

### Servicio

`App\Services\Stats\CardioService` (sin consultas a la BD):

```php
/** @return array{minutes:int, sessions:int, distance_km:float} */
public function summary(Collection $rows, ?string $from): array

/** @return list<array{workout_id:string, date:string, minutes:float, distance_km:?float, calories:?int, avg_speed_kmh:?float, avg_incline_pct:?float, avg_heart_rate:?int}> */
public function progress(Collection $rows, ?string $from): array
```

- `summary`: tramos con `date >= from`; `minutes` = suma de duraciones / 60 redondeado; `sessions` = `workoutId` distintos; `distance_km` = suma (0 si ninguno).
- `progress`: una entrada por sesión (`workoutId`), en orden cronológico. `minutes` = suma / 60 con un decimal; `distance_km` y `calories` = suma de los tramos que los tienen (`null` si ninguno). Velocidad, inclinación y FC = promedio **ponderado por duración** sobre los tramos que tienen ese dato (`null` si ninguno); velocidad e inclinación con un decimal, FC entera.

### API

- `GET /api/stats/overview` suma `cardio: { minutes, sessions, distance_km }` (del período). La lista `exercises` incluye además los ejercicios de cardio con tramos, y cada elemento suma `kind`.
- `GET /api/stats/exercises/{exercise}`:
  - Fuerza: sin cambios (más `kind: 'strength'` en `exercise`).
  - Cardio: `{ exercise: { id, name, kind: 'cardio' }, sessions: CardioService::progress(...) }`, sin `records` ni `stalled`.

### Interfaz

- Resumen de Estadísticas: tarjeta "Cardio" → "140 min · 4 sesiones · 12,3 km" (km solo si > 0). Oculta si `cardio.sessions = 0`.
- Detalle de ejercicio de cardio (`exercise-stats-page`, rama por `kind`): chips Duración · Distancia · Inclinación prom. · Velocidad prom. · FC prom.; el chip elegido muestra un gráfico de línea por sesión con el componente de gráfico existente. Un chip sin ningún dato no se muestra. Sin récords, 1RM ni aviso de estancamiento.
- Selector de ejercicio en Estadísticas: los de cardio aparecen junto a los de fuerza.

## 5. Formulario de ejercicio

Selector "Tipo: Fuerza / Cardio" (default Fuerza). Con Cardio se ocultan músculo principal, secundarios, unilateral y peso corporal. Deshabilitado al editar un ejercicio con historial.

## Tests

Backend (Pest):
- `ExerciseRequest`: con `kind = cardio` se guarda `muscle_group = other` y sin secundarios; no se puede cambiar `kind` con historial.
- `WorkoutSetRequest`: cardio exige `duration_seconds`; rangos de los campos nuevos; fuerza sigue igual.
- `CardioService`: suma de minutos/sesiones/distancia, promedios ponderados con tramos sin dato, filtro por período, nulos cuando no hay datos.
- `StatsDataLoader::sets()` excluye cardio; `cardioSegments()` respeta el usuario y el filtro de ejercicio.
- Overview con bloque `cardio` y `kind` en `exercises`; endpoint de ejercicio de cardio con su formato.
- Catálogo: los 8 ejercicios de cardio con `kind = cardio`.

Frontend (Vitest):
- Tarjeta de cardio: prellenado, botones ±, formato de filas y total, sin temporizador.
- Formulario de ejercicio: el tipo Cardio oculta los campos de músculos.
- Resumen: tarjeta Cardio visible/oculta.
- Detalle de cardio: chips sin datos ocultos, cambio de métrica.

## Entrega

Dos planes, cada uno con tests en verde y commit:
1. Datos + registro + rutinas (secciones 1, 2, 3 y 5).
2. Estadísticas (sección 4).
