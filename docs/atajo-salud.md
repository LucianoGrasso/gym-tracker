# Atajo "GymTracker Salud"

Lleva la **FC promedio, FC máxima y kcal** que registró Apple Salud (AirPods con sensor de FC o Apple Watch) a cada sesión de GymTracker. Se arma **una sola vez**; después se comparte como enlace de iCloud y cualquiera lo instala desde **Mi cuenta → Atajo de Salud → Instalar Atajo**.

**Cómo funciona:** el Atajo busca en Salud la FC y la energía de los últimos 2 días y las envía tal cual (valores y fechas) a GymTracker. El **servidor** reparte cada muestra según el horario exacto de cada sesión terminada en las últimas 48 h, calcula promedio, máximo y suma, y responde un resumen que el Atajo muestra como notificación. Reenviar no duplica nada; una sesión sin muestras no se toca.

> Por qué el servidor filtra y no el Atajo: en Atajos, los filtros de fecha de "Buscar muestras de salud" comparan **por día**, no por hora, y "Obtener fechas de la entrada" interpreta mal las fechas ISO. Probado en el iPhone de Luciano (2026-11-17).

## 0. Antes de empezar

1. En GymTracker: **Mi cuenta → Atajo de Salud → Generar token** → **Copiar**. Se muestra una sola vez; si lo pierdes, genera otro (el anterior deja de servir).
2. En el gimnasio, inicia en Fitness el entrenamiento ("Fuerza tradicional") con los AirPods puestos: sin entrenamiento activo los AirPods no miden FC.

## 1. Crear el atajo

App **Atajos** → **+** → nombre exacto **`GymTracker Salud`** (la app lo abre por ese nombre).

Regla de oro: todo lo que dice *variable* va como **burbuja** (barra sobre el teclado o mantener presionado → **Seleccionar variable**), nunca escrito a mano. Al crear una variable, revisa que el nombre no tenga espacios al final.

### Token

1. **Texto** → pega el token (una sola línea).
2. **Establecer variable** `Token` a *Texto*.

### Frecuencia cardíaca

3. **Buscar muestras de salud**: Tipo es **Frecuencia cardíaca**; Fecha de inicio **está entre los/las últimos/as 2 días**; Límite apagado.
4. **Obtener detalles de muestras de salud** → **Valor** (de *Muestras de salud*).
5. **Combinar texto** *Valor* con **Nueva línea** → **Establecer variable** `FCValores`.
6. **Obtener detalles de muestras de salud** → **Fecha de inicio**, con la entrada apuntando a las *Muestras de salud* del paso 3 (mantener presionado → Seleccionar variable).
7. **Dar formato a fecha** → Formato de fecha **ISO 8601**, con **Incluir hora ISO 8601** activado.
8. **Combinar texto** *Fecha formateada* con **Nueva línea** → **Establecer variable** `FCFechas`.

### Energía

9. **Buscar muestras de salud**: Tipo es **Energía de actividad**; últimos 2 días; **Unidad: kcal**; Límite apagado.
10. Repite 4 a 8 sobre estas muestras → variables `EValores` y `EFechas`.

### Envío

11. **Obtener contenido de URL**
    - URL: `https://d2vs4ifr98bzf3.cloudfront.net/api/health-sync/samples`
    - Método **POST**.
    - Encabezados: `Authorization` = `Bearer ` + *Token*; `Accept` = `application/json`.
    - Cuerpo de la solicitud **JSON**, cuatro campos de tipo **Texto**: `heart_rate_values` = *FCValores*, `heart_rate_dates` = *FCFechas*, `energy_values` = *EValores*, `energy_dates` = *EFechas*.
12. **Obtener valor del diccionario** `message` en *Contenido de URL* → **Si** *Valor del diccionario* tiene algún valor → **Mostrar notificación** `GymTracker: token inválido. Genera uno nuevo en Mi cuenta.` → **Detener este atajo** → **Terminar si**.
13. **Obtener valor del diccionario** `summary` en *Contenido de URL* → **Mostrar notificación** *Valor del diccionario*.

Resultado esperado: una notificación como `16/11: ♥ 128 ppm prom · 162 máx · 412 kcal`, o `Sin datos de Salud en tus sesiones de las últimas 48 h.`

## 2. Primera ejecución

Corre el atajo con ▶. iOS pedirá permiso para leer **Frecuencia cardíaca** y **Energía de actividad**: permite ambos (o en **Ajustes → Salud → Acceso a datos y dispositivos → Atajos**).

## 3. Respaldo nocturno

Pestaña **Automatización** → **+** → **Hora del día** → 22:30 (o la hora en que sueles usar el teléfono), **Diariamente** → **Ejecutar inmediatamente** → desactiva **Notificar al ejecutar** → **Ejecutar atajo: GymTracker Salud**.

iOS protege los datos de Salud con el iPhone **bloqueado**: si corre bloqueado no encuentra muestras y no cambia nada. Elige una hora en que sueles tener el teléfono desbloqueado, o toca **"Traer FC y kcal de Salud"** en /hoy al terminar.

## 4. Compartir (para el botón "Instalar Atajo")

1. Borra tu token del paso 1 (deja el texto vacío).
2. En el atajo: **ⓘ → Configurar → Preguntas de importación → Agregar pregunta** sobre el **Texto** del paso 1: `Pega el token de GymTracker (Mi cuenta → Atajo de Salud)`.
3. **Compartir → Copiar enlace de iCloud**.
4. Ese enlace va en `HEALTH_SHORTCUT_INSTALL_URL` (`frontend/src/app/core/health/shortcut.ts`).

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| "token inválido" | El token se regeneró o se desconectó en Mi cuenta. Genera otro y pégalo en el paso 1. |
| "Sin datos de Salud…" | No hay sesiones terminadas en las últimas 48 h, la sesión aún no se envió, o no hubo FC (AirPods sin entrenamiento activo en Fitness). |
| Valores corridos 3 h | "Dar formato a fecha" no está en ISO 8601 con hora. |
| Error en "Obtener contenido de URL" | Sin internet; vuelve a correrlo. |

## API

- `POST /api/health-sync/samples` (token con habilidad `health:sync`): `heart_rate_values`, `heart_rate_dates`, `energy_values`, `energy_dates` — texto con una línea por muestra o arreglos JSON. Responde `{data: [{id, date, avg_heart_rate, max_heart_rate, active_calories}], summary}`.
- `GET /api/health-sync/workouts` y `PUT /api/health-sync/workouts/{id}`: variante anterior (el Atajo calcula); se mantienen por compatibilidad.
