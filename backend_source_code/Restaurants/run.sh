#!/usr/bin/env bash
# Exit on error
set -o errexit

# Run migrations (Runtime access to DB is guaranteed)
python manage.py migrate

# Start Gunicorn
# Adjust 'RESTAURANTS.wsgi' if your project name is different
exec gunicorn RESTAURANTS.wsgi:application --bind 0.0.0.0:$PORT
