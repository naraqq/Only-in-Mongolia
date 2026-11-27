# Deploy Only in Mongolia

This runbook targets one Ubuntu 24.04 server. Compose runs three Laravel/PHP 8.4 web replicas behind Caddy, builds the React/Vite assets with Node 22, and runs MySQL 8.4, Redis 7, queue workers, and one Laravel scheduler. The scripts live in [deployment/](deployment/README.md) and the root commands forward to them.

## Install

Provision an Ubuntu 24.04 server with a non-root account that has sudo and Git repository access. Point the domain's DNS at the server and permit inbound TCP 80 and 443. Leave MySQL, Redis, and the application ports closed to the Internet. If an AAAA record exists, the IPv6 address must reach Caddy as well.

```bash
git clone git@github.com:username/project.git
cd project
sudo bash install.sh
```

The installer prompts for a hostname. For an unattended install, pass it as an argument with `sudo bash install.sh app.example.com`. It installs Docker Engine and the Compose plugin using the [Docker Ubuntu package repository](https://docs.docker.com/engine/install/ubuntu/). It generates a private `.env.docker` with a persistent application key and separate random MySQL app, MySQL root, and Redis passwords. Existing values are preserved. When upgrading an older install, rerun the installer after updating the checkout to add any missing Redis and MySQL root settings. MySQL only uses the configured root password when initializing an empty volume, so adding a missing setting does not change a root password in an existing database.

Interactive installation offers prompts for Verify.mn, QPay, and optional Sightengine and Sentry credentials. Configure Verify.mn and QPay before enabling real sign-in and checkout. To configure providers later or change the default two queue workers, run:

```bash
bash deployment/configure.sh
bash deploy.sh --no-pull
```

Press Enter to keep a value. Secret input is hidden and validated with Compose before saving. Worker concurrency can range from 1 to 16. Keep `APP_KEY` and existing database credentials across installs. Database password rotation requires changing the password inside MySQL as well as in the environment. Back up `.env.docker` separately in encrypted storage. Docker administrators can inspect container environment variables, so restrict Docker socket access.

For optional Sentry monitoring, create a Laravel project on the [Developer plan](https://sentry.io/pricing/) and paste its DSN into the configuration prompt. The integration is inactive without a DSN or outside production mode. It sends exception types and source locations, while omitting raw exception messages, request data, stack variables, and breadcrumbs. Tracing, profiling, logs, and metrics are disabled. Deploy the code containing the integration before configuring a running release. To check delivery from an authorized production or staging host, run `sudo docker exec only-in-mongolia-app-1 php artisan tinker --execute='report(new RuntimeException("Sentry setup check"));'` and confirm the test issue in Sentry.

Caddy obtains and renews certificates, and persists its certificate state. The installer checks the health of all running services and verifies the TLS certificate using the configured hostname. After deployment, confirm public routing from another network:

```bash
curl --fail https://app.example.com/up
```

## Services and storage

- [compose.yaml](compose.yaml) is the local-development base. [compose.production.yaml](compose.production.yaml) adds Redis, an isolated data network, per-container health checks, rolling log limits, and scalable workers.
- MySQL stores application data, sessions, and the durable Laravel queue. Redis serves the cache and scheduler locks. Keeping the queue in MySQL preserves pending media-scan jobs across upgrades, rollbacks, and Redis restarts.
- Creators' photos, videos and ID documents live on the media disk (`MEDIA_DISK`): the `uploads` volume by default, or a private Cloudflare R2 bucket (`MEDIA_DISK=r2`). With R2, viewers download straight from Cloudflare (no AWS transfer cost): the app checks permission and redirects to a signed link valid for 10 minutes. Photos stamped with the viewer's ID are still made and sent by the app (from a cached copy); ID documents are only ever streamed to admins through the app. To switch: set `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` and `R2_ENDPOINT` in `.env.docker`, deploy, run `php artisan media:check --disk=r2` and `php artisan media:copy --to=r2` in the app container, then set `MEDIA_DISK=r2` and deploy again. Keep the bucket private (no public `r2.dev` access or custom domain).
- One Reverb container serves real-time updates (new messages, notification badges, live Q&A). Browsers connect to `wss://your-site/app/...`, which Caddy passes to it; Reverb's event API (`/apps/...`) is only reachable by the app over the internal network. The installer generates `REVERB_APP_KEY`, `REVERB_APP_SECRET` and `REVERB_ALLOWED_ORIGINS` (your hostname), and adds them to older installs. Updates carry no private content: pages reload what changed through the normal, permission-checked routes, and fall back to polling if the connection drops. One container handles about a thousand open connections; beyond that, see [docs/docker.md](docs/docker.md#real-time-updates).
- Every uploaded video is converted once to a web MP4 (H.264/AAC, 720p by default, playback starts at once, location metadata removed) with a still and seek-bar frames, by the `media-worker` container (ffmpeg is in the image). It runs on its own `media` queue so a long video never delays other jobs; the original is removed 10 minutes after its web version replaces it. Settings are in [config/media.php](config/media.php) (`MEDIA_VIDEO_MAX_SIDE=1920` for 1080p). Convert videos uploaded before this with `php artisan media:transcode` in the app container. A conversion cut short by a deploy is retried once its reservation (the conversion timeout plus five minutes) runs out.
- Videos of 30 seconds or more also get adaptive streaming (HLS): 360p and 540p versions next to the converted one, in 4-second pieces, made by the media worker. The player steps quality up and down with the viewer's connection (and offers a Quality menu); anything that can't stream plays the single MP4. Pieces load straight from R2 through signed links in the playlists, which the app serves behind its permission check; browsers only allow that when the bucket permits the site, so run `php artisan media:cors` once after switching to R2 (or add a CORS rule allowing GET/HEAD from the site in the Cloudflare dashboard). Streaming roughly doubles a long video's storage. `php artisan media:transcode` adds it to earlier videos.
- Companies get a PDF receipt for every paid campaign (Business → Campaigns; admins from Admin → Sponsored). Set the seller's details (`BILLING_SELLER_*`) before launch; prices include VAT (`BILLING_VAT_PERCENT`). To register receipts with e-barimt, install the tax office's PosAPI 3.0 service where the app can reach it, fill in the `EBARIMT_*` values from your registration, issue a test receipt, then set `EBARIMT_DRIVER=posapi`. Receipts register in the background and retry for about an hour; `php artisan billing:ebarimt` lists any that didn't (`--retry` resends them, `--backfill` makes receipts for campaigns paid before receipts existed). Refunds return the receipt at e-barimt.
- The scheduler runs the existing subscription reminders, wallet renewals, scheduled-post announcements, and live Q&A start reminders. Workers process jobs such as upload scanning. The configured shutdown grace period exceeds the worker timeout, which is shorter than the queue reservation timeout.
- Named volumes hold MySQL data, shared Laravel uploads, and Caddy state. Laravel serves public images from the public upload directory and performs permission checks before serving private media. Redis is disposable cache and is excluded from backups.
- Only Caddy publishes ports. Containers restart after unexpected process exits. Check health separately because Docker does not automatically restart a running process solely because its health check fails.

## Runtime settings

- Each container caches its configuration, routes, views and events when it starts (`docker/entrypoint.sh`), so changes to `.env.docker` apply after `bash deploy.sh --no-pull`.
- Production logs at `LOG_LEVEL=warning` unless you set another level. The app runs on Mongolian time (`APP_TIMEZONE=Asia/Ulaanbaatar`): reminders, renewals, "this month" totals and daily insights follow local days. Set it before the first real data; changing it later shifts how stored times are read.
- Push notifications use the `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` pair that `install.sh` writes (older servers get one on their next install run). Keep the pair: replacing it turns push off on every phone until people turn it back on. iPhones only receive push after the site is added to the Home Screen.
- Paid and private photos are stamped with the viewer's ID when first opened. The copies live in the uploads volume under `stamped/`, and `media:prune-stamps` removes ones unopened for 7 days.
- PHP accepts uploads for up to 5 minutes (`max_input_time=300`) with 256 MB of memory, for large videos over slow mobile connections and full-size phone photos.
- Caddy sends HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, a strict referrer policy and a restrictive `Permissions-Policy`.

## Deploy and inspect

```bash
bash deploy.sh
bash status.sh
```

Deploy requires a clean Git checkout and pulls via fast-forward only. It snapshots the commit, builds a tagged image before stopping writers, then takes a MySQL backup and migrates. It recreates the web, worker, and scheduler containers, waits for their health checks and Caddy, verifies HTTPS, and records the active release. Plan for a short maintenance window during backups and migrations. Re-running a healthy revision reconciles services without rerunning migrations.

Status shows the active, previous, and pending releases, the Compose containers, and the HTTPS check. To inspect service logs:

```bash
sudo docker logs --tail 100 only-in-mongolia-app-1
sudo docker logs --tail 100 only-in-mongolia-worker-1
sudo docker logs --tail 100 only-in-mongolia-proxy-1
```

Routine logs rotate. Apache access logs omit query strings, referrers, and request bodies. Production debug is disabled. Restrict access to logs and avoid printing resolved Compose configuration because it contains secrets.

## Back up and recover

```bash
bash backup.sh
bash backup.sh --database-only
```

The full backup briefly stops application writers and produces a pair of validated archives under `.deployment/backups/`: `database.sql.gz` and `storage.tar.gz`. The storage archive contains public and private uploads and both Caddy volumes. The command restarts the existing release after success or failure. The database-only option takes an online transaction-consistent SQL dump. Pre-migration backups are database-only.

### Automatic backups

```bash
sudo bash deployment/install-backup-timers.sh
```

This installs two systemd timers (Mongolian time): an online database dump every night at 03:30, and a full snapshot (database, uploads, Caddy state; writers pause briefly) every Sunday at 04:00. Old backups are pruned after `BACKUP_KEEP_DAYS` (default 14) and full snapshots after `BACKUP_KEEP_FULL_DAYS` (default 56). Set `BACKUP_RSYNC_TARGET` in `.env.docker` (for example `backup@storage.example.com:only-in-mongolia/`) to copy every finished backup off this server with the deploying account's SSH key. The timers run as the deploying account, which must reach Docker without a password prompt. Check runs with `journalctl -u only-in-mongolia-backup-db -u only-in-mongolia-backup-full`.

Store backups encrypted off-server. The archives contain sensitive records and TLS material. Keep the application key, environment file, release state, and tagged images protected. Verify recovery on a separate host or project. Run `gzip -t database.sql.gz` and `tar -tzf storage.tar.gz`. Import SQL into an empty recovery database using `gzip -dc database.sql.gz | mysql --defaults-extra-file=/private/recovery-client.cnf recovery_db`. Extract into a private staging directory and restore uploads and Caddy state into new volumes before switching traffic. Review writes since the backup before promoting any recovered data.

## Roll back

```bash
bash rollback.sh
```

On deployment failure, the script attempts an application-only rollback when a prior release exists. Manual rollback uses the same guard. It compares the live MySQL schema and Laravel migration ledger with the previous release. If they match, it takes a database backup, switches to the previous image and configuration, and checks health. A repeated rollback does not toggle to the newer release.

If the schema or migration ledger differs, rollback stops before switching. It never runs down migrations or imports a dump over production. Review data-format compatibility even for schema-identical releases. For schema changes, use backward-compatible expand-and-contract releases and prepare a forward fix. Investigate a partially applied MySQL migration before retrying.

If the first deploy or any later deploy is interrupted, inspect `bash status.sh`, the migration logs, and the database. If it is safe to proceed with the same candidate, run `bash deploy.sh --resume`. If the failed candidate needs a code or migration fix, push a reviewed descendant of that commit to the same branch and run `bash deploy.sh --forward-fix`. This takes another backup and uses the normal migration and health checks. Keep the deployment state and volumes intact.

This stack is single-host infrastructure. Multiple replicas improve application concurrency. A host outage still takes the site offline. Keep off-host backups and monitor disk usage, certificates, queue depth, and external availability.
