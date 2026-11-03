# GymTracker

Planifica rutinas de gimnasio, registra cada serie desde el celular y mira tu progreso.

**Stack:** Angular 22 + TypeScript · Tailwind + spartan/ui · Laravel 13 (API REST + Sanctum) · Postgres · Docker · AWS serverless (próximamente).

## Requisitos
PHP 8.5 + Composer, Node 24, Docker.

## Desarrollo

```bash
cp backend/.env.example backend/.env
(cd backend && composer install && php artisan key:generate)
docker compose up -d
docker compose exec backend php artisan migrate:fresh --seed
(cd frontend && npm install && npm start)
```

Postgres queda expuesto en `localhost:5433` (usuario `gymtracker`, clave `secret`).

Abrir http://localhost:4200 e iniciar sesión con `luciano@gymtracker.test` / `password` (valores de `SEED_USER_*`).

## Tests

```bash
(cd backend && ./vendor/bin/pest)
(cd frontend && npx ng test --watch=false)
```
