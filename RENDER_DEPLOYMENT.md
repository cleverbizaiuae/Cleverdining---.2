# Render.com Deployment Guide

## Quick Fix for Current 500 Error

### Step 1: Check Backend Status
Visit: https://cleverdining-2.onrender.com/health/

**If you get an error or can't connect:**
1. Go to Render Dashboard
2. Check if service is running
3. Check recent deployment logs

### Step 2: Set Required Environment Variables

In Render Dashboard → Your Service → Environment:

#### Required Variables:
```
SECRET_KEY = <generate-a-random-secret-key>
DEBUG = False
USE_SQLITE = False
DB_NAME = <your-postgres-db-name>
DB_USER = <your-postgres-username>
DB_PASSWORD = <your-postgres-password>
DB_HOST = <your-postgres-host>
DB_PORT = 5432
```

To generate a SECRET_KEY:
```python
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

#### Optional but Recommended:
```
LOG_LEVEL = INFO
EMAIL = your-email@gmail.com
EMAIL_PASSWORD = your-app-password
RENDER_EXTERNAL_HOSTNAME = cleverdining-2.onrender.com
```

### Step 3: Deploy New Code

1. Push the updated code to your repository
2. Render will auto-deploy, or manually trigger deployment
3. Wait for deployment to complete

### Step 4: Run Migrations

After deployment, go to Render → Your Service → Shell and run:
```bash
python manage.py migrate
python manage.py test_database
```

### Step 5: Verify Deployment

1. **Health Check:**
   ```bash
   curl https://cleverdining-2.onrender.com/health/
   ```
   Should return: `{"status": "healthy", ...}`

2. **Test Login:**
   - Go to: https://officialcleverdining.netlify.app
   - Try to login with existing credentials
   - Should work without 500 errors

## Render Service Configuration

### Build Command:
```bash
pip install -r requirements.txt
```

### Start Command:
```bash
bash start.sh
```

OR if `start.sh` doesn't exist:
```bash
python manage.py migrate && python manage.py collectstatic --noinput && daphne -b 0.0.0.0 -p $PORT RESTAURANTS.asgi:application
```

### Environment:
- Python 3.10+ (or your Python version)

### Auto-Deploy:
- Enabled (deploys on git push)

### Health Check Path:
- `/health/`

## Database Setup (PostgreSQL)

### Create PostgreSQL Database on Render:

1. Dashboard → New → PostgreSQL
2. Name: `cleverdining-db`
3. Database: `cleverdining`
4. User: `cleverdining_user`
5. Save credentials

### Connect to Web Service:

In your web service environment variables:
```
DB_HOST = <internal-hostname-from-postgres>
DB_NAME = cleverdining
DB_USER = cleverdining_user
DB_PASSWORD = <password-from-postgres>
DB_PORT = 5432
```

## Troubleshooting

### Issue: Service Won't Start

**Check Logs:**
- Render Dashboard → Logs
- Look for: `ModuleNotFoundError`, `SECRET_KEY`, database errors

**Common Causes:**
1. Missing `SECRET_KEY` environment variable
2. Database not connected
3. Missing dependencies in `requirements.txt`
4. Migrations not run

**Solution:**
1. Add missing environment variables
2. Redeploy service
3. Run migrations in Shell

### Issue: Database Connection Failed

**Symptoms:**
- "OperationalError: could not connect to server"
- "database ... does not exist"

**Solution:**
1. Verify PostgreSQL database is running
2. Check DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
3. Ensure service and database are in same region
4. Use internal hostname (faster & free)

### Issue: 500 Errors After Deployment

**Debug Steps:**
1. Check logs: `Render Dashboard → Logs`
2. Enable DEBUG temporarily: `DEBUG=True`
3. Check health endpoint: `/health/`
4. Run database test: `python manage.py test_database`
5. Check migrations: `python manage.py showmigrations`

### Issue: Static Files Not Loading

**Check:**
1. `python manage.py collectstatic` runs in `start.sh`
2. `STATIC_ROOT` is set in settings.py
3. WhiteNoise is in `MIDDLEWARE`

## Manual Deployment Steps

If auto-deploy isn't working:

### 1. Access Shell
Render Dashboard → Your Service → Shell

### 2. Pull Latest Code
```bash
cd /opt/render/project/src
git pull origin main
```

### 3. Install Dependencies
```bash
pip install -r backend_source_code/Restaurants/requirements.txt
```

### 4. Run Migrations
```bash
cd backend_source_code/Restaurants
python manage.py migrate
```

### 5. Collect Static Files
```bash
python manage.py collectstatic --noinput
```

### 6. Restart Service
Render Dashboard → Manual Deploy → Deploy latest commit

## Monitoring

### Health Check
Set up automatic health checks:
- Render Dashboard → Your Service → Settings
- Health Check Path: `/health/`
- This will auto-restart if service is down

### Logs
View real-time logs:
```bash
# In Render Dashboard → Logs
# Filter by:
# - ERROR
# - CRITICAL
# - Login attempt
```

### Metrics
Monitor:
- Response time
- Error rate
- Database connection pool
- Memory usage

## Rollback Plan

If new deployment breaks:

1. **Immediate:** Render Dashboard → Rollback to previous deploy
2. **Fix:** Review logs, fix code, redeploy
3. **Test:** Always test in staging first

## Staging Environment (Recommended)

Create a staging service:
1. Duplicate main service
2. Use separate database
3. Different URL: `cleverdining-staging.onrender.com`
4. Test all changes here first
5. Deploy to production when verified

## Support & Resources

- **Render Docs:** https://render.com/docs
- **Django Deployment:** https://docs.djangoproject.com/en/stable/howto/deployment/
- **Backend Logs:** Render Dashboard → Your Service → Logs
- **Health Check:** https://cleverdining-2.onrender.com/health/

## Post-Deployment Verification

After every deployment, verify:

1. ✓ Health check returns 200
2. ✓ Login works
3. ✓ Owner registration works
4. ✓ Database queries work
5. ✓ No 500 errors in logs
6. ✓ Static files load
7. ✓ WebSocket connections work (optional)

## Environment Variables Checklist

Copy this to Render Dashboard → Environment:

```
# Django Core
☐ SECRET_KEY
☐ DEBUG
☐ ALLOWED_HOSTS (auto from RENDER_EXTERNAL_HOSTNAME)

# Database
☐ USE_SQLITE
☐ DB_NAME
☐ DB_USER
☐ DB_PASSWORD
☐ DB_HOST
☐ DB_PORT

# Email (Optional)
☐ EMAIL
☐ EMAIL_PASSWORD

# Monitoring
☐ LOG_LEVEL

# Render
☐ RENDER_EXTERNAL_HOSTNAME

# Payment (Optional)
☐ STRIPE_SECRET_KEY
☐ STRIPE_PUBLISHABLE_KEY
☐ STRIPE_WEBHOOK_SECRET

# Other (Optional)
☐ REDIS_HOST
☐ VAPI_API
```

