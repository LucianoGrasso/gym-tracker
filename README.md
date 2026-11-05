# GymTracker

Planifica rutinas de gimnasio, registra cada serie desde el celular y mira tu progreso.

**Stack:** Angular 22 + TypeScript · Tailwind + spartan/ui · Laravel 13 (API REST + Sanctum) · Postgres · Docker · AWS serverless (CDK).

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
(cd infra && npm test)
```

## Producción (AWS)

URL: _se completa tras el primer despliegue_.

```
CloudFront ──┬── /*                          → S3 (build de Angular, PWA)
             └── /api/*, /auth/*, /sanctum/* → API Gateway HTTP API → Lambda (Laravel + Bref, PHP 8.5)
                                                                       │ VPC, subredes aisladas, sin NAT
                                                                       ▼
                                               Aurora Serverless v2 PostgreSQL (0 ACU, auto-pausa 10 min)
EventBridge Scheduler (lun, mar, jue, vie 18:45 Santiago) → Lambda artisan `app:wake-db`
```

- **Desplegar:** push a `main`. El workflow `Deploy` corre los tests, empaqueta el backend sin dependencias de desarrollo, ejecuta `cdk deploy`, migra y prueba `/api/health`.
- **No** correr `cdk deploy GymTrackerStack` desde el PC: subiría `vendor/` con dependencias de desarrollo.
- **Secretos:** en SSM Parameter Store, `/gymtracker/prod/app-key` y `/gymtracker/prod/db-password`. Se crean una sola vez con `infra/scripts/init-secrets.sh` y el workflow los pasa a CloudFormation como parámetros `NoEcho`.
- **Artisan en producción** (requiere `aws login`):
  ```bash
  infra/scripts/artisan.sh "migrate:status"
  infra/scripts/artisan.sh "app:create-user <email> <nombre> --password=<pwd> --seed"
  ```
- **Horario del despertar de Aurora:** `infra/cdk.json` → `context.warmUp`, luego push a `main`.
- **Rol de GitHub Actions** (OIDC, una sola vez desde el PC): `cd infra && npx cdk deploy GymTrackerCiStack` y guardar el output `DeployRoleArn` en la variable de repo `AWS_DEPLOY_ROLE_ARN`.
- **Costo esperado:** unos USD 3/mes, casi todo de Aurora encendida.
