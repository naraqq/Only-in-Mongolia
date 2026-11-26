# Run Only in Mongolia with Docker

Use Docker Desktop with Linux containers on Windows or Docker Engine with the Compose plugin on Linux. Copy `.env.docker.example` to `.env.docker`. Replace the database password before the first startup. Compose uses this same file for the app, worker, and scheduler.

```sh
docker compose --env-file .env.docker build app
docker compose --env-file .env.docker run --rm --no-deps app php artisan key:generate --show
```

Paste the generated value into `APP_KEY` in `.env.docker`. Keep the key across deploys and back it up securely.

## Local development

Set `VERIFY_MN_DEV_PHONES` to your eight-digit test number for local sign-in. Leave the QPay credentials empty to use fake checkout.

```sh
docker compose --env-file .env.docker up -d --scale app=1
docker compose --env-file .env.docker exec -u www-data app php artisan db:seed
```

Open `http://localhost:8080`. Seeding is optional. After editing code, rerun the build and startup commands. For Vite hot reload, use the native development workflow in the README.

## Single-server deployment

For Ubuntu 24.04, follow the [production deployment runbook](../DEPLOYMENT.md). It covers the production Compose overlay, credentials, automatic HTTPS, backups, and rollback.

Use the [production readiness checklist](production-readiness.md) before accepting real payments or identity documents.
