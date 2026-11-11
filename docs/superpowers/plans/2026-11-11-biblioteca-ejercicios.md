# Biblioteca de ejercicios — plan

> Ejecución inline (como acordado con Luciano): TDD, un commit por tarea en la rama `biblioteca-ejercicios`.

**Goal:** ~147 ejercicios listos para usar con músculos principal/secundarios y esquema corporal; secundarios cuentan ½ serie.

**Architecture:** La biblioteca vive en `App\Support\ExerciseCatalog` (backend, sin tabla). La API la expone y crea el ejercicio del usuario al primer uso (`LibraryExerciseResolver`, compartido con el importador de plantillas). El frontend la muestra en una pestaña, en fichas con `BodyMap` y en el `ExercisePicker`.

**Tech Stack:** Laravel 13 + Pest; Angular 22 (signals, zoneless) + Vitest.

## Global Constraints
- Código en inglés; UI en español de Chile.
- Los 47 nombres actuales del catálogo se conservan tal cual (plantillas y demo dependen de ellos).
- `secondary_muscles`: máx. 4, sin repetidos, nunca el principal.
- Slug = `Str::slug(name)`, único.
- Toda consulta restringida al usuario autenticado (`BelongsToUser`).
- Laravel apto para Lambda (sin disco).

---

### Tarea 1 — Secundarios y equipo nuevo (modelo y API de ejercicios)
**Archivos:** `app/Enums/Equipment.php`, migración `2026_11_11_000002_add_secondary_muscles_to_exercises.php`, `app/Models/Exercise.php` (cast `AsEnumCollection::of(MuscleGroup::class)` o array de strings validado), `app/Http/Requests/ExerciseRequest.php`, `app/Http/Resources/ExerciseResource.php`, `database/factories/ExerciseFactory.php`.
- Equipment + `Kettlebell='kettlebell'`, `Band='band'`, `Smith='smith'`.
- Migración: columna `json('secondary_muscles')->nullable()` (null = []), copia secundarios por nombre con un mapeo literal de la biblioteca (los 47 nombres actuales); `down()` la elimina.
- Validación: `secondary_muscles` `nullable|array|max:4`, `secondary_muscles.*` enum + `distinct` + `different:muscle_group`.
- Tests (Pest): crear/editar con secundarios; 422 si incluye el principal, repetidos o más de 4; resource devuelve `[]` por defecto; migración copia por nombre y deja vacíos los desconocidos.

### Tarea 2 — Biblioteca y resolver compartido
**Archivos:** `app/Support/ExerciseCatalog.php` (147 entradas, ver lista abajo), `app/Services/LibraryExerciseResolver.php`, `app/Services/RoutineTemplateImporter.php`, `database/seeders/GymTrackerSeeder.php`, demo (`app/Services/Demo/*`).
- Entrada: `[MuscleGroup principal, [secundarios], Equipment, unilateral, peso corporal]`. API: `all(): list<array>` (con `slug`, `name`, ...), `get(name)`, `findBySlug(slug): ?array`, `has(name)`.
- `LibraryExerciseResolver::resolve(User $user, string $name): array{0: Exercise, 1: bool $created}` — busca por nombre normalizado (sin mayúsculas ni tildes, `withTrashed`/archivados incluidos), desarchiva si hace falta, si no crea con los datos del catálogo. El importador de plantillas pasa a usarlo.
- Tests: slugs y nombres únicos, secundarios válidos (≤4, sin principal), los 47 nombres anteriores presentes con el mismo músculo principal, conteo por músculo; resolver crea / reutiliza / desarchiva; plantillas importadas traen secundarios.

### Tarea 3 — Endpoints de la biblioteca
**Archivos:** `app/Http/Controllers/ExerciseLibraryController.php`, `app/Http/Requests/FromLibraryRequest.php`, `routes/api.php`.
- `GET /api/exercise-library` → `{data: [{slug, name, muscle_group, secondary_muscles, equipment, is_unilateral, uses_bodyweight, owned_exercise_id}]}`; `owned_exercise_id` solo de ejercicios no archivados del usuario.
- `POST /api/exercises/from-library {slug}` → 201 creado / 200 existente (desarchivado si estaba archivado); slug desconocido 422.
- Tests: `owned_exercise_id` solo propio; crea, repite sin duplicar, desarchiva, 422, 401 sin sesión.

### Tarea 4 — Estadísticas con ½ serie
**Archivos:** `app/Services/Stats/SetRow.php`, `StatsDataLoader.php`, `MuscleSetsService.php`, `tests/Pest.php` (`statsSet` con `secondaryMuscles`).
- `SetRow::$secondaryMuscles` (list<MuscleGroup>); el loader lee `e.secondary_muscles`.
- `MuscleSetsService`: principal +1, cada secundario +0,5; `sets` float con 1 decimal.
- Tests: 4 series de press de banca → pecho 4, tríceps 2, hombros 2; calentamientos fuera; feature del endpoint con secundarios.

### Tarea 5 — Frontend: modelos, API y MiniBodyMap
**Archivos:** `core/models/exercise.ts` (+`secondary_muscles`, Equipment nuevo), `core/models/library.ts`, `core/models/labels.ts` (Kettlebell, Banda elástica, Máquina Smith), `core/api/exercise-library-api.ts` (`list()`, `adopt(slug): Promise<Exercise>`), `core/stats/muscle-sets.ts` (`exerciseIntensities(primary, secondaries)` → principal 1, secundarios 0,45; `formatMuscles(primary, secondaries)` → "Principal: Pecho · Secundarios: Tríceps, Hombros"), `shared/ui/body-map/mini-body-map.ts`.
- `MiniBodyMap`: input `primary`, `secondaries`; dibuja solo la vista que contiene al principal (frente si está en ambas), ~40 px, `aria-hidden`.
- Tests: helpers, vista elegida (chest→frente, lats→espalda, shoulders→frente), colores.

### Tarea 6 — Pantalla Ejercicios con pestañas + ficha de biblioteca
**Archivos:** `features/exercises/exercises-page.ts`, `features/exercises/library-list.ts`, `features/exercises/filter-library.ts`, `features/exercises/library-detail-page.ts`, rutas.
- Pestañas "Mis ejercicios" | "Biblioteca" con `?vista=biblioteca`; chips de músculo con scroll horizontal.
- Biblioteca: buscador (sin tildes, nombre/músculo/región), chips de músculo y equipo, filas con `MiniBodyMap` y "✓ Lo usas".
- Ficha `/ejercicios/biblioteca/:slug`: `BodyMap` (sin selección), leyenda, equipo, unilateral; "Agregar a mis ejercicios" (adopt → navega a `/ejercicios/:id`) o "Ver mi ejercicio".
- Tests: filtro puro; pestañas cambian la URL; ficha muestra leyenda y botón correcto, adopt navega.

### Tarea 7 — Ficha y formulario de ejercicios propios
**Archivos:** `features/exercises/exercise-detail-page.ts`, `features/exercises/exercise-form-page.ts`.
- Ficha: `BodyMap` con principal/secundarios + leyenda.
- Formulario: "Músculos secundarios" chips multiselección (principal deshabilitado, máx. 4, se quita el principal si se elige como secundario).
- Tests: chips (toggle, deshabilitado, tope de 4), envío incluye `secondary_muscles`.

### Tarea 8 — Buscador mixto + aviso Safari
**Archivos:** `shared/ui/exercise-picker.ts` (+ quienes lo usan: `routine-exercise-form.ts`, workout page), `features/account/account-menu.ts`.
- Picker recibe también `library` (sin los ya propios); sección "Biblioteca"; al elegir llama `adopt`, emite el ejercicio nuevo para que el padre lo agregue a su lista; error/sin conexión → "Necesitas conexión para agregar un ejercicio nuevo de la biblioteca".
- Mensaje `unsupported`: "En iPhone, toca Compartir → Agregar a inicio y abre la app desde ahí para recibir avisos."
- Tests: orden propios→biblioteca, búsqueda en ambos, adopt selecciona, error muestra el mensaje.

### Tarea 9 — Verificación
- `./vendor/bin/pest`, `npx ng test --watch=false`, `npx ng build`; `migrate` local; E2E curl de los dos endpoints; revisión de Luciano en local y iPhone → "intégralo a main".

---

## Lista de ejercicios (147)

Leyenda: (*) = ya existe hoy · U = unilateral · PC = carga con peso corporal. Secundarios entre paréntesis.

**Pecho (17)**
1. Press de banca* (Tríceps, Hombros) · Barra
2. Press con mancuernas* (Tríceps, Hombros) · Mancuerna
3. Press inclinado con barra* (Hombros, Tríceps) · Barra
4. Press inclinado con mancuernas* (Hombros, Tríceps) · Mancuerna
5. Press declinado con barra (Tríceps) · Barra
6. Press de banca en Smith (Tríceps, Hombros) · Smith
7. Press inclinado en Smith (Hombros, Tríceps) · Smith
8. Press de pecho en máquina* (Tríceps, Hombros) · Máquina
9. Press inclinado en máquina (Hombros, Tríceps) · Máquina
10. Aperturas con mancuernas* (Hombros) · Mancuerna
11. Aperturas inclinadas con mancuernas (Hombros) · Mancuerna
12. Aperturas en máquina · Máquina
13. Cruce de poleas* (Hombros) · Polea
14. Cruce de poleas de abajo hacia arriba (Hombros) · Polea
15. Flexiones de brazos (Tríceps, Hombros, Core) · Peso corporal · PC
16. Fondos para pecho (Tríceps, Hombros) · Peso corporal · PC
17. Pullover con mancuerna* (Dorsales, Tríceps) · Mancuerna

**Dorsales (12)**
18. Dominadas* (Bíceps, Espalda alta) · Peso corporal · PC
19. Dominadas supinas (Bíceps) · Peso corporal · PC
20. Dominadas asistidas en máquina (Bíceps, Espalda alta) · Máquina
21. Jalón al pecho* (Bíceps, Espalda alta) · Polea
22. Jalón al pecho agarre cerrado (Bíceps) · Polea
23. Jalón al pecho agarre supino (Bíceps) · Polea
24. Jalón unilateral en polea (Bíceps) · Polea · U
25. Jalón con brazos rectos · Polea
26. Remo con mancuerna* (Espalda alta, Bíceps) · Mancuerna · U
27. Remo unilateral en polea (Espalda alta, Bíceps) · Polea · U
28. Remo con barra agarre supino (Espalda alta, Bíceps) · Barra
29. Pullover en máquina (Pecho) · Máquina

**Espalda alta (12)**
30. Remo con barra* (Dorsales, Bíceps) · Barra
31. Remo Pendlay (Dorsales, Bíceps) · Barra
32. Remo en T* (Dorsales, Bíceps) · Barra
33. Remo sentado en polea* (Dorsales, Bíceps) · Polea
34. Remo sentado agarre abierto en polea (Hombros, Bíceps) · Polea
35. Remo en máquina (Dorsales, Bíceps) · Máquina
36. Remo apoyado en banco con mancuernas (Dorsales, Bíceps) · Mancuerna
37. Remo en Smith (Dorsales, Bíceps) · Smith
38. Remo invertido (Bíceps, Dorsales) · Peso corporal · PC
39. Encogimientos con mancuernas* · Mancuerna
40. Encogimientos con barra · Barra
41. Remo al mentón (Hombros, Bíceps) · Barra

**Hombros (16)**
42. Press militar con barra* (Tríceps) · Barra
43. Press de hombro con mancuernas* (Tríceps) · Mancuerna
44. Press Arnold (Tríceps) · Mancuerna
45. Press tras nuca* (Tríceps, Espalda alta) · Barra
46. Press de hombro en máquina (Tríceps) · Máquina
47. Press de hombro en Smith (Tríceps) · Smith
48. Press landmine (Pecho, Tríceps) · Barra · U
49. Elevaciones laterales* (Espalda alta) · Mancuerna
50. Elevaciones laterales en polea* (Espalda alta) · Polea · U
51. Elevaciones laterales en máquina · Máquina
52. Elevaciones frontales con mancuernas (Pecho) · Mancuerna
53. Elevaciones frontales en polea (Pecho) · Polea
54. Pájaros con mancuernas* (Espalda alta) · Mancuerna
55. Pájaros en máquina (Espalda alta) · Máquina
56. Pájaros en polea (Espalda alta) · Polea
57. Face pull* (Espalda alta) · Polea

**Bíceps (12)**
58. Curl con barra* · Barra
59. Curl con barra Z · Barra
60. Curl de bíceps con mancuernas* · Mancuerna
61. Curl martillo* (Otro) · Mancuerna
62. Curl inclinado con mancuernas* · Mancuerna
63. Curl concentrado* · Mancuerna · U
64. Curl predicador con barra Z · Barra
65. Curl predicador en máquina · Máquina
66. Curl en polea · Polea
67. Curl martillo con cuerda en polea (Otro) · Polea
68. Curl araña · Mancuerna
69. Curl bayesiano en polea · Polea · U

**Tríceps (12)**
70. Fondos* (Pecho, Hombros) · Peso corporal · PC
71. Fondos en banco (Hombros) · Peso corporal · PC
72. Fondos en máquina (Pecho) · Máquina
73. Extensión de tríceps en polea* · Polea
74. Extensión de tríceps con cuerda · Polea
75. Extensión de tríceps sobre la cabeza en polea* · Polea
76. Extensión de tríceps sobre la cabeza con mancuerna · Mancuerna
77. Press francés* · Barra
78. Press francés con mancuernas · Mancuerna
79. Press de banca agarre cerrado* (Pecho, Hombros) · Barra
80. Patada de tríceps · Mancuerna · U
81. Flexiones diamante (Pecho, Hombros) · Peso corporal · PC

**Cuádriceps (16)**
82. Sentadilla* (Glúteos, Femorales) · Barra
83. Sentadilla frontal* (Glúteos, Core) · Barra
84. Sentadilla en Smith (Glúteos) · Smith
85. Sentadilla goblet (Glúteos, Core) · Kettlebell
86. Sentadilla con peso corporal (Glúteos) · Peso corporal · PC
87. Sentadilla hack* (Glúteos) · Máquina
88. Sentadilla péndulo (Glúteos) · Máquina
89. Sentadilla sissy · Peso corporal · PC
90. Sentadilla búlgara* (Glúteos) · Mancuerna · U
91. Prensa de piernas* (Glúteos) · Máquina
92. Prensa unilateral (Glúteos) · Máquina · U
93. Zancadas con mancuernas* (Glúteos, Femorales) · Mancuerna · U
94. Zancadas caminando (Glúteos) · Mancuerna · U
95. Zancadas con barra (Glúteos) · Barra · U
96. Subidas al cajón (Glúteos) · Mancuerna · U
97. Extensión de cuádriceps* · Máquina

**Femorales (10)**
98. Peso muerto* (Glúteos, Espalda alta) · Barra
99. Peso muerto rumano* (Glúteos) · Barra
100. Peso muerto rumano con mancuernas (Glúteos) · Mancuerna
101. Peso muerto con piernas rígidas (Glúteos) · Barra
102. Buenos días (Glúteos) · Barra
103. Curl femoral* · Máquina
104. Curl femoral sentado · Máquina
105. Curl femoral de pie · Máquina · U
106. Curl nórdico · Peso corporal · PC
107. Hiperextensiones* (Glúteos) · Peso corporal · PC

**Glúteos (10)**
108. Hip thrust* (Femorales) · Barra
109. Hip thrust en máquina (Femorales) · Máquina
110. Hip thrust en Smith (Femorales) · Smith
111. Puente de glúteos (Femorales) · Peso corporal · PC
112. Patada de glúteo en polea (Femorales) · Polea · U
113. Patada de glúteo en máquina (Femorales) · Máquina · U
114. Abducción de cadera en máquina · Máquina
115. Abducción de cadera con banda · Banda elástica
116. Peso muerto sumo (Cuádriceps, Femorales) · Barra
117. Swing con kettlebell (Femorales, Core) · Kettlebell

**Gemelos (6)**
118. Gemelos en máquina* · Máquina
119. Gemelos sentado · Máquina
120. Gemelos en prensa · Máquina
121. Gemelos en Smith · Smith
122. Gemelos de pie con mancuerna · Mancuerna · U
123. Gemelos con peso corporal · Peso corporal · PC

**Core (16)**
124. Crunch abdominal* · Peso corporal · PC
125. Crunch inverso · Peso corporal · PC
126. Crunch en polea · Polea
127. Crunch en máquina · Máquina
128. Elevación de piernas colgado* · Peso corporal · PC
129. Elevación de rodillas en paralelas · Peso corporal · PC
130. Elevación de piernas en el suelo · Peso corporal · PC
131. Plancha · Peso corporal · PC
132. Plancha lateral · Peso corporal · PC · U
133. Rueda abdominal (Dorsales) · Peso corporal · PC
134. Russian twist · Mancuerna
135. Pallof press · Polea · U
136. Leñador en polea · Polea · U
137. Dead bug · Peso corporal · PC
138. Escaladores · Peso corporal · PC
139. Hollow hold · Peso corporal · PC

**Otro (8)** — antebrazos, aductores, lumbares
140. Curl de muñeca · Barra
141. Curl de muñeca inverso · Barra
142. Paseo del granjero (Core, Espalda alta) · Mancuerna
143. Colgarse de la barra (Dorsales) · Peso corporal · PC
144. Aducción de cadera en máquina · Máquina
145. Plancha Copenhague (Core) · Peso corporal · PC · U
146. Extensión lumbar en máquina (Glúteos) · Máquina
147. Superman (Glúteos) · Peso corporal · PC
