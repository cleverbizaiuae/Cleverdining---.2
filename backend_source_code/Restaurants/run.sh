#!/usr/bin/env bash
# Exit on error
set -o errexit

# Run migrations at runtime
python manage.py migrate --noinput
python manage.py verify_schema --skip-type-check

# Start ASGI server (HTTP + WebSocket compatible).
# Gunicorn supervises Uvicorn workers and restarts them cleanly if one wedges.
# Multiple workers are safe for Channels only when Redis is configured.
DEFAULT_WEB_CONCURRENCY=1
if [ -n "${REDIS_URL:-}" ] || [ -n "${REDIS_HOST:-}" ]; then
  DEFAULT_WEB_CONCURRENCY=2
fi
WEB_CONCURRENCY=${WEB_CONCURRENCY:-$DEFAULT_WEB_CONCURRENCY}
WEB_TIMEOUT=${WEB_TIMEOUT:-60}
WEB_GRACEFUL_TIMEOUT=${WEB_GRACEFUL_TIMEOUT:-30}
PORT=${PORT:-8000}

exec gunicorn RESTAURANTS.asgi:application \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "$WEB_CONCURRENCY" \
  --bind "0.0.0.0:$PORT" \
  --timeout "$WEB_TIMEOUT" \
  --graceful-timeout "$WEB_GRACEFUL_TIMEOUT" \
  --keep-alive 5 \
  --max-requests 500 \
  --max-requests-jitter 50 \
  --access-logfile - \
  --error-logfile -
