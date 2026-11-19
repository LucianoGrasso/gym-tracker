# Semana de la rutina: tablero de 7 días y "Hacer otro día"

Fecha: 2026-11-19 · Estado: aprobado en conversación.

## Problema

Cada día de rutina tiene un `weekday` (1 = lunes … 7 = domingo, o `null` = sin día fijo) y el Form Request no deja que dos días de la misma rutina compartan `weekday`. Intercambiar miércoles y jueves obliga a tres ediciones (dejar uno sin día, asignar el otro, reasignar el primero). Además, para entrenar puntualmente el día del jueves un miércoles hay que modificar la rutina.

## Solución (dos partes)

### 1. Tablero semanal (cambio permanente)

En el detalle de la rutina (`/rutinas/:id`), la lista "Días" se reemplaza por un tablero:

```
LUN  [≡ Pecho y tríceps · 6 ejercicios]
MAR  [≡ Espalda y bíceps · 6 ejercicios]
MIÉ  ┄ Descanso ┄
JUE  [≡ Piernas · 7 ejercicios]
VIE  [≡ Hombros · 5 ejercicios]
SÁB  ┄ Descanso ┄
DOM  ┄ Descanso ┄

SIN DÍA FIJO
[≡ Día extra · 4 ejercicios]
```

- 7 filas (no columnas: no caben en el iPhone) más la bandeja "Sin día fijo".
- Se arrastra desde el ícono ≡ (Angular CDK, listas conectadas). Tocar la tarjeta abre el día; duplicar y eliminar siguen en la tarjeta.
- Reglas al soltar:
  - Sobre un día ocupado → se **intercambian**. Si el arrastrado venía de la bandeja, el desplazado entra a la bandeja en el lugar que dejó.
  - Sobre un día de descanso → el día **se mueve** ahí.
  - En la bandeja → queda sin día fijo, en la posición donde se suelta (la bandeja se puede reordenar).
  - Soltar en el mismo lugar → no pasa nada.
- Optimista: el tablero cambia al instante y guarda en segundo plano; si falla, muestra el error y recarga.
- `position` queda alineada con el tablero: lunes→domingo y luego la bandeja en su orden.
- "Agregar día" con su selector de día de la semana no cambia.

**Backend:** `PUT /api/routines/{routine}/schedule` con `{ "days": [{ "id": 12, "weekday": 3 }, …] }`.
- Debe incluir **todos** los días de la rutina, cada uno una vez; el orden del arreglo es la nueva `position`.
- `weekday` es `null` o 1–7, sin repetidos (los `null` no cuentan).
- Todo en una transacción; responde 204. Protegido por la policy `manage` de la rutina.
- Errores 422 en español: "Hay dos días asignados al mismo día de la semana." / "Faltan días de la rutina." Ids de otra rutina → 422 por `exists`.

La lógica de mover/intercambiar vive en una función pura del frontend (`core/routine/schedule.ts`), probada aparte.

### 2. "Hacer otro día" en Hoy (cambio puntual)

- `GET /api/today?day={id}` devuelve ese día (con ejercicios y última marca) en `day`, en vez del que corresponde al día de la semana. 404 si el día no es de la rutina activa del usuario.
- En el frontend el día elegido va en la URL: `/hoy?dia=12` (input de ruta `dia`). Caché local por clave `today:day:{id}` (sin conexión funciona igual que "Hoy").
- Con un día elegido, la tarjeta dice "Elegiste para hoy" en vez de "Te toca hoy" y aparece "Volver a lo de hoy" (enlace a `/hoy`).
- Debajo de los ejercicios del día, sección **"¿Otro día?"** con los demás días de la rutina (siempre visible, sin desplegable), cada uno con su día de la semana y enlace a `/hoy?dia={id}`. No aparece con un entrenamiento en curso.
- En día de descanso, la lista "Días de {rutina}" ya existente enlaza a `/hoy?dia={id}` (antes llevaba a editar el día).
- "Empezar entrenamiento" usa el mismo `startFromDay(today)`: el entrenamiento queda con la fecha de hoy y el `routine_day_id` elegido. La rutina no cambia.
- Si el día pedido no carga (404 sin caché), se muestra el error con "Volver a lo de hoy".

### Fuera de alcance

- Reprogramar automáticamente la semana (si el miércoles hiciste el del jueves, el jueves sigue sugiriendo el del jueves).
- Mover días entre rutinas.
- Columnas tipo calendario.

## Pruebas

- Pest: `schedule` (intercambio, mover a bandeja, posición según orden, weekday repetido, días faltantes, día de otra rutina, rutina ajena 403); `today?day=` (devuelve el elegido con última marca, 404 de otra rutina).
- Vitest: `moveDay`/`boardOrder` (casos de las reglas), `WeeklyBoard` (render de filas y bandeja, emite el nuevo orden al soltar), `TodayPage` (sección "¿Otro día?", día elegido, rest day enlaza a `/hoy?dia=`).
