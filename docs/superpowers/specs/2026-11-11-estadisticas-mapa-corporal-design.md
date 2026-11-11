# Estadísticas con mapa corporal — diseño

Fecha: 2026-11-11 · Diseño aprobado por Luciano el 2026-11-10 (brainstorming).

## Problema

La página de estadísticas muestra "Volumen" (kilos totales) y un gráfico de volumen semanal en kg por grupo. Sumar kilos no dice nada útil. Lo que sí sirve es saber **cuántas series efectivas por semana recibe cada músculo**, comparado con la referencia habitual de hipertrofia (10–20 series/semana). Además, 8 grupos son muy gruesos ("Piernas" mezcla cuádriceps, femorales, glúteos y gemelos) y los chips de período tienen saltos muy grandes.

## Alcance (proyecto 1)

1. **12 músculos** en vez de 8.
2. **Períodos nuevos**: 1 sem · 1 mes · 3 meses · 6 meses · 1 año · Todo.
3. **Tarjetas**: Sesiones · Racha · Series efectivas · Sesiones/semana (se elimina "Volumen").
4. **Mapa corporal** (frente y espalda lado a lado) coloreado por series/semana; tocar un músculo muestra el detalle.
5. **Ranking** de series/semana por músculo con la banda 10–20; reemplaza "Volumen semanal por grupo".
6. Se mantienen Constancia, Peso corporal, Récords recientes y Por ejercicio.

Fuera de alcance: músculos secundarios y biblioteca de ejercicios (proyecto 2, reutiliza el mapa).

## 1. Músculos

`App\Enums\MuscleGroup` (string, inglés) y etiquetas en español:

| valor | etiqueta | vista del mapa |
|---|---|---|
| chest | Pecho | frente |
| lats | Dorsales | espalda |
| upper_back | Espalda alta | espalda (trapecio/romboides) |
| shoulders | Hombros | ambas |
| biceps | Bíceps | frente |
| triceps | Tríceps | espalda |
| quads | Cuádriceps | frente |
| hamstrings | Femorales | espalda |
| glutes | Glúteos | espalda |
| calves | Gemelos | espalda (y frente) |
| core | Core | frente |
| other | Otro | no aparece en el mapa |

Desaparecen `back` y `legs`.

**Catálogo** (`ExerciseCatalog`), cambios:
- Dominadas, Jalón al pecho, Remo con mancuerna → lats.
- Remo con barra, Remo en T, Remo sentado en polea, Encogimientos con mancuernas → upper_back.
- Peso muerto, Peso muerto rumano, Curl femoral, Hiperextensiones → hamstrings.
- Sentadilla, Sentadilla frontal, Sentadilla hack, Sentadilla búlgara, Prensa de piernas, Zancadas con mancuernas, Extensión de cuádriceps → quads.
- Hip thrust → glutes. Gemelos en máquina → calves.

**Migración de datos** (`exercises.muscle_group`, la columna `string(20)` ya alcanza):
- Si el nombre del ejercicio está en el mapeo de arriba → ese músculo (mapeo copiado en la migración para que no dependa del catálogo futuro).
- Si no: `legs` → `quads`, `back` → `lats` (el usuario lo corrige en Editar ejercicio).
- `down()`: lats/upper_back → back; quads/hamstrings/glutes/calves → legs.
- Antes de desplegar, Luciano revisa con un script de solo lectura cómo quedarán **sus** ejercicios de producción.

## 2. Períodos

`StatsPeriod`: `1w`, `1m`, `3m`, `6m`, `1y`, `all` (por defecto `1m`). Son **ventanas móviles que terminan hoy** (no semanas calendario), así "1 sem" un lunes no aparece vacío:
- 1w: hoy − 6 días; 1m: hoy − 1 mes + 1 día; 3m, 6m, 1y igual con 3/6/12 meses; all: sin inicio.
- Los gráficos semanales (constancia) siguen alineando al lunes de la semana de inicio.

## 3. Tarjetas del resumen (`GET /api/stats/overview`)

- `sessions`, `streak_weeks`, `recent_records`, `exercises`: igual.
- `effective_sets`: series del período sin calentamientos (renombra `total_sets`).
- `sessions_per_week`: sesiones del período / semanas del período, 1 decimal.
- Se elimina `total_volume_kg`.

**Semanas del período** = días desde el inicio hasta hoy (incluidos) / 7, mínimo 1. Para `all`, el inicio es la primera sesión del usuario (sin sesiones → 1 semana).

## 4. Series por músculo (`GET /api/stats/muscles`, reemplaza `/stats/weekly-volume`)

Servicio `App\Services\Stats\MuscleSetsService`:

```json
{ "data": { "period": "1m", "weeks": 4.4, "muscles": [
  { "muscle": "quads", "sets": 52, "sets_per_week": 11.8, "status": "in_range" }
] } }
```

- Una entrada por músculo (los 12, en el orden del enum), aunque tenga 0.
- `sets`: series efectivas (no calentamiento) en el período, por el músculo principal del ejercicio.
- `sets_per_week` = sets / weeks, 1 decimal.
- `status`: `none` (0), `low` (< 10), `in_range` (10–20), `high` (> 20). Rango fijo 10–20 (referencia habitual de hipertrofia).
- Se borran `WeeklyMuscleVolumeService`, el endpoint `weekly-volume`, `weeklyVolumeOption` y `MUSCLE_GROUP_COLORS`. `VolumeCalculator` se queda (lo usa el progreso por ejercicio).

## 5. Mapa corporal (frontend)

Componente reutilizable `app-body-map` en `shared/ui/body-map/`:
- SVG propio, estilizado (estilo "Pista": siluetas redondeadas, sin anatomía realista), **frente y espalda lado a lado**, cabe en 360 px de ancho.
- Entrada: `intensities: Partial<Record<MuscleGroup, number>>` (0–1), `selected` y `labels` (texto accesible por músculo); salida `muscleSelect`. Así el proyecto 2 lo usa con otra escala (principal/secundario).
- Color: interpolación de `#2a2d25` (sin series) a lima `#c8f135` (≥ 20 series/sem satura). Músculo seleccionado con borde claro.
- Cada músculo es una forma con `role="button"`, `tabindex="0"` y `aria-label` ("Cuádriceps, 11,8 series por semana").
- Tocar un músculo muestra debajo: **"Cuádriceps · 11,8 series/sem · en rango (10–20)"** (o "bajo el rango", "sobre el rango", "sin series"). Sin selección se muestra una leyenda corta.

## 6. Ranking

Lista de barras horizontales (HTML/CSS, sin ECharts): músculo · barra proporcional a series/semana · número. La banda 10–20 se dibuja como franja de fondo en cada barra. Ordenado de mayor a menor; los músculos con 0 al final; `other` solo si tiene series. Tocar una fila selecciona el músculo en el mapa.

## 7. Página

Orden: chips de período → tarjetas (2×2) → **Músculos** (mapa + detalle) → **Series por semana** (ranking) → Récords recientes → Constancia → Peso corporal → Por ejercicio.

## Tests

- Pest: enum/catálogo nuevo, migración (catálogo, fallback, down), períodos (ventanas móviles, semanas, default), `MuscleSetsService` (excluye calentamientos, promedio semanal, status, 12 músculos), overview (`effective_sets`, `sessions_per_week`, sin `total_volume_kg`), endpoint `/stats/muscles` con solo datos propios; `weekly-volume` ya no existe.
- Vitest: etiquetas/períodos, escala de color, mapa (colores, tap → texto de detalle, aria), ranking (orden, banda, tap), página (tarjetas nuevas, sin "Volumen").
