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

## Real-time updates

The `reverb` service runs Laravel Reverb (WebSockets). The app and worker send it small "something changed" events over the internal network; browsers connect through the proxy at `/app/...` on the site's own address, so no extra port is opened. The browser learns where to connect at runtime (shared Inertia prop `reverb`), so the same image works in every environment. Set `REVERB_CLIENT_HOST`/`PORT`/`SCHEME` only if browsers must reach Reverb somewhere else.

Check it with `docker compose --env-file .env.docker logs reverb`. If Reverb is down, nothing breaks: sending still works and pages poll every few seconds until it's back.

Capacity: one container handles roughly 1,000 simultaneous connections with PHP's default event loop. Past that, add the `ev` or `uv` PHP extension to the image (Reverb picks it up automatically), or enable `REVERB_SCALING_ENABLED=true` (uses Redis) and run more `reverb` containers.

## Single-server deployment

For Ubuntu 24.04, follow the [production deployment runbook](../DEPLOYMENT.md). It covers the production Compose overlay, credentials, automatic HTTPS, backups, and rollback.

Use the [production readiness checklist](production-readiness.md) before accepting real payments or identity documents.
