# GymTracker

App web para planificar rutinas de gimnasio, registrar series y ver progreso. Uso personal (Luciano), modelo multiusuario.
Spec completa: `docs/superpowers/specs/2026-11-03-gymtracker-design.md`. Planes por fase: `docs/superpowers/plans/`.

## Stack
- `backend/`: Laravel 13 (API REST, sin vistas), Sanctum SPA (cookies + CSRF), Pest.
- `frontend/`: Angular 22 (standalone, Signals, zoneless), TypeScript estricto, Tailwind 4, spartan/ui, Angular CDK, Vitest. Gráficos: ngx-echarts (fase 4). Datos locales: Dexie (fase 3).
- Postgres 17 en Docker para desarrollo; SQLite en memoria para tests. Producción (fase 5): AWS serverless (CloudFront + S3, API Gateway + Lambda/Bref, Aurora Serverless v2 con auto-pausa, CDK en TypeScript).

## Comandos
- Levantar: `docker compose up -d` (Postgres expuesto en el host en :5433, backend en :8000) y `cd frontend && npm start` (:4200, proxy de /api, /auth, /sanctum).
- Migrar y sembrar: `docker compose exec backend php artisan migrate:fresh --seed`.
- Tests backend: `cd backend && ./vendor/bin/pest`. Tests frontend: `cd frontend && npx ng test --watch=false`.
- Crear usuario: `docker compose exec backend php artisan app:create-user <email> <nombre>`.

## Convenciones
- Código, tablas y variables en inglés; textos de UI en español (Chile). kg, `dd/mm/aaaa`, `America/Santiago`, decimales con coma.
- Enums como string en inglés (`App\Enums`); la UI los traduce.
- Modelos de usuario usan `BelongsToUser` (global scope + user_id automático). Toda consulta queda restringida al usuario autenticado.
- `workouts`, `workout_exercises`, `workout_sets` usan ULID generados por el cliente (sincronización offline idempotente).
- Ejercicios con historial se archivan, no se borran. Editar rutinas nunca modifica el historial (se copian a `workout_exercises`).
- Validación en Form Requests. Lógica de estadísticas en `app/Services/Stats`, nunca en controladores.
- Laravel debe seguir siendo apto para Lambda: sesiones y caché en BD, sin escribir archivos en disco.

## Cómo trabajar
- Por fases (spec, sección 11). Terminar una fase con tests en verde y commit antes de pasar a la siguiente.
- TDD en servicios y endpoints. No agregar complejidad antes de tiempo.
- Explicar en pocas líneas cada decisión importante.
- `artisan serve` en Docker corre con `--no-reload`: sin eso, el proceso servidor ignora las variables `DB_*` del contenedor y usa el SQLite de `.env`.

