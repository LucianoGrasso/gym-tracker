# Plan — Estadísticas con mapa corporal

Spec: `docs/superpowers/specs/2026-11-11-estadisticas-mapa-corporal-design.md`. Rama: `stats-mapa-corporal`. TDD, un commit por tarea.

## Tarea 1 — 12 músculos (backend)
- `MuscleGroup`: chest, lats, upper_back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, core, other.
- `ExerciseCatalog`: remapeo de la spec. `RoutineTemplates`/seeder/demo heredan del catálogo.
- Migración `2026_11_11_000001_split_muscle_groups`: mapeo por nombre (copiado), fallback legs→quads / back→lats, `down()` inverso. Query builder, sin modelos (sin global scope).
- Ajustar tests que usan `back`/`legs` (Exercises, StatsTest, RoutineTemplates, Pest.php helper).
- Tests: migración up (catálogo + fallback + otros grupos intactos) y down; catálogo sin `back`/`legs`.

## Tarea 2 — Períodos móviles (backend)
- `StatsPeriod`: `1w`, `1m`, `3m`, `6m`, `1y`, `all`; `startDate()` = ventana móvil que termina hoy. Default `1m` en `StatsRequest`.
- `StatsCalendar::periodWeeks(?string $from, string $today, ?string $firstWorkout): float` (días/7, mín. 1).
- Tests unitarios de cada período y de las semanas; feature: `period=4w` ahora es 422.

## Tarea 3 — Overview y series por músculo (backend)
- `OverviewService`: `effective_sets`, `sessions_per_week`; fuera `total_volume_kg`/`total_sets`.
- `MuscleSetsService::summary(sets, from, weeks)` → `{weeks, muscles:[{muscle, sets, sets_per_week, status}]}`.
- `GET /api/stats/muscles`; se borra `weekly-volume`, `WeeklyMuscleVolumeService` y su request param `muscle_group`.
- Tests: unit del servicio (calentamientos fuera, 12 entradas, status límites 0/9.9/10/20/20.1, redondeo) + feature (solo datos propios, 404 de weekly-volume).

## Tarea 4 — Modelos, etiquetas y períodos (frontend)
- `MuscleGroup` type, `MUSCLE_GROUP_LABELS` (12), `StatsPeriod` + `PERIOD_LABELS` (1 sem · 1 mes · 3 meses · 6 meses · 1 año · Todo), default `1m` en ambas páginas de stats.
- `StatsOverview` (`effective_sets`, `sessions_per_week`), `MuscleSets` + `StatsApi.muscles()`; fuera `weeklyVolume`, `weeklyVolumeOption`, `MUSCLE_GROUP_COLORS`.
- Helpers puros `muscle-sets.ts`: `muscleIntensity(setsPerWeek)` (0–1, satura en 20), `muscleColor(intensity)` (#2a2d25→#c8f135), `statusLabel(status)`, `formatMuscleDetail(m)` ("Cuádriceps · 11,8 series/sem · en rango (10–20)"), `rankMuscles(list)`.
- Tests Vitest de los helpers y de las etiquetas.

## Tarea 5 — Componente `app-body-map`
- `shared/ui/body-map/body-map.ts` + `body-map-shapes.ts` (formas SVG estilizadas por músculo y vista; frente y espalda lado a lado en un `viewBox`).
- Inputs `intensities`, `selected`, `labels`; output `muscleSelect`. Fill según `muscleColor`, borde en el seleccionado, `role="button"`, `tabindex`, `aria-label`, Enter/Espacio.
- Tests: cada músculo del mapa tiene forma (todos menos `other`), color según intensidad, click/teclado emite, aria-label.

## Tarea 6 — Ranking + página
- `shared/ui/muscle-ranking.ts`: barras horizontales con banda 10–20, orden, ceros al final, `other` solo con series, tap emite músculo.
- `StatsPage`: tarjetas nuevas, sección "Músculos" (mapa + detalle del seleccionado o leyenda), "Series por semana" (ranking), orden de secciones de la spec. Selección compartida mapa↔ranking.
- Tests: ranking y página (sin "Volumen", tarjetas nuevas, tap muestra detalle).

## Tarea 7 — Verificación y revisión
- `./vendor/bin/pest`, `npx ng test --watch=false`, `npx ng build`.
- Local: `migrate` (no fresh) sobre la BD de desarrollo y revisar ejercicios migrados; E2E con curl de `/api/stats/muscles`.
- Script de solo lectura (scratchpad) para que Luciano vea cómo quedarán sus ejercicios en producción antes de integrar.
- Revisión visual de Luciano en local y en el iPhone → "intégralo a main".
