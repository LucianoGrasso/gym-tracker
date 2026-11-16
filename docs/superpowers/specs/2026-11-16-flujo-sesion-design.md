# Flujo de la sesión: terminar antes y "Hacer ahora" — diseño

Fecha: 2026-11-16 · Rama: `cardio` (se integra junto con el cardio).

## Objetivo

Durante una sesión en curso:
1. **Terminar un ejercicio antes** de completar sus series objetivo (o saltarlo sin series) y seguir con el resto.
2. **Hacer ahora** un ejercicio pendiente que está más abajo, cuando no se puede hacer el que toca.

Solo afecta la sesión de hoy. La rutina no cambia.

## Comportamiento

- "El que toca" (`currentId` en `workout-page`) sigue siendo el primer ejercicio pendiente según el orden de la sesión.
- **Terminar ejercicio**: botón en la tarjeta que toca. El ejercicio deja de estar pendiente aunque le falten series (o no tenga ninguna) y el resaltado pasa al siguiente. Sin confirmación (es reversible).
- Un ejercicio terminado así se muestra **compacto**: nombre, "Terminado · 2 de 4" (series efectivas hechas de las objetivo; sin objetivo: "2 series"; cardio: "1 tramo") y el botón **Retomar**, que lo vuelve a pendiente y muestra su tarjeta completa.
- **Hacer ahora**: botón en cada ejercicio pendiente que no es el que toca. Lo mueve justo antes del que toca; pasa a ser el actual. El resto conserva su orden relativo.
- Ambos botones solo aparecen en la sesión en curso (no en sesiones terminadas). Valen para fuerza y cardio.
- Un ejercicio que completó sus series objetivo no muestra ninguno de los dos botones (ya no está pendiente).

## Datos

- `SessionExercise.ended_early?: boolean` — **solo local** (documento de la sesión en IndexedDB). No va en `workoutExercisePayload` ni viene del servidor: solo sirve mientras se entrena. Ausente = `false`.
- `isPending(item)`: si `item.ended_early` → `false`; si no, la regla actual (cardio: sin tramos; fuerza: menos series efectivas que el objetivo, o ninguna sin objetivo).
- El orden sí se sincroniza: "Hacer ahora" reordena `session.exercises`, renumera `position` 0..n-1 y encola `PUT /api/workout-exercises/{id}` (payload completo, como hoy) **solo para los ejercicios cuya posición cambió**. El servidor ya devuelve los ejercicios ordenados por `position` y el upsert acepta cambiar la posición. Sin cambios en el backend.

## Piezas

- `core/workout/session-flow.ts` (funciones puras):
  - `moveBefore(exercises: SessionExercise[], id: string, beforeId: string): SessionExercise[]` — reordena y renumera `position`.
  - `endedLabel(item: SessionExercise): string` — "Terminado · 2 de 4", "Terminado · 2 series", "Terminado · 1 tramo".
- `WorkoutSessionService`:
  - `endExercise(id)` / `resumeExercise(id)`: marcan/desmarcan `ended_early` y guardan (sin encolar nada).
  - `doNow(id)`: mueve `id` antes del que toca (el primer pendiente) y encola los ejercicios con posición nueva.
- `workout-page`: por cada ejercicio de la sesión en curso,
  - terminado antes → tarjeta compacta (`data-ended`) con `endedLabel` y "Retomar";
  - el que toca → tarjeta normal + botón "Terminar ejercicio" debajo;
  - pendiente que no toca → tarjeta normal + botón "Hacer ahora" debajo;
  - completo o sesión terminada → tarjeta normal, sin botones.
  Las tarjetas (`ExerciseCard`, `CardioCard`) no cambian.

## Tests (Vitest)

- `session-flow`: `moveBefore` (adelante, posiciones renumeradas, orden relativo del resto), `endedLabel` (con objetivo, sin objetivo, cardio; los calentamientos no cuentan).
- `isPending` con `ended_early`.
- `WorkoutSessionService`: `endExercise`/`resumeExercise` no encolan nada; `doNow` encola solo los ejercicios con posición nueva y con la posición nueva.
- `workout-page`: botones según el estado; "Terminar" pasa el resaltado al siguiente; tarjeta compacta con "Retomar".
