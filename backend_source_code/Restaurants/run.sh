#!/usr/bin/env bash
# Exit on error
set -o errexit

# Run migrations (Runtime access to DB is guaranteed)
python manage.py migrate

# Start Gunicorn (Reverted to Stable WSGI for Debugging)
exec gunicorn RESTAURANTS.wsgi:application --bind 0.0.0.0:$PORT
