# Hoy sabe lo que te falta esta semana

Fecha: 2026-11-19 · Estado: aprobado en conversación (opción A). Continúa `2026-11-19-semana-rutina-design.md`.

## Problema

Si el miércoles entrenas el día del jueves ("¿Otro día?"), el jueves Hoy vuelve a sugerir el del jueves aunque ya está hecho, y el del miércoles queda olvidado. Tampoco hay una vista de cómo va la semana.

## Definiciones

- **Semana:** lunes a domingo en `America/Santiago` (la del "hoy" del endpoint).
- **Día hecho esta semana:** existe un `workout` del usuario con `routine_day_id` de un día de la rutina activa y `date` dentro de la semana (terminado o no). Sesiones libres (`routine_day_id` null) y días de otras rutinas no cuentan.
- **Día pendiente:** día de la rutina activa **con** `weekday` que no está hecho esta semana. Los días "sin día fijo" no son pendientes ni cuentan en el total.

## Regla de la tarjeta grande (sin `?day=`)

1. Hoy no tiene día asignado → descanso (como ahora). `suggestion = null`.
2. El día de hoy no está hecho esta semana, o se hizo **hoy** → ese día. `suggestion = 'planned'`.
3. El día de hoy ya se hizo esta semana en **otra fecha** → `replaced` = ese día (con `done_on` = primera fecha en que se hizo) y:
   - hay pendientes → el pendiente con menor `weekday` (primero los atrasados). `suggestion = 'pending'`.
   - no hay → sin día, `suggestion = 'week_done'`.

Con `?day=` el día pedido manda (como ahora), `suggestion = 'chosen'`.

## API

`GET /api/today` agrega:

```json
{
  "suggestion": "planned | chosen | pending | week_done | null",
  "replaced": { "id": 4, "name": "Jueves – Piernas", "weekday": 4, "done_on": "2026-11-04" } | null,
  "week": { "start": "2026-11-02", "done_day_ids": [1, 4] }
}
```

La lógica vive en `App\Services\TodaySuggestion` (el controlador solo formatea). Fechas: comparar `date >= lunes` y `date < lunes siguiente` (SQLite guarda `Y-m-d 00:00:00`).

## UI (Hoy)

- **Franja semanal** bajo el saludo: L M M J V S D. Cada letra con un círculo: ✓ lima = día de la rutina hecho; borde lima = pendiente; punto gris = sin día asignado. Hoy con la letra en lima. Debajo: "{hechos} de {total} días esta semana". Solo si hay rutina activa con al menos un día con `weekday`.
- **Pendiente sugerido:** la etiqueta de la tarjeta dice "Te falta esta semana" y encima aparece "{replaced.name} ya lo hiciste el {día de la semana de done_on en minúscula}."
- **Semana completa:** en vez de "Hoy es día de descanso", "¡Semana completa!" con "Ya hiciste los {total} días de tu rutina. Si igual quieres moverte:" y la sesión libre.
- En "¿Otro día?" y en la lista de días de descanso, los días hechos esta semana muestran "Hecho" con ✓.
- Los campos nuevos son opcionales en el tipo `Today` (un "Hoy" guardado en el dispositivo antes del cambio no los trae): sin ellos la pantalla se ve como hoy.

## Fuera de alcance

- Semanas anteriores / historial de cumplimiento.
- Mover automáticamente el día en la rutina.
- Contar días "sin día fijo" como pendientes.

## Pruebas

- Pest (`TodayWeekTest`): días hechos de la semana (ignora semana anterior, sesiones libres y otras rutinas); sugiere el pendiente con `replaced`; mantiene el día si se hizo hoy; `week_done`; `chosen` con `?day=`; descanso → `suggestion` null.
- Vitest (`today-page.spec`): franja con hecho/pendiente y conteo; "Te falta esta semana" + aviso; "¡Semana completa!"; "Hecho" en la lista.
