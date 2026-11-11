# Biblioteca de ejercicios — diseño

Fecha: 2026-11-11 · Diseño aprobado por Luciano (brainstorming del 2026-11-11). Depende del proyecto 1 (12 músculos, `BodyMap`).

## Objetivo

Que casi nunca haya que crear ejercicios a mano: ~150 ejercicios comunes listos para usar, cada uno con músculo principal, secundarios, equipo y un esquema del cuerpo. Las estadísticas cuentan los secundarios como ½ serie.

## Decisiones

| Tema | Decisión |
|---|---|
| Pantalla Ejercicios | Pestañas "Mis ejercicios" y "Biblioteca" |
| Alta de ejercicios | Nada que agregar a mano: la biblioteca está disponible en el buscador; un ejercicio pasa a "Mis ejercicios" la primera vez que se usa (o con "Agregar a mis ejercicios") |
| Secundarios | Todos los ejercicios pueden tenerlos (biblioteca precargada, propios con chips); los existentes los heredan por nombre |
| Equipo | Se suman Kettlebell, Banda elástica y Máquina Smith (8 en total) |
| Dónde vive | En el código del backend (`ExerciseCatalog` ampliado), servido por API; sin tabla nueva |
| Sin conexión | Solo se pueden agregar al entrenamiento ejercicios propios; uno nuevo de la biblioteca requiere señal |

## 1. Datos y backend

**Modelo**
- `exercises.secondary_muscles`: JSON, lista de `MuscleGroup` (default `[]`), cast a colección de enums. Nunca incluye el principal; máximo 4.
- `App\Enums\Equipment`: + `kettlebell`, `band`, `smith`.
- `ExerciseCatalog` se convierte en la biblioteca: por entrada `slug`, `name` (español de Chile), `muscle_group`, `secondary_muscles`, `equipment`, `is_unilateral`, `uses_bodyweight`. Los 47 nombres actuales se conservan (plantillas y demo los usan). `get(name)` sigue existiendo; se agregan `all()` y `findBySlug()`.

**Migración**: agrega la columna y copia los secundarios a los ejercicios existentes cuyo nombre coincide con la biblioteca (mapeo nombre → secundarios copiado en la migración). `down()` elimina la columna.

**API**
- `GET /api/exercise-library` → `[{slug, name, muscle_group, secondary_muscles, equipment, is_unilateral, uses_bodyweight, owned_exercise_id}]`. `owned_exercise_id` = id del ejercicio no archivado del usuario con ese nombre (comparación sin mayúsculas ni tildes, como el importador de plantillas), o `null`.
- `POST /api/exercises/from-library` `{slug}` → 201 con el `ExerciseResource` creado, o 200 con el existente (si estaba archivado se desarchiva). Slug desconocido → 422. Idempotente.
- `ExerciseRequest`: `secondary_muscles` nullable array, `max:4`, cada valor `Rule::enum(MuscleGroup)`, distinto de `muscle_group`, sin repetidos. `ExerciseResource` devuelve `secondary_muscles`.
- `RoutineTemplateImporter`, `GymTrackerSeeder` y la demo crean los ejercicios con secundarios (vía `ExerciseCatalog::get`). Reutilizar la lógica de "crear o reutilizar por nombre" en un servicio compartido (`LibraryExerciseResolver`) que usen el importador y `from-library`.

**Estadísticas**
- `SetRow` gana `secondaryMuscles` (lista); `StatsDataLoader` lo lee.
- `MuscleSetsService`: cada serie efectiva suma 1 al principal y 0,5 a cada secundario; `sets` pasa a ser número con un decimal (puede ser x,5). `status` y `sets_per_week` igual que hoy.
- `effective_sets` del resumen sigue contando cada serie una vez.

## 2. Frontend

**Pantalla Ejercicios** (`/ejercicios`)
- Pestañas "Mis ejercicios" | "Biblioteca" (la elegida queda en la URL: `?vista=biblioteca`).
- Mis ejercicios: como hoy; los chips de músculo se deslizan horizontalmente.
- Biblioteca: buscador (sin tildes, nombre o músculo, alias "pierna"/"espalda"), chips de músculo y de equipo. Fila: nombre, "Principal · Equipo", `MiniBodyMap` y "✓ Lo usas" si `owned_exercise_id`.

**Ficha de biblioteca** (`/ejercicios/biblioteca/:slug`): `BodyMap` grande (principal intensidad 1, secundarios 0,45), leyenda "Principal: Pecho · Secundarios: Tríceps, Hombros", equipo, unilateral; botón "Agregar a mis ejercicios" (llama `from-library` y navega a la ficha propia) o "Ver mi ejercicio".

**Ejercicios propios**: la ficha muestra el mismo mapa; el formulario agrega "Músculos secundarios" (chips multiselección, el principal deshabilitado, máx. 4; si cambia el principal y estaba entre los secundarios, se quita).

**Buscador** (`ExercisePicker`, rutinas y entrenamientos): primero los propios; debajo, bajo "Biblioteca", los de la biblioteca que aún no son propios. Elegir uno de la biblioteca llama `from-library`, agrega el ejercicio a la lista local y lo selecciona. Sin conexión o con error: "Necesitas conexión para agregar un ejercicio nuevo de la biblioteca".

**Componentes**
- `BodyMap` sin cambios.
- `MiniBodyMap` (`shared/ui/body-map/mini-body-map.ts`): una sola vista (frente o espalda, la que contiene el principal), ~40 px de alto, sin interacción, `aria-hidden` (el texto de la fila ya nombra los músculos). Reutiliza `BODY_VIEWS`.
- Etiquetas: `EQUIPMENT_LABELS` + Kettlebell, Banda elástica, Máquina Smith.

## 3. Contenido

~150 ejercicios por músculo principal (aprox.): pecho 16, dorsales 12, espalda alta 12, hombros 16, bíceps 12, tríceps 12, cuádriceps 16, femorales 10, glúteos 10, gemelos 6, core 16, otro 8 (antebrazos, aductores, lumbares). Antes de escribirla, la lista completa se muestra a Luciano en el plan para que la ajuste.

## 4. Pruebas

- Pest: biblioteca (slugs y nombres únicos, secundarios válidos y sin el principal, los 47 nombres previos presentes), migración de secundarios, `exercise-library` (`owned_exercise_id`, solo datos propios), `from-library` (crea 201, reutiliza 200, desarchiva, 422 slug desconocido), validación de `secondary_muscles`, plantillas con secundarios, estadísticas con ½ serie.
- Vitest: pestañas y filtros, ficha de biblioteca, chips de secundarios, buscador mixto (incluido sin conexión), `MiniBodyMap`.

## 5. Entrega

Rama `biblioteca-ejercicios` (sale de `avisos-permiso`, que se integra junto). TDD, un commit por tarea, revisión de Luciano en local y en el iPhone, luego "intégralo a main".
