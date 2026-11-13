# Sugerencias de progresión (doble progresión) — diseño

Fecha: 2026-11-13 · Rama: `sugerencias-progresion` · Fase 6 de la spec principal (parte A; la detección de estancamiento queda para después).

## Objetivo

Al abrir un ejercicio durante la sesión, si la última vez se completaron todas las series al tope del rango de reps, la app propone subir el peso: precarga la primera serie con el peso nuevo y muestra un aviso con la opción de mantener el anterior. Todo en el cliente y sin conexión.

## Regla

Función pura `suggestProgression(item: SessionExercise): ProgressionSuggestion | null` en `frontend/src/app/core/workout/progression.ts`.

```ts
interface ProgressionSuggestion {
  from: number;     // peso de la última vez (kg)
  to: number;       // peso sugerido (kg)
  reps: number;     // reps propuestas con el peso nuevo
  lastReps: number; // reps mínimas logradas la última vez (para el texto "3×12")
  lastSets: number; // series efectivas de la última vez
}
```

Devuelve una sugerencia solo si se cumple todo:

1. `item.target_sets` y `item.target_reps_max` no son `null` (objetivos de hoy, copiados de la rutina).
2. `item.default_set_type !== 'bilbo'` (Bilbo ya tiene su propia pista).
3. `item.last_performance` existe y sus series efectivas (sin calentamientos) son al menos `target_sets`.
4. Todas esas series efectivas tienen el mismo `weight_kg`.
5. Todas tienen `reps >= target_reps_max`.
6. El equipamiento tiene incremento definido.

Incremento por equipamiento (`PROGRESSION_STEP_KG`):

| Equipamiento | Incremento |
|---|---|
| barbell, smith | 2,5 kg |
| dumbbell | 2,5 kg |
| machine, cable | 5 kg |
| bodyweight | 2,5 kg de lastre |
| kettlebell | 4 kg |
| band | sin sugerencia |

- `to = from + incremento`. En peso corporal `from` puede ser 0 (sin lastre) → `to = 2,5`.
- `reps = target_reps_min ?? target_reps_max`.
- Ejercicios unilaterales: se evalúan todas las series efectivas, sin importar el lado.

## Datos

`ExerciseRef` (`core/models/workout.ts`) pasa a incluir `equipment`. El backend ya lo envía (`WorkoutExerciseResource` usa `ExerciseResource` completo). Se actualiza `ref()` en `core/workout/session-mapping.ts`. Las sesiones guardadas en IndexedDB antes del cambio no traen `equipment` → la función lo trata como desconocido y no sugiere nada. Sin migraciones ni endpoints nuevos.

## Interfaz (`features/workout/exercise-card.ts`)

- Mientras el ejercicio no tenga series efectivas hoy y la sugerencia no se haya descartado, `suggestNextSet` precarga `to × reps` (tipo de la rutina, lado `both`).
- Aviso arriba del formulario, en lima: "📈 ¡Sube a 62,5 kg!" y debajo "La última vez: 3×12 con 60 kg". Para peso corporal: "¡Agrega 2,5 kg de lastre!".
- Botón "Mantener 60 kg": descarta la sugerencia en esa tarjeta (estado local, no se sincroniza) y vuelve a precargar lo de la última vez, como hoy.
- Si hoy ya hay una serie efectiva, el aviso no se muestra y las siguientes series copian la anterior, igual que ahora. Los calentamientos no ocultan el aviso; la primera serie después de un calentamiento usa el peso sugerido.
- La pista de Bilbo no cambia.

## Fuera de alcance

Detección de estancamiento (4-6 semanas), incremento configurable por ejercicio, sugerencias en la pantalla de rutina o en estadísticas, bajar peso.

## Tests

- Vitest `progression.spec.ts`: sugiere con 3×12 en rango 8-12; nada si falta una serie, si una serie queda bajo el tope, si los pesos difieren, sin `target_reps_max`, sin `last_performance`, Bilbo, banda y equipamiento desconocido; ignora calentamientos; incremento de cada equipamiento; lastre desde 0; `reps` usa el mínimo o, sin él, el máximo.
- Vitest `set-suggestions.spec.ts`: `suggestNextSet` precarga la sugerencia, la ignora si fue descartada y vuelve a copiar la serie anterior cuando hay series efectivas hoy.
- Vitest `exercise-card.spec.ts` (o el spec existente de la tarjeta): muestra el aviso, "Mantener" precarga el peso anterior y oculta el aviso, y el aviso desaparece tras guardar la primera serie efectiva.
- `session-mapping`: conserva `equipment`.
