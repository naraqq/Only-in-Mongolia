# Only in Mongolia

A Mongolian-first creator membership platform built with Laravel, Inertia, React, and TypeScript. Fans follow creators, subscribe, tip, and unlock paid posts and messages. Creator Studio handles publishing, promotions, analytics, and earnings. Admin tools handle applications, reports, and payouts.

## Local setup

For a containerized setup with MySQL and a three-replica server deployment, see the [Docker guide](docs/docker.md).
For a production Ubuntu server, see the [installation and deployment runbook](DEPLOYMENT.md).

Use PHP 8.4 with SQLite and GD, Composer 2, and Node.js 22.

```sh
composer install
npm ci
php -r "file_exists('.env') || copy('.env.example', '.env');"
php artisan key:generate
php -r "file_exists('database/database.sqlite') || touch('database/database.sqlite');"
php artisan migrate
php artisan db:seed
composer dev
```

Generate the key once for a fresh environment. Seeding is optional and adds demo data. Open the URL printed by Artisan. If PowerShell blocks `npm.ps1`, use `npm.cmd`.

- Set `VERIFY_MN_API_KEY` for real phone verification or set `VERIFY_MN_DEV_PHONES` to comma-separated eight-digit test numbers for local sign-in.
- Leave QPay credentials empty for fake checkout locally. The `QPAY_*` variables configure the merchant integration.
- Run `php artisan user:make-admin YOUR_PHONE` for an existing local account, then set up an authenticator in Settings before opening Admin.
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
