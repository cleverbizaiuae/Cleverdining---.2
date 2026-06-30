#!/usr/bin/env bash
# Exit on error
set -o errexit

# Run migrations at runtime
python manage.py migrate --noinput
python manage.py verify_schema --skip-type-check

# Start ASGI server (WebSocket-compatible)
exec daphne -b 0.0.0.0 -p "$PORT" RESTAURANTS.asgi:application
