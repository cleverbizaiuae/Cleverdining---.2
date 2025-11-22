# Dockerfile for Django with PostgreSQL
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

COPY requirements.txt /app/
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . /app/

# # Collect static files (if using Django staticfiles)
# RUN python manage.py collectstatic --noinput || true

EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
