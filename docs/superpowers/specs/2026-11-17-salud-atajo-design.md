# FC y kcal desde Apple Salud vía Atajo de iOS — diseño

Fecha: 2026-11-17 · Rama: `salud-atajo`.

## Objetivo

Agregar a cada sesión de GymTracker (fuerza o cardio) la **FC promedio, FC máxima y kcal activas** registradas en Apple Salud (AirPods con FC o Apple Watch, durante un entrenamiento de Fitness), sin escribirlas a mano.

## Límites conocidos (verificados en el iPhone de Luciano, 2026-11-17)

- "Buscar muestras de salud" **no** ofrece el tipo "Entrenamientos": no se pueden leer los entrenamientos de Fitness. Sí ofrece **Frecuencia cardíaca** y **Energía de actividad**.
- No hay disparador de automatización "terminó un entrenamiento".
- Por eso: no se importa cardio hecho fuera de la app (no se ve) y el emparejamiento es **por horario de la sesión de GymTracker** (`started_at`–`finished_at`), no por entrenamiento del Watch. El orden en que se cierran Fitness y GymTracker no importa.
- Con AirPods la FC solo existe mientras hay un entrenamiento de Fitness activo y los AirPods están puestos: se usa lo que haya dentro del horario de la sesión.

## Flujo

1. Al **Terminar entrenamiento**, la app vacía la cola de sincronización antes de navegar a `/hoy`.
2. En `/hoy` aparece la tarjeta **"Traer FC y kcal de Salud"** para esa sesión (solo si el Atajo está configurado en este dispositivo). El botón abre `shortcuts://run-shortcut?name=GymTracker%20Salud`.
3. El Atajo pide las sesiones terminadas en las últimas 48 h, calcula por sesión FC promedio/máxima y suma de kcal dentro de su horario, y hace un PUT por sesión. Muestra una notificación con el resultado.
4. Al volver a GymTracker, el detalle de la sesión vuelve a pedir los datos (`visibilitychange`) y muestra la tarjeta "Salud".
5. **Respaldo nocturno**: automatización "Hora del día" 23:00, "Ejecutar inmediatamente", corre el mismo Atajo. Completa sesiones olvidadas o con datos que el Watch/iPhone sincronizó tarde.

Reenviar es idempotente: el PUT sobrescribe.

## Backend

### Datos

Migración que agrega a `workouts` (todas nullable):
- `avg_heart_rate` smallint unsigned
- `max_heart_rate` smallint unsigned
- `active_calories` smallint unsigned
- `health_synced_at` timestamp

`WorkoutResource` incluye los cuatro campos. Viven en la sesión (no en series): son de la sesión completa.

### Token del Atajo

- `User` usa `HasApiTokens` (la tabla `personal_access_tokens` ya existe).
- Un token por usuario, nombre `health-shortcut`, habilidad `health:sync`. Crear uno nuevo borra el anterior.
- `POST /api/health-token` → `201 {token}` (texto plano, se muestra una vez). `DELETE /api/health-token` → `204`. Ambos con la sesión SPA normal; **prohibidos para cuentas demo** (403).
- **Aislamiento**: un middleware nuevo (`spa.only`) en el grupo principal de rutas responde 403 si la petición viene autenticada con un `PersonalAccessToken`. Así el token solo sirve en `/api/health-sync/*`.

### Endpoints de sincronización

Grupo `auth:sanctum` + `abilities:health:sync` (sin `spa.only`):

- `GET /api/health-sync/workouts` → `{data: [{id, started_at, finished_at}]}`: sesiones del usuario con `finished_at` no nulo y dentro de las últimas 48 h, ordenadas por `started_at`. Fechas ISO 8601 con offset de `America/Santiago` (p. ej. `2026-11-17T19:05:00-03:00`), que "Obtener fechas" de Atajos interpreta bien.
- `PUT /api/health-sync/workouts/{workout}` con `{avg_heart_rate, max_heart_rate, active_calories}`:
  - Form Request `HealthSyncRequest`: cada campo `nullable|integer`; FC entre 30 y 250; kcal entre 0 y 5000. Atajos puede mandar decimales en el promedio: se redondean en `prepareForValidation`. Cadena vacía = null.
  - Si los tres llegan null → `200` sin cambios (una corrida sin AirPods no borra datos buenos).
  - Si no, sobrescribe los tres y marca `health_synced_at = now()`. Devuelve el `WorkoutResource`.
  - Sesión de otro usuario o inexistente → 404 (`BelongsToUser`).

### Pruebas (Pest, TDD)

- Listado: solo terminadas, solo últimas 48 h, solo del usuario, formato de fecha con offset.
- PUT: guarda y marca `health_synced_at`; redondea decimales; valida rangos; tres null no borra; 404 para sesiones ajenas.
- Token: crear devuelve texto plano y reemplaza el anterior; revocar; demo → 403; sin habilidad `health:sync` → 403 en `/api/health-sync/*`.
- Aislamiento: con el token, `GET /api/workouts` y `GET /api/user` → 403; con la sesión SPA siguen funcionando.

## Frontend

- **Terminar entrenamiento** (`workout-page.finish`): tras `sessions.finish`, `await sync.flush()` antes de navegar. Guarda localmente el id de la última sesión terminada (para la tarjeta de `/hoy`).
- **Tarjeta en `/hoy`** (`HealthPromptCard`): visible si el Atajo está configurado en el dispositivo y hay una sesión terminada hoy cuya ficha del servidor no tiene `health_synced_at`. Con conexión y sin operaciones pendientes en la cola: botón "Traer FC y kcal de Salud" (abre el Atajo). Sin conexión o con cola pendiente: texto "Sin conexión: se completará con la sincronización nocturna", botón deshabilitado. Desaparece cuando la sesión ya tiene datos o se descarta con "Ahora no".
- **Detalle de sesión terminada** (`/entrenamiento/:id`): tarjeta "Salud" con FC prom., FC máx. y kcal (las que existan). Se pide `GET /api/workouts/{id}` sin caché local al abrir y en cada `visibilitychange` a visible. Sin datos → no se muestra.
- **Historial** (`/entrenamientos`): línea "♥ 128 ppm · 412 kcal" en sesiones con datos.
- **Mi cuenta → "Atajo de Salud"**:
  - "Generar token" → muestra el token una vez con **Copiar**. Marca "Atajo configurado" en `localStorage` (try/catch).
  - **"Instalar Atajo"** (si existe el enlace iCloud configurado): copia el token al portapapeles y abre el enlace iCloud. Atajos abre la importación y pregunta el token (pregunta de importación): basta pegar.
  - "Revocar" con `ConfirmService`; borra la marca.
  - Ocultos para cuentas demo.
- Sin cambios en estadísticas (YAGNI; primero juntar datos).

### Pruebas (Vitest)

`HealthPromptCard` (con conexión, sin conexión, ya sincronizada), tarjeta "Salud" del detalle (con/sin datos, recarga en `visibilitychange`), sección de Mi cuenta (generar, copiar, revocar, demo), `finish` hace flush antes de navegar.

## El Atajo "GymTracker Salud"

Se crea a mano **una sola vez** (Luciano, siguiendo `docs/atajo-salud.md`) y se comparte como enlace iCloud. Desde ahí cualquiera lo instala con un toque desde Mi cuenta.

**Por qué no se genera desde la app**: desde iOS 15 los archivos `.shortcut` deben ir firmados por Apple; firmarlos requiere `shortcuts sign` en macOS. El enlace iCloud es la vía oficial de instalación en un toque.

Acciones:
1. Obtener contenido de URL: `GET {URL}/api/health-sync/workouts`, cabeceras `Authorization: Bearer {token}`, `Accept: application/json`.
2. Si el código no es 200 → notificación "Token inválido: genera uno nuevo en Mi cuenta" y detener.
3. Repetir con cada elemento de `data`:
   1. Obtener fechas de `started_at` y `finished_at`.
   2. Buscar muestras de salud: Frecuencia cardíaca, fecha de inicio entre inicio y fin → Calcular estadísticas: Promedio y Máximo.
   3. Buscar muestras de salud: Energía de actividad, mismo rango, unidad kcal → Calcular estadísticas: Suma.
   4. Sin muestras → valor vacío.
   5. Obtener contenido de URL: `PUT {URL}/api/health-sync/workouts/{id}`, JSON con los tres valores.
4. Notificación: "✓ 128 ppm prom · 412 kcal" (última sesión), o "Sin datos de FC: ¿llevabas los AirPods?".

`{token}` es una **pregunta de importación** (no queda en el enlace compartido). `{URL}` es la URL de producción fija.

Enlace iCloud: se configura en el frontend como constante (`HEALTH_SHORTCUT_URL`); mientras esté vacía, el botón "Instalar Atajo" no se muestra.

## Errores

- 401 (token revocado o inválido): notificación del Atajo pidiendo regenerar.
- Sin internet: error de Atajos; la corrida nocturna reintenta.
- 404 en el PUT (sesión borrada entre GET y PUT): se ignora.
- Sesión terminada offline: no está en el servidor cuando corre el Atajo; la tarjeta lo avisa y la corrida nocturna la completa.

## Fuera de alcance

- Importar entrenamientos hechos fuera de GymTracker (iOS no los expone a Atajos).
- Gráficos/estadísticas de FC o kcal.
- App nativa / HealthKit directo.
