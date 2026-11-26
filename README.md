# Only in Mongolia

A Mongolian-first creator membership platform built with Laravel, Inertia, React, and TypeScript. Fans follow creators, subscribe, tip, and unlock paid posts and messages. Creator Studio handles publishing, promotions, analytics, and earnings. Admin tools handle applications, reports, and payouts.

## Local setup

For a containerized setup with MySQL and a three-replica server deployment, see the [Docker guide](docs/docker.md).
For a production Ubuntu server, see the [installation and deployment runbook](DEPLOYMENT.md).

Use PHP 8.4 with `pdo_mysql` and GD, Composer 2, Node.js 22, and Docker Desktop (for the MySQL 8.4 database, the same version as production).

```sh
composer install
npm ci
php -r "file_exists('.env') || copy('.env.example', '.env');"
php artisan key:generate
docker compose -f compose.dev.yaml up -d
php artisan migrate
php artisan db:seed
composer dev
```

`compose.dev.yaml` runs MySQL on `127.0.0.1:3307` (3306 is often taken by XAMPP) with two databases: `only_in_mongolia` for the app and `only_in_mongolia_test` for `php artisan test`. Its data lives in a Docker volume and survives restarts; it starts again with Docker Desktop. Generate the key once for a fresh environment. Seeding is optional and adds demo data. Open the URL printed by Artisan. If PowerShell blocks `npm.ps1`, use `npm.cmd`.

- Set `VERIFY_MN_API_KEY` for real phone verification or set `VERIFY_MN_DEV_PHONES` to comma-separated eight-digit test numbers for local sign-in.
- Leave QPay credentials empty for fake checkout locally. The `QPAY_*` variables configure the merchant integration.
- Run `php artisan user:make-admin YOUR_PHONE` for an existing local account, then set up an authenticator in Settings before opening Admin.
- Push notifications are on when `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set (`php artisan push:keys` prints a pair). On Windows, PHP's OpenSSL also needs `OPENSSL_CONF` set before PHP starts, e.g. in Git Bash `export OPENSSL_CONF="C:\xampp\php\extras\ssl\openssl.cnf"`, then `composer dev`. Browsers allow push on `localhost` without HTTPS.
- See `.env.example` for filesystem, wallet, fee, admin 2FA, and upload scanning settings.

## Development checks

```sh
npm run types
npm test
npm run format:check
npm run build
php artisan test
```

GitHub Actions runs type checking, frontend tests, the asset build, and PHP tests for `main` and `develop`.

Payment settlement, wallets, renewals, and earnings live under `app/Payments`. Upload scanning lives under `app/Moderation` and `app/Jobs`. Inertia pages live under `resources/js/pages`. See the [production readiness checklist](docs/production-readiness.md) for staging and deployment checks.

The starter feed leads with free work from approved creators. To curate it for a launch, edit the ordered handle-to-interest list in `config/starter-feed.php`. Only interests with eligible posts are shown, and unlisted creators can appear under All.
