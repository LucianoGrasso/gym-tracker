# Plantillas de rutinas — Especificación de diseño

- **Fecha:** 06/11/2026
- **Estado:** en revisión
- **Autor:** Luciano (con Claude Code)

## 1. Objetivo

Ofrecer en la app un catálogo de rutinas de programas y atletas conocidos que el usuario pueda ver e importar a sus rutinas con un toque.

- Importar **no activa** la rutina ni toca las existentes: el usuario sigue alternando con el botón "Activar" que ya existe.
- Una rutina importada es una rutina normal del usuario: se edita libremente sin afectar la plantilla.

Fuera de alcance: plantillas creadas por usuarios o entrenadores (posible "modo entrenador" futuro), progresión automática de cargas y semanas de descarga.

## 2. Catálogo inicial (7 plantillas)

| Slug | Nombre | Tipo | Días sugeridos | Nivel | Objetivo |
|---|---|---|---|---|---|
| `nippard-ppl` | PPL estilo Jeff Nippard | Inspirada en | L a S | Intermedio | Hipertrofia |
| `arnold-golden-six` | Golden Six de Arnold | Publicada | L · Mi · V | Principiante | Mixto |
| `arnold-blueprint` | Split estilo Arnold (Blueprint) | Inspirada en | L a S | Avanzado | Hipertrofia |
| `reg-park-5x5` | 5×5 de Reg Park | Publicada | L · Mi · V | Principiante | Fuerza |
| `phul` | PHUL | Publicada | L · Ma · J · V | Intermedio | Mixto |
| `ronnie-coleman` | Estilo Ronnie Coleman | Inspirada en | L a S | Avanzado | Hipertrofia |
| `cbum` | Estilo Chris Bumstead | Inspirada en | L · Ma · J · V · S | Intermedio | Hipertrofia |

Criterios de contenido:
- **Publicadas** (Golden Six, Reg Park, PHUL): ejercicios, series y reps fieles a la fuente.
- **Inspiradas en** (Nippard, Arnold Blueprint, Ronnie, CBum): estructura y estilo mostrados públicamente por el atleta, sin copiar material de pago. La UI y las notas de la rutina dicen "Inspirada en X".
- Textos en español (Chile), kg. La intensidad va en la nota del ejercicio (`target_text`), por ejemplo "RIR 1-2, última serie al fallo" o "2 de calentamiento + 3 efectivas".
- Cuando la fuente da un rango de series, `target_sets` toma el máximo y el rango va en la nota (igual que `GymTrackerSeeder`).

Resumen por plantilla:
- **PPL estilo Nippard:** Push A, Pull A, Legs A, Push B, Pull B, Legs B. Compuestos de 6 a 10 reps, aislamientos de 10 a 20, RIR 1-2.
- **Golden Six:** el mismo día tres veces por semana. Sentadilla 4×10, banca agarre ancho 3×10, dominadas 3× al máximo, press tras nuca 4×10, curl con barra 3×10, abdominales 3-4× al máximo.
- **Arnold Blueprint:** doble split pecho + espalda / hombros + brazos / piernas, dos veces por semana. Alto volumen, de 8 a 12 reps.
- **Reg Park 5×5:** sentadilla, banca y peso muerto 5×5 (2 de calentamiento y 3 efectivas).
- **PHUL:** superior potencia / inferior potencia / superior hipertrofia / inferior hipertrofia. Potencia de 3 a 5 reps, hipertrofia de 8 a 15.
- **Ronnie Coleman:** espalda + bíceps + hombros / piernas / pecho + tríceps, dos veces por semana. Básicos pesados.
- **Chris Bumstead:** push / pull / piernas (cuádriceps) / tren superior / piernas (femorales y glúteos). De 8 a 12 reps, tempo controlado.

El detalle completo (cada ejercicio con series, reps, tipo, descanso y nota) se fija en el plan de implementación y Luciano lo revisa antes de programarlo.

## 3. Backend

### 3.1 Datos: `app/Support/RoutineTemplates.php`

Clase con datos constantes, sin tablas nuevas.
- `EXERCISES`: catálogo único `nombre => [MuscleGroup, Equipment, is_unilateral, uses_bodyweight]`. Incluye los 15 ejercicios de `GymTrackerSeeder` (el seeder pasa a leerlos de aquí) más unos 25 nuevos.
- `all()`: lista de plantillas. Cada una con `slug`, `name`, `inspired_by` (nullable), `description`, `days_per_week`, `level` (`beginner|intermediate|advanced`), `goal` (`strength|hypertrophy|mixed`) y `days[]`.
- Cada día: `name`, `weekday` (1-7, nullable) y `exercises[]` con `name`, `target_sets`, `target_reps_min`, `target_reps_max`, `default_set_type` (`SetType`), `rest_seconds` y `target_text`.
- `find(slug)`: la plantilla o `null`.

`level` y `goal` son enums string en inglés en `App\Enums` (`TemplateLevel`, `TemplateGoal`); la UI los traduce.

### 3.2 Endpoints (dentro de `auth:sanctum`)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/routine-templates` | 200 con `data: RoutineTemplate[]` (resumen + días + ejercicios, cada uno con su `muscle_group`) |
| POST | `/api/routine-templates/{slug}/import` | 201 con `RoutineResource` de la rutina creada · 404 si el slug no existe |

Controlador `RoutineTemplateController` (delgado). La lógica de importación vive en `App\Services\RoutineTemplateImporter`.

### 3.3 Reglas de importación (una transacción)

1. Crea la rutina con `is_active = false`. Si el usuario ya tiene una rutina con el mismo nombre, agrega el sufijo " (2)", " (3)", etc.
2. `notes` de la rutina: la descripción y, si corresponde, "Inspirada en X".
3. Para cada ejercicio de la plantilla, lo busca entre los del usuario por nombre, sin distinguir mayúsculas y sin espacios extra en los extremos:
   - si existe, lo reutiliza (el historial y las estadísticas siguen sumando);
   - si existe y está archivado, lo desarchiva (`archived_at = null`);
   - si no existe, lo crea con los datos de `EXERCISES`.
4. Crea los días y sus ejercicios con `position` 0..n-1 en el orden de la plantilla.
5. Todo queda bajo el usuario autenticado (`BelongsToUser`). No modifica rutinas, días ni ejercicios de otras rutinas.

### 3.4 Tests (Pest, TDD)

- `GET` requiere autenticación y devuelve las 7 plantillas con sus días.
- La importación crea una rutina inactiva con días y ejercicios en orden, y la rutina activa sigue activa.
- Reutiliza un ejercicio existente (nombre con distinta capitalización) sin duplicarlo.
- Desarchiva un ejercicio archivado que la plantilla usa.
- Crea un ejercicio faltante con su grupo muscular y equipamiento.
- Importar dos veces genera "Nombre (2)".
- Un slug desconocido devuelve 404.
- No usa ni ve ejercicios de otro usuario.
- Integridad del catálogo: cada ejercicio de cada plantilla existe en `EXERCISES`; series de 1 a 20; reps de 1 a 100 con `min <= max`; descansos de 0 a 900; slugs únicos; `weekday` de 1 a 7 o nulo.
- `GymTrackerSeeder` sigue creando lo mismo (su test actual).

## 4. Frontend

### 4.1 Pantallas

- **Rutinas:** botón "Explorar plantillas" junto a "Nueva rutina".
- **`/rutinas/plantillas` — catálogo:** una tarjeta por plantilla con el nombre, "Inspirada en X" si corresponde, etiquetas (`6 días` · `Intermedio` · `Hipertrofia`) y una descripción de 1 o 2 líneas. Al tocarla se abre el detalle.
- **`/rutinas/plantillas/:slug` — detalle:** descripción y cada día con sus ejercicios, en el mismo formato que las rutinas ("4 × 6-10 · Pesada · 3 min" y la nota). Un botón fijo abajo, "Agregar a mis rutinas", importa la plantilla y navega a `/rutinas/:id` con el aviso "Rutina agregada. Actívala cuando quieras empezarla".

### 4.2 Código

- `core/api/routine-templates-api.ts`: `list()` e `import(slug)`.
- `core/models/routine-template.ts`: `RoutineTemplate`, `TemplateDay`, `TemplateExercise`.
- `features/routines/templates-page.ts` y `template-detail-page.ts` (standalone, signals, OnPush, carga lazy).
- Rutas `plantillas` y `plantillas/:slug` antes de `:id` en `app.routes.ts`.
- El catálogo se pide una vez por sesión (cacheado en el servicio) y el detalle lo reutiliza.
- Se reutilizan `formatTargets`, `formatRest` y `SET_TYPE_LABELS`. Etiquetas nuevas: `TEMPLATE_LEVEL_LABELS` y `TEMPLATE_GOAL_LABELS`.

### 4.3 Errores y sin conexión

- Importar requiere conexión. Sin conexión, o si falla la importación, se muestra "No se pudo agregar la plantilla. Revisa tu conexión e inténtalo de nuevo." y no se encola nada.
- El botón se deshabilita mientras importa, para evitar dobles importaciones.
- El catálogo también requiere conexión: el service worker no guarda respuestas de la API (`ngsw-config.json` no tiene `dataGroups`) y no se agrega esa caché. Si falla la carga, se muestra "No se pudo cargar el catálogo. Revisa tu conexión." con un botón para reintentar.

### 4.4 Tests (Vitest)

- `RoutineTemplatesApi`: URLs, verbo y caché del catálogo.
- Detalle: al importar navega a la rutina nueva; si falla, muestra el mensaje y vuelve a habilitar el botón.
- Catálogo: muestra las etiquetas traducidas e "Inspirada en".

## 5. Entrega

Rama `plantillas-rutinas`. Commits por tarea con los tests en verde. Luciano revisa la UI en local, dice "intégralo a main" y el push dispara el deploy.
