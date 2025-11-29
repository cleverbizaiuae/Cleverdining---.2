# 🔍 Complete 500 Error Diagnostic Checklist

## ✅ STEP 0: Identify WHERE the 500 is coming from

### In Browser DevTools → Network Tab:
1. Find the failed `/login/` request
2. Check **Request URL**:
   - `https://officialcleverdining.netlify.app/api/login/` → 500 from **Netlify**
   - `https://cleverdining-2.onrender.com/login/` → 500 from **Render/Django**

3. Check **Response Headers**:
   - HTML error page → Netlify proxy issue
   - JSON error → Django backend issue

---

## 🎯 A. 500 FROM NETLIFY (Most Likely - Your Current Issue)

### A1. ✅ Check Netlify Redirect Configuration

**Current netlify.toml:**
```toml
[[redirects]]
  from = "/api/*"
  to = "https://cleverdining-2.onrender.com/:splat"
  status = 200
  force = true
```

**Verify:**
- [ ] File is in root of deployed folder
- [ ] No typos (`/api*` vs `/api/*`)
- [ ] URL has `https://`
- [ ] Status is `200` (not 301/302)
- [ ] Render URL is correct: `cleverdining-2.onrender.com`

**Test:**
```bash
curl -I https://officialcleverdining.netlify.app/api/health/
# Should redirect to Render and return 200
```

---

### A2. ✅ Check Netlify Build Folder

**Verify:**
- [ ] Netlify is building the correct folder
- [ ] `netlify.toml` is in the folder Netlify builds
- [ ] Not building a different branch/folder

**Check in Netlify Dashboard:**
- Site settings → Build & deploy → Base directory
- Should match where `netlify.toml` is located

---

### A3. ✅ Check if Render is Reachable from Netlify

**Test:**
```bash
# Direct test (we know this works)
curl https://cleverdining-2.onrender.com/login/

# Test through Netlify proxy
curl https://officialcleverdining.netlify.app/api/login/
```

**If direct works but proxy doesn't:**
- Netlify redirect is broken
- OR Render is blocking Netlify's IPs (unlikely)

---

## 🎯 B. 500 FROM RENDER/DJANGO (Less Likely - Backend Works)

### B1. ✅ Check Backend Logs

**In Render Dashboard → Logs:**
- [ ] Look for ERROR/CRITICAL lines when you try login
- [ ] Check for stack traces
- [ ] Verify backend is actually receiving the request

**If no logs appear:**
- Request isn't reaching backend
- Netlify proxy is failing before it gets to Render

---

### B2. ✅ Check Environment Variables

**In Render Dashboard → Environment:**
- [ ] `SECRET_KEY` is set
- [ ] `ALLOWED_HOSTS` includes `cleverdining-2.onrender.com`
- [ ] `DATABASE_URL` is correct
- [ ] `DEBUG=False` in production

---

### B3. ✅ Check Database

**In Render Shell:**
```bash
python manage.py migrate --check
python manage.py check
```

**Verify:**
- [ ] All migrations applied
- [ ] No database connection errors
- [ ] Tables exist

---

## 🎯 C. FRONTEND/AXIOS ISSUES

### C1. ✅ Check baseURL Configuration

**Current setup:**
- `VITE_API_URL = "/api"` (from netlify.toml)
- `baseURL: API_BASE_URL` (which is "/api")

**Problem:**
- `/api` goes through Netlify proxy
- If proxy is broken → 500 error

**Solution Options:**

**Option 1: Direct Backend (Recommended for now)**
```typescript
baseURL: "https://cleverdining-2.onrender.com"
```

**Option 2: Fix Netlify Proxy**
- Keep `/api` but ensure redirect works
- Clear Netlify cache
- Redeploy

---

### C2. ✅ Check Request Headers

**Verify in DevTools → Network:**
- [ ] `Content-Type: application/json`
- [ ] `Accept: application/json`
- [ ] No CORS errors in console

---

### C3. ✅ Check Request Payload

**Verify in DevTools → Network → Payload:**
```json
{
  "email": "admin@cleverbiz.ai",
  "password": "Debbie123"
}
```

**Should match backend expectation:**
- Backend expects `email` (not `username`)
- Backend expects `password`

---

## 🎯 D. EDGE CASES

### D1. ✅ CORS Issues
- Usually shows as CORS error, not 500
- Check browser console for CORS messages

### D2. ✅ HTTPS/Mixed Content
- Check if any HTTP requests mixed with HTTPS
- Should all be HTTPS

### D3. ✅ Rate Limiting
- Check if too many requests
- Usually shows 429, not 500

---

## 🚀 QUICK FIX RECOMMENDATION

Based on your setup, the **fastest fix** is:

### **Change baseURL to direct backend:**

```typescript
// In axios.ts
const API_BASE_URL = "https://cleverdining-2.onrender.com";
```

**Why:**
- ✅ We know direct backend works (curl returns 200)
- ✅ Bypasses Netlify proxy issues
- ✅ Fewer moving parts
- ✅ Faster to test

**Trade-off:**
- ❌ No CORS protection from Netlify
- ❌ Direct exposure of backend URL
- ✅ But backend CORS is already configured

---

## 📋 ACTION PLAN

1. **First:** Check browser console logs (the ones we just added)
   - See what baseURL is actually being used
   - Verify environment variable

2. **Second:** Test Netlify proxy directly
   ```bash
   curl https://officialcleverdining.netlify.app/api/health/
   ```

3. **Third:** If proxy fails, switch to direct backend URL
   - Change `baseURL` to `https://cleverdining-2.onrender.com`
   - Redeploy Netlify
   - Test login

4. **Fourth:** If still failing, check Render logs
   - Look for actual error messages
   - Check if request reaches backend

---

## ✅ VERIFICATION STEPS

After making changes:

1. **Hard refresh browser:** `Cmd+Shift+R`
2. **Open console:** Check the 🔥 logs we added
3. **Try login:** Watch Network tab
4. **Check Render logs:** See if request arrives
5. **Verify response:** Should be 200, not 500

---

## 🎯 MOST LIKELY CAUSE FOR YOU

Based on evidence:
- ✅ Direct backend works (curl returns 200)
- ❌ Netlify proxy returns 500
- ✅ Backend code is correct

**Conclusion:** Netlify proxy redirect is not working correctly.

**Fix:** Change baseURL to direct backend URL.

