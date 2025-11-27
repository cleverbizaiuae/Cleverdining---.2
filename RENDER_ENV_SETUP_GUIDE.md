# Render Environment Variables Setup Guide

## 🎯 Step-by-Step Guide to Set Environment Variables on Render

---

## Step 1: Access Render Dashboard

1. Go to: https://dashboard.render.com
2. Log in to your account
3. Click on your backend service (should be named something like "cleverdining-2" or "Cleverdining")

---

## Step 2: Navigate to Environment Variables

1. In your service page, look at the tabs at the top
2. Click on **"Environment"** tab
3. You'll see a list of environment variables (might be empty or have some already)

---

## Step 3: Add Each Environment Variable

Click **"Add Environment Variable"** button for each variable below.

### ✅ **REQUIRED VARIABLES** (Your app won't work without these)

#### 1. SECRET_KEY (CRITICAL!)
```
Key: SECRET_KEY
Value: dMB4D6KKm51EeM9p0BUHb06M6tIRBzqNqiUTPMPK0EZKK_Q1wBj8vE22hePPMc2rwFo
```
**✨ This is a freshly generated secure key for you - copy exactly as shown above**

---

#### 2. DEBUG
```
Key: DEBUG
Value: False
```
**⚠️ Must be False in production**

---

#### 3. USE_SQLITE
```
Key: USE_SQLITE
Value: False
```
**ℹ️ We're using PostgreSQL on Render, not SQLite**

---

### 🗄️ **DATABASE VARIABLES** (REQUIRED)

You need to get these from your Render PostgreSQL database.

#### Where to Find Database Credentials:
1. In Render Dashboard, find your PostgreSQL database service
2. Click on it
3. Scroll down to "Connections" section
4. You'll see: Internal Database URL, Hostname, Port, Database, Username, Password

#### 4. DB_NAME
```
Key: DB_NAME
Value: [Your database name from Render PostgreSQL]
```
Example: `cleverdining` or `cleverdining_db`

---

#### 5. DB_USER
```
Key: DB_USER
Value: [Your database username from Render PostgreSQL]
```
Example: `cleverdining_user`

---

#### 6. DB_PASSWORD
```
Key: DB_PASSWORD
Value: [Your database password from Render PostgreSQL]
```
**⚠️ This is shown when you first create the database - if you lost it, you may need to reset it**

---

#### 7. DB_HOST
```
Key: DB_HOST
Value: [Your database internal hostname from Render PostgreSQL]
```
Example: `dpg-xxxxxxxxxxxxx-a` or similar
**ℹ️ Use the INTERNAL hostname (faster and free), not external**

---

#### 8. DB_PORT
```
Key: DB_PORT
Value: 5432
```
**ℹ️ Standard PostgreSQL port**

---

### 📧 **EMAIL VARIABLES** (Recommended for password reset features)

#### 9. EMAIL
```
Key: EMAIL
Value: [Your Gmail address]
```
Example: `youremail@gmail.com`

---

#### 10. EMAIL_PASSWORD
```
Key: EMAIL_PASSWORD
Value: [Your Gmail App Password]
```

**How to get Gmail App Password:**
1. Go to: https://myaccount.google.com/security
2. Enable 2-Step Verification (if not already enabled)
3. Go to: https://myaccount.google.com/apppasswords
4. Select "Mail" and "Other (Custom name)"
5. Enter "Cleverdining Backend"
6. Click Generate
7. Copy the 16-character password (it will look like: `abcd efgh ijkl mnop`)
8. Remove spaces: `abcdefghijklmnop`
9. Use this as EMAIL_PASSWORD

---

### 🌐 **RENDER-SPECIFIC VARIABLES** (Optional but Recommended)

#### 11. RENDER_EXTERNAL_HOSTNAME
```
Key: RENDER_EXTERNAL_HOSTNAME
Value: [Your Render service URL without https://]
```
Example: `cleverdining-2.onrender.com`

**Where to find:** Look at the URL of your deployed service

---

#### 12. LOG_LEVEL
```
Key: LOG_LEVEL
Value: INFO
```
**ℹ️ Options: DEBUG (most verbose), INFO (recommended), WARNING, ERROR**

---

### 📦 **OPTIONAL VARIABLES** (Only if you're using these services)

#### 13. REDIS_HOST (Optional - for WebSocket channels)
```
Key: REDIS_HOST
Value: [Leave empty for now]
```
**ℹ️ Only needed if you set up Redis for WebSocket scaling**

---

#### 14. STRIPE_PUBLISHABLE_KEY (Optional - for payments)
```
Key: STRIPE_PUBLISHABLE_KEY
Value: pk_test_your_key_here
```
**ℹ️ Only needed if using Stripe payments**

---

#### 15. STRIPE_SECRET_KEY (Optional - for payments)
```
Key: STRIPE_SECRET_KEY
Value: sk_test_your_key_here
```
**ℹ️ Only needed if using Stripe payments**

---

#### 16. STRIPE_WEBHOOK_SECRET (Optional - for payments)
```
Key: STRIPE_WEBHOOK_SECRET
Value: whsec_your_webhook_secret
```
**ℹ️ Only needed if using Stripe webhooks**

---

#### 17. VAPI_API (Optional - for voice assistant)
```
Key: VAPI_API
Value: [Your VAPI API key]
```
**ℹ️ Only needed if using voice assistant features**

---

## 📋 **Quick Checklist**

After adding all variables, you should have AT MINIMUM:

- [x] SECRET_KEY
- [x] DEBUG
- [x] USE_SQLITE
- [x] DB_NAME
- [x] DB_USER
- [x] DB_PASSWORD
- [x] DB_HOST
- [x] DB_PORT
- [x] EMAIL (recommended)
- [x] EMAIL_PASSWORD (recommended)
- [x] LOG_LEVEL (recommended)

---

## 🎬 **What Happens After Adding Variables**

1. **Render will automatically redeploy your service**
2. Wait 3-5 minutes for deployment to complete
3. Check deployment logs for any errors

---

## 🚀 **Next Steps After Setting Variables**

### Step 1: Wait for Deployment
- Render Dashboard → Your Service → "Logs" tab
- Wait until you see "Build successful" or "Live"

### Step 2: Run Migration
1. Go to "Shell" tab
2. Run:
   ```bash
   python manage.py migrate
   ```

### Step 3: Test Health Endpoint
```bash
curl https://your-service-name.onrender.com/health/
```

Should return:
```json
{
  "status": "healthy",
  "database": "connected",
  "total_users": 0
}
```

---

## 🔍 **How to Find Your Database Credentials**

### Method 1: From PostgreSQL Service
1. Render Dashboard → Select your PostgreSQL database
2. Scroll to "Connections" section
3. You'll see:
   ```
   Internal Database URL: postgres://user:password@host:5432/dbname
   
   Or individually:
   Database: cleverdining
   Username: cleverdining_user  
   Password: [shown on creation]
   Internal Hostname: dpg-xxxxx-a
   Port: 5432
   ```

### Method 2: From Internal Database URL
If you have the URL like:
```
postgres://myuser:mypassword@dpg-xxxxx-a:5432/mydb
```

Parse it as:
- DB_USER: `myuser`
- DB_PASSWORD: `mypassword`
- DB_HOST: `dpg-xxxxx-a`
- DB_PORT: `5432`
- DB_NAME: `mydb`

---

## ⚠️ **Common Mistakes to Avoid**

1. **Don't use external database hostname** - Use internal (faster, free)
2. **Don't forget to remove spaces** from Gmail app password
3. **Don't set DEBUG=True** in production
4. **Don't use the same SECRET_KEY** as development
5. **Don't skip running migration** after setting variables

---

## 🆘 **Troubleshooting**

### Issue: "Can't connect to database"
**Solution:** 
- Make sure DB_HOST is the INTERNAL hostname
- Verify DB_PASSWORD is correct
- Check database is in the same region as web service

### Issue: "SECRET_KEY not found"
**Solution:**
- Add SECRET_KEY environment variable
- Use the one generated above: `dMB4D6KKm51EeM9p0BUHb06M6tIRBzqNqiUTPMPK0EZKK_Q1wBj8vE22hePPMc2rwFo`

### Issue: "Email not sending"
**Solution:**
- Use Gmail App Password, not your regular password
- Enable 2-Step Verification on Google account first
- Remove spaces from app password

---

## 📸 **Visual Guide**

```
┌─────────────────────────────────────────┐
│  Render Dashboard                       │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Your Service                    │  │
│  │  ┌────────────────────────────┐  │  │
│  │  │ Overview │ Environment │... │  │  │
│  │  └────────────────────────────┘  │  │
│  │                                  │  │
│  │  Environment Variables           │  │
│  │  ┌────────────────────────────┐  │  │
│  │  │ ➕ Add Environment Variable│  │  │
│  │  └────────────────────────────┘  │  │
│  │                                  │  │
│  │  SECRET_KEY = dMB4D6KKm5...     │  │
│  │  DEBUG = False                   │  │
│  │  DB_NAME = cleverdining          │  │
│  │  ...                             │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## ✅ **Final Verification**

After setting all variables and deploying:

```bash
# 1. Check health
curl https://cleverdining-2.onrender.com/health/

# 2. In Render Shell, test database
python manage.py test_database

# 3. Check migrations
python manage.py showmigrations

# 4. Run migrations if needed
python manage.py migrate
```

---

## 🎉 **You're Done!**

Once all variables are set and migrations are run, your backend is fully configured and ready to handle login, registration, and all other features!

**Need help?** Check the logs in Render Dashboard → Logs tab


