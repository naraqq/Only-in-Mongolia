#!/bin/sh
# Every container (web, worker, scheduler, migrate) starts here.
# Cache config, routes, views and events for this container's environment. It can't happen at build time:
# the settings only arrive as environment variables when the container starts.
set -e

if [ "$(id -u)" = 0 ]; then
    runuser -u www-data -- php artisan optimize --no-interaction >/dev/null
else
    php artisan optimize --no-interaction >/dev/null
fi

exec docker-php-entrypoint "$@"
