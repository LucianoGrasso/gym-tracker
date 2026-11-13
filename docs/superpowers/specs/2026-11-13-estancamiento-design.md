# Detección de estancamiento — diseño

Fecha: 2026-11-13 · Rama: `estancamiento` · Fase 6 de la spec principal, parte B (la parte A, sugerencias de progresión en la sesión, ya está en producción).

## Objetivo

En Estadísticas, avisar qué ejercicios llevan 4 semanas sin un nuevo mejor 1RM estimado a pesar de entrenarlos, y sugerir una descarga concreta más alternativas.

## Regla

Servicio `App\Services\Stats\StalledExercisesService` (sin consultas a la BD; recibe datos como el resto de `Services/Stats`).

```php
/**
 * @param  Collection<int, SetRow>  $sets       todas las series del usuario (StatsDataLoader::sets())
 * @param  array<int, Equipment>    $active     ejercicios activos (archived_at null): id => equipamiento
 * @return list<array{exercise_id:int, name:string, best_e1rm_kg:float, best_date:string, sessions_since:int, deload_kg:?float}>
 */
public function stalled(Collection $sets, array $active, string $today): array
```

Por cada ejercicio de `$active`:

1. Sesiones = series agrupadas por `workoutId`; el 1RM estimado de una sesión es el máximo de `OneRepMaxCalculator::forSet` sobre sus series (con `EffectiveLoadResolver`). Las sesiones sin 1RM (solo calentamientos, Bilbo, >12 reps) se descartan.
2. `windowStart = today - 28 días`. `recent` = sesiones con `date >= windowStart`; `before` = sesiones con `date < windowStart`.
3. Estancado si `count(recent) >= 3`, `count(before) >= 1` y `max(recent e1RM) <= max(before e1RM)`.
4. `best_e1rm_kg` = mejor 1RM de todo el historial (= el de `before`); `best_date` = fecha de la **primera** sesión que lo alcanzó.
5. `sessions_since` = sesiones con 1RM posteriores a `best_date`.
6. `deload_kg`: si el ejercicio usa peso corporal o el equipamiento es banda → `null`. Si no: `floor(0,9 × peso más alto entre las series efectivas de la última sesión / escalón) × escalón`, con escalón barbell/smith/dumbbell 2,5 · machine/cable 5 · kettlebell 4.
7. Orden: `best_date` ascendente (estancado hace más tiempo primero).

Constantes: `WINDOW_DAYS = 28`, `MIN_SESSIONS = 3`, `DELOAD_FACTOR = 0.9`.

## API

- `GET /api/stats/stalled` → `{ "data": { "exercises": [ … ] } }` (con el mismo `respond()` del `StatsController`; `today` sale de `StatsRequest::today()`).
- `GET /api/stats/exercises/{exercise}` suma `stalled`: el objeto del ejercicio o `null`.
- Ejercicios activos: `Exercise::query()->whereNull('archived_at')` (el scope `BelongsToUser` ya restringe al usuario).

## Interfaz

- `StatsApi` (frontend) gana `stalled()`; tipo `StalledExercise` en `core/models/stats.ts`.
- **Estadísticas** (`stats-page.ts`): sección "Estancados" después de "Récords recientes", solo si la lista no está vacía. Cada fila (enlace al detalle del ejercicio):
  - "Press de banca" · "Sin récord desde 02/10/2026 · 4 sesiones"
  - "Descarga: una semana con 72,5 kg" — o, sin número, "Descarga: una semana sin lastre o con 2 reps menos por serie"
  - Al final de la sección, una vez: "Si sigue igual: cambia el rango de reps, descansa más entre series o prueba una variante."
- **Detalle del ejercicio** (`exercise-stats-page.ts`): si `stalled` no es `null`, un aviso con el mismo texto sobre las tarjetas de récords.
- Componente compartido `features/stats/stalled-note.ts` que dibuja el texto de un `StalledExercise` (usado en ambas pantallas).

## Fuera de alcance

Avisos dentro de la sesión, notificaciones push, niveles de alerta, ventana configurable.

## Tests

- Pest `StalledExercisesServiceTest` (unidad): estancado; récord dentro del período → no; 2 sesiones en el período → no; sin sesiones anteriores → no; empate con el récord cuenta como estancado; `best_date` = primera vez que se alcanzó; `sessions_since`; descarga redondeada hacia abajo por equipamiento (barra 82,5 → 72,5; barra 80 → 70; máquina 55 → 45; kettlebell 24 → 20); peso corporal y banda → `null`; ejercicio no activo → excluido; orden.
- Pest feature: `GET /api/stats/stalled` (401 sin sesión, solo datos del usuario, excluye archivados) y `stalled` en `GET /api/stats/exercises/{id}`.
- Vitest: `stalled-note` (texto con y sin descarga), sección en Estadísticas (oculta si la lista está vacía) y aviso en el detalle.
