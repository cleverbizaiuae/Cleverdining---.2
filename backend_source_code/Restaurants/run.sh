#!/usr/bin/env bash
# Exit on error
set -o errexit

# Run migrations (Runtime access to DB is guaranteed)
python manage.py migrate

# Start Daphne (ASGI) to support WebSockets + HTTP
# Replaces: exec gunicorn RESTAURANTS.wsgi:application --bind 0.0.0.0:$PORT
exec daphne -b 0.0.0.0 -p $PORT RESTAURANTS.asgi:application
