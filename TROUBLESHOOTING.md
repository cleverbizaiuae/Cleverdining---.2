# Troubleshooting Guide - Login & Registration Issues

## Overview
This guide addresses the 500 Internal Server Error occurring during login and registration.

## Issues Fixed

### 1. **PasswordResetOTP Model Mismatch** ✅
- **Problem**: Model had `is_verified` field but views checked for `is_used` field
- **Fix**: Added `is_used` field to `PasswordResetOTP` model
- **Migration**: Created `0014_passwordresetotp_is_used.py`

### 2. **Missing SECRET_KEY Fallback** ✅
- **Problem**: Django crashed on startup if `SECRET_KEY` environment variable was missing
- **Fix**: Added fallback value in `settings.py`
- **Location**: `RESTAURANTS/settings.py` line 33

### 3. **Missing Logging Configuration** ✅
- **Problem**: No visibility into backend errors
- **Fix**: Added comprehensive logging configuration
- **Location**: `RESTAURANTS/settings.py` LOGGING section

### 4. **No Health Check Endpoint** ✅
- **Problem**: No way to verify backend is running
- **Fix**: Added `/health/` endpoint
- **Usage**: `GET /health/` or `GET /api/health/` (via proxy)

## Required Environment Variables

Create a `.env` file in `backend_source_code/Restaurants/` with these variables:

```env
# Required
SECRET_KEY=your-secret-key-here
DEBUG=False

# Database (if using PostgreSQL)
USE_SQLITE=False
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=your_db_host
DB_PORT=5432

# Optional but recommended
EMAIL=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
LOG_LEVEL=INFO
```

**For local testing with SQLite:**
```env
SECRET_KEY=test-secret-key-12345
DEBUG=True
USE_SQLITE=True
LOG_LEVEL=DEBUG
```

## Deployment Checklist

### On Render.com:

1. **Set Environment Variables**:
   - Go to Render Dashboard → Your Service → Environment
   - Add all variables from `env.template`
   - **CRITICAL**: Must set `SECRET_KEY`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`

2. **Run Migrations**:
   ```bash
   python manage.py migrate
   ```

3. **Verify Deployment**:
   - Check deploy logs for errors
   - Visit: `https://cleverdining-2.onrender.com/health/`
   - Should return JSON with `"status": "healthy"`

### Frontend Configuration:

The frontend (on Netlify) proxies API requests via `netlify.toml`:
```toml
[[redirects]]
  from = "/api/*"
  to = "https://cleverdining-2.onrender.com/:splat"
  status = 200
  force = true
```

This means:
- Frontend calls: `/api/login/`
- Netlify proxies to: `https://cleverdining-2.onrender.com/login/`

## Testing & Verification

### 1. Test Backend Health
```bash
# Check if backend is responding
curl https://cleverdining-2.onrender.com/health/

# Expected response:
# {
#   "status": "healthy",
#   "service": "Cleverdining Backend API",
#   "database": "connected",
#   "total_users": 10
# }
```

### 2. Test Database Connectivity (SSH into Render)
```bash
python manage.py test_database
```
This will:
- ✓ Test database connection
- ✓ Count users and restaurants
- ✓ Test authentication system
- ✓ Verify password hashing

### 3. Test Login Endpoint
```bash
# Using curl
curl -X POST https://cleverdining-2.onrender.com/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'

# Should return JWT tokens or proper error message (not 500)
```

### 4. Test Owner Registration
```bash
curl -X POST https://cleverdining-2.onrender.com/owners/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "email":"newowner@example.com",
    "password":"secure123",
    "username":"newowner",
    "resturent_name":"Test Restaurant",
    "location":"Test City",
    "phone_number":"1234567890"
  }'
```

## Local Development Setup

### 1. Install Dependencies
```bash
cd backend_source_code/Restaurants
pip install -r requirements.txt
```

### 2. Create .env File
```bash
cp env.template .env
# Edit .env with your values
```

### 3. Run Migrations
```bash
python manage.py migrate
```

### 4. Create Test User
```bash
python manage.py createsuperuser
# Email: admin@test.com
# Password: admin123
```

### 5. Start Server
```bash
# Development (single-threaded)
python manage.py runserver 0.0.0.0:8000

# Production-like (with WebSocket support)
daphne -b 0.0.0.0 -p 8000 RESTAURANTS.asgi:application
```

### 6. Test Locally
```bash
# Health check
curl http://localhost:8000/health/

# Login test
curl -X POST http://localhost:8000/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}'
```

## Common Issues & Solutions

### Issue: 500 Error with Empty Response
**Possible Causes:**
1. Backend not running on Render
2. Missing environment variables
3. Database connection failed
4. Old migrations not applied

**Solution:**
1. Check Render deployment logs
2. Verify all environment variables are set
3. Run migrations: `python manage.py migrate`
4. Check health endpoint: `/health/`

### Issue: "Missing user ID or access token, WebSocket connection won't be established"
**This is a WARNING, not an error.**
- WebSocket connections need authentication
- This warning appears before login (expected)
- Ignore this warning; it doesn't prevent login

### Issue: CORS Errors
**Check:**
1. Frontend URL is in `CORS_ALLOWED_ORIGINS` (settings.py)
2. Backend URL is correct in `netlify.toml`
3. Both use HTTPS in production

### Issue: Email/Password Not Working
**Verify:**
1. User exists in database: `POST /test-user/` with `{"email":"..."}`
2. User is active: Check `is_active` field
3. Password is correct: Try password reset
4. Check backend logs for authentication errors

## Debugging Tips

### 1. Enable Debug Mode (Temporarily)
In Render environment variables:
```
DEBUG=True
LOG_LEVEL=DEBUG
```

### 2. View Logs
```bash
# On Render: Dashboard → Your Service → Logs
# Look for:
# - "Login attempt: <email>"
# - "Password verified for user: <email>"
# - "CRITICAL: Unexpected login error"
```

### 3. Check Database
```bash
# SSH into Render
python manage.py shell

from accounts.models import User
User.objects.count()  # Should show users
User.objects.filter(role='owner').count()  # Count owners
User.objects.get(email='your@email.com')  # Find specific user
```

### 4. Test Frontend → Backend Connection
Open browser console on:
`https://officialcleverdining.netlify.app`

Try:
```javascript
// Test health endpoint
fetch('/api/health/')
  .then(r => r.json())
  .then(console.log)

// Should show backend health status
```

## Contact & Support

If issues persist after following this guide:

1. Check backend health endpoint first
2. Review Render deployment logs
3. Verify all environment variables are set
4. Run database test command
5. Check frontend console for detailed error messages

## Files Changed

- `accounts/models.py` - Added `is_used` field
- `accounts/migrations/0014_passwordresetotp_is_used.py` - Migration
- `RESTAURANTS/settings.py` - Added SECRET_KEY fallback, logging
- `accounts/views.py` - Added HealthCheckView
- `accounts/urls.py` - Added /health/ endpoint
- `accounts/management/commands/test_database.py` - Database test command
- `env.template` - Environment variables template

