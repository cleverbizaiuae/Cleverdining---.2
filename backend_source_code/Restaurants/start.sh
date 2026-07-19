#!/bin/bash

echo "🔧 Running database migrations..."
python manage.py migrate --noinput
python manage.py verify_schema --skip-type-check
python manage.py seed_pranay_menu
python manage.py warm_upsell_intelligence
# Persistent LLM decisions are warmed in the background so deploy health does
# not wait on the external provider. Customer requests reuse these decisions.
python manage.py warm_upsell_decisions --workers "${UPSELL_WARM_WORKERS:-2}" &

echo "🗂️  Collecting static files..."
python manage.py collectstatic --noinput --clear

echo "📁 Verifying static files..."
ls -la staticfiles/admin/ 2>/dev/null | head -5 || echo "Static files directory check..."

echo "🚀 Starting ASGI server..."
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
