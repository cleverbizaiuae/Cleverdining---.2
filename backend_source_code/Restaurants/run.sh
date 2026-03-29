#!/usr/bin/env bash
# Exit on error
set -o errexit

# Run migrations at runtime
python manage.py migrate --noinput

# Start ASGI server (WebSocket-compatible)
exec daphne -b 0.0.0.0 -p "$PORT" RESTAURANTS.asgi:application
