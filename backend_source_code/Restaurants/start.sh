#!/bin/bash

echo "🔧 Running database migrations..."
python manage.py migrate --noinput
python manage.py verify_schema --skip-type-check

echo "🗂️  Collecting static files..."
python manage.py collectstatic --noinput --clear

echo "📁 Verifying static files..."
ls -la staticfiles/admin/ 2>/dev/null | head -5 || echo "Static files directory check..."

echo "🚀 Starting Daphne server..."
daphne -b 0.0.0.0 -p $PORT RESTAURANTS.asgi:application
