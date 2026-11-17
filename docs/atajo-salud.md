# Atajo "GymTracker Salud"

Lleva la **FC promedio, FC máxima y kcal** que registró Apple Salud (AirPods con sensor de FC o Apple Watch) a cada sesión de GymTracker. Se arma **una sola vez**; después se comparte como enlace de iCloud y cualquiera lo instala desde **Mi cuenta → Atajo de Salud → Instalar Atajo**.

Cómo funciona: el Atajo pide a GymTracker las sesiones terminadas en las últimas 48 h (con su hora de inicio y fin), busca en Salud la FC y la energía dentro de ese horario y envía tres números por sesión. Reenviar no duplica nada: el servidor sobrescribe. Si no hay muestras, envía 0 y el servidor lo ignora (no borra datos anteriores).

## 0. Antes de empezar

1. En GymTracker: **Mi cuenta → Atajo de Salud → Generar token** → **Copiar**. El token se muestra una sola vez; si lo pierdes, genera otro (el anterior deja de servir).
2. En el gimnasio, inicia en Fitness el entrenamiento ("Fuerza tradicional") con los AirPods puestos: sin entrenamiento activo los AirPods no miden FC.

## 1. Crear el atajo

App **Atajos** → pestaña **Atajos** → **+**. Nómbralo exactamente **`GymTracker Salud`** (la app lo abre por ese nombre).

Agrega estas acciones en orden (los nombres pueden variar un poco según la versión de iOS):

### Configuración

1. **Texto** → pega tu token. Toca la acción → **Renombrar variable**… o agrega **Establecer variable** con nombre `Token`.
2. **Texto** → `https://d2vs4ifr98bzf3.cloudfront.net` → **Establecer variable** `URL`.

### Pedir las sesiones

3. **Obtener contenido de URL**
   - URL: `URL` + `/api/health-sync/workouts` (escribe el texto después de la variable).
   - Muestra más → Método **GET**.
   - Encabezados: `Authorization` = `Bearer ` + variable `Token` (con espacio después de Bearer); `Accept` = `application/json`.
4. **Obtener valor del diccionario** → clave `message` en *Contenido de la URL*.
5. **Si** *Valor del diccionario* **tiene algún valor**:
   - **Mostrar notificación**: `GymTracker: token inválido. Genera uno nuevo en Mi cuenta.`
   - **Detener este atajo**.
   - **Fin del Si**.
6. **Obtener valor del diccionario** → clave `data` en *Contenido de la URL*.

### Por cada sesión

7. **Repetir con cada** elemento de *Valor del diccionario* (`data`). Dentro del bloque:
   1. **Obtener valor del diccionario** `id` de *Elemento de repetición* → **Establecer variable** `Sesion`.
   2. **Obtener valor del diccionario** `started_at` de *Elemento de repetición* → **Obtener fechas de** (la entrada) → **Establecer variable** `Inicio`.
   3. Igual con `finished_at` → **Establecer variable** `Fin`.
   4. **Buscar muestras de salud** donde **Todas** las condiciones:
      - Tipo es **Frecuencia cardíaca**
      - Fecha de inicio **está después de** `Inicio`
      - Fecha de fin **está antes de** `Fin`
      - Límite: desactivado.
   5. **Calcular estadísticas** → **Promedio** de *Muestras de salud* → **Establecer variable** `FCProm`.
   6. **Calcular estadísticas** → **Máximo** de *Muestras de salud* (las del paso 4) → **Establecer variable** `FCMax`.
   7. **Buscar muestras de salud**: Tipo es **Energía de actividad**, mismas dos condiciones de fecha, **Unidad: kcal**.
   8. **Calcular estadísticas** → **Suma** → **Establecer variable** `Kcal`.
   9. **Obtener contenido de URL**
      - URL: `URL` + `/api/health-sync/workouts/` + `Sesion`.
      - Método **PUT**; encabezados iguales al paso 3.
      - Cuerpo de la solicitud: **JSON** con tres campos tipo **Número**: `avg_heart_rate` = `FCProm`, `max_heart_rate` = `FCMax`, `active_calories` = `Kcal`.
   10. **Mostrar notificación**: `GymTracker: ♥ FCProm ppm · Kcal kcal` (inserta las variables).
   - **Fin de Repetir**.

> Si en el paso 5 "Calcular estadísticas" no acepta las muestras directamente, agrega antes **Obtener detalles de muestras de salud → Valor** y calcula sobre eso.

## 2. Primera ejecución

Corre el atajo a mano con ▶. iOS pedirá permiso para leer **Frecuencia cardíaca** y **Energía de actividad**: permite ambos. Debería llegar una notificación por cada sesión de las últimas 48 h, y en GymTracker la sesión mostrará la tarjeta **Salud**.

## 3. Respaldo nocturno

Pestaña **Automatización** → **+** → **Hora del día** → 22:30 (o la hora en que sueles usar el teléfono), **Diariamente** → **Ejecutar inmediatamente** → desactiva **Notificar al ejecutar** → acción **Ejecutar atajo: GymTracker Salud**.

Importante: iOS protege los datos de Salud mientras el iPhone está **bloqueado**. Si la automatización corre con el teléfono bloqueado, no encontrará muestras y no cambiará nada (no borra datos). Elige una hora en la que normalmente tengas el teléfono desbloqueado, o simplemente toca **"Traer FC y kcal de Salud"** en /hoy al terminar.

## 4. Compartir (para el botón "Instalar Atajo")

1. En el atajo: **Configuración (ⓘ) → Configurar → Preguntas de importación → Agregar pregunta** sobre el **Texto del token** (paso 1). Pregunta: `Pega el token de GymTracker (Mi cuenta → Atajo de Salud)`. Borra tu token del texto antes de compartir.
2. **Compartir → Copiar enlace de iCloud**.
3. Ese enlace va en `HEALTH_SHORTCUT_INSTALL_URL` (`frontend/src/app/core/health/shortcut.ts`). Con eso aparece el botón **Instalar Atajo**, que copia el token y abre la importación: solo hay que pegarlo.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| "token inválido" | El token se regeneró o se desconectó en Mi cuenta. Genera otro y pégalo en el paso 1. |
| No llega notificación ni datos | No hay sesiones terminadas en las últimas 48 h, o la sesión aún no se envió (sin conexión). |
| Llega "♥ 0 ppm" | No había muestras de FC en ese horario (AirPods sin entrenamiento activo en Fitness). El servidor ignora los ceros. |
| Error en "Obtener contenido de URL" | Sin internet; vuelve a correrlo. |
