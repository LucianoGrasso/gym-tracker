# Calentamientos visibles — diseño

Fecha: 2026-11-10 · Estado: aprobado por Luciano

## Problema

Luciano calienta solo en los primeros ejercicios pesados del día (1-3 series ligeras). En los demás
ejercicios parte con ~70 % de la carga, y esas series son **efectivas** (se quedan como están).

Hoy el tipo de serie existe (`warmup`, `normal`, `heavy`, …) y las estadísticas ya excluyen los
calentamientos, pero:

- El selector de tipo está escondido en "Más" y la primera serie toma el `default_set_type` de la
  rutina: en un ejercicio "Pesada" los calentamientos quedan como pesadas.
- La siguiente serie copia el tipo de la anterior: tras marcar un calentamiento, la efectiva también
  quedaría como calentamiento.

## Alcance

Solo frontend (`features/workout/exercise-card.ts`, `core/workout/set-suggestions.ts`,
`features/workout/workout-page.ts`). Backend y estadísticas no cambian.

## Diseño

### 1. Chip "Calentamiento"

- En la tarjeta del ejercicio, sobre la fila de botones (Más / Copiar anterior / Guardar serie), un
  chip de un toque "Calentamiento" (`aria-pressed`), en lima cuando está activo.
- Activo → `entry.set_type = 'warmup'`. Inactivo → `entry.set_type = item.default_set_type`.
- El selector "Tipo" de "Más" sigue existiendo y queda sincronizado (ambos leen `entry().set_type`).
- Al editar una serie existente, el chip refleja su tipo y permite cambiarlo.

### 2. Sugerencia de la siguiente serie (`suggestNextSet`)

- Si la última serie de hoy es calentamiento:
  - `set_type` = `item.default_set_type`.
  - Peso y reps = la primera serie efectiva (no calentamiento) de la vez anterior; si no hay
    historial, los del calentamiento.
  - `rir`, `pain_level`, `notes` en null.
- Si la última serie de hoy es efectiva: igual que hoy (copia la anterior).
- Sin series hoy: igual que hoy (tipo de la rutina, peso de la primera efectiva de la vez anterior).

### 3. Numeración y conteo

- Función pura `workingSets(sets)` = series cuyo `set_type !== 'warmup'`.
- Lista de series: los calentamientos muestran "C" en vez del número y van atenuados
  (`opacity-60`); las efectivas se numeran 1, 2, 3… saltándose los calentamientos.
- `isPending` (workout-page: qué ejercicio sigue y borde lima) cuenta solo series efectivas contra
  `target_sets`. Un ejercicio sin `target_sets` sigue pendiente mientras no tenga ninguna serie
  efectiva.
- Aviso de descanso: "serie X de Y" usa el número de efectivas hechas + 1.

### 4. Descanso tras un calentamiento

- Al guardar un calentamiento, el temporizador arranca con `min(rest_seconds, 60)`
  (constante `WARMUP_REST_SECONDS = 60`). Tras una efectiva, `rest_seconds` como siempre.
- El aviso push del descanso tras un calentamiento anuncia la primera efectiva pendiente
  (p. ej. "Press de banca · serie 1 de 4").

## Errores y casos borde

- Editar una serie para convertirla en calentamiento (o al revés) renumera la lista; no cambia el
  temporizador.
- Borrar un calentamiento no afecta la numeración de las efectivas.
- Datos ya guardados no se migran.

## Tests

- `set-suggestions.spec.ts`: tras calentamiento vuelve al tipo de la rutina con el peso efectivo de
  la vez anterior; sin historial usa el del calentamiento; tras efectiva copia la anterior.
- `workingSets` / numeración: "C" para calentamientos, efectivas 1..n.
- `isPending` ignora calentamientos.
- `exercise-card.spec.ts`: el chip alterna `warmup` ↔ tipo de la rutina; guardar un calentamiento
  arranca un descanso de 60 s (o menos si la rutina tiene menos) con "serie 1 de N".
