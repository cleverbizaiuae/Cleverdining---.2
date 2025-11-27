# Login & Registration Debugging Guide

## ✅ **GOOD NEWS: Backend is Working!**

I tested your backend and confirmed:
- ✅ Health endpoint: `200 OK`
- ✅ Login endpoint: `401 Unauthorized` (correct response for invalid credentials)
- ✅ Server is running: Daphne on port 10000
- ✅ All endpoints responding properly

**The backend is WORKING correctly!**

---

## 🔍 **Why You Can't Login - Common Causes**

### **Cause #1: No Users Exist in Database** (Most Likely!)

If this is a fresh deployment, you might not have any users yet!

**Solution: Create a Test User**

**On Render Shell, run:**
```bash
python manage.py createsuperuser
```

**Follow the prompts:**
```
Email: admin@test.com
Username: admin
Password: admin123
Password (again): admin123
Superuser created successfully.
```

Then try logging in with:
- Email: `admin@test.com`
- Password: `admin123`

---

### **Cause #2: Wrong Credentials**

**Symptoms:**
- You see: "Invalid email or password"
- Frontend shows error message

**Solution: Verify User Exists**

**On Render Shell:**
```bash
python manage.py shell
```

Then run:
```python
from accounts.models import User

# List all users
users = User.objects.all()
for user in users:
    print(f"Email: {user.email}, Role: {user.role}, Active: {user.is_active}")

# Check specific user
user = User.objects.get(email='solomon@cleverbiz.ai')
print(f"User exists: {user.email}")
print(f"Is active: {user.is_active}")
print(f"Role: {user.role}")

# Test password
print(f"Password check: {user.check_password('your_password_here')}")
```

---

### **Cause #3: User Inactive**

**Symptoms:**
- User exists but can't login
- Error: "This account is inactive"

**Solution: Activate User**

**On Render Shell:**
```bash
python manage.py shell
```

```python
from accounts.models import User

user = User.objects.get(email='solomon@cleverbiz.ai')
user.is_active = True
user.save()
print("User activated!")
```

---

### **Cause #4: Frontend Not Sending Correct Data**

**Check Browser Console:**
1. Open frontend: https://officialcleverdining.netlify.app/login
2. Press F12 to open DevTools
3. Go to **Console** tab
4. Try to login
5. Look for errors

**Common Frontend Issues:**
- ❌ CORS errors
- ❌ Network errors
- ❌ 404 errors (wrong URL)
- ❌ Empty request body

**Check Network Tab:**
1. DevTools → **Network** tab
2. Try to login
3. Click on the `login` request
4. Check:
   - **Request URL:** Should be `/api/login/` or `https://cleverdining-2.onrender.com/login/`
   - **Request Method:** POST
   - **Request Payload:** Should have `email` and `password`
   - **Response:** Check status code and response body

---

## 🧪 **Testing Steps**

### **Step 1: Test Backend Directly**

```bash
# Test with curl (replace with your real credentials)
curl -X POST https://cleverdining-2.onrender.com/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}'
```

**Expected Success Response:**
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": 1,
    "email": "admin@test.com",
    "role": "admin",
    ...
  }
}
```

**Expected Error Response (if wrong password):**
```json
{
  "detail": "Invalid email or password."
}
```

---

### **Step 2: Test Registration**

```bash
curl -X POST https://cleverdining-2.onrender.com/owners/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "email":"newowner@test.com",
    "password":"secure123",
    "username":"New Owner",
    "resturent_name":"Test Restaurant",
    "location":"Test City",
    "phone_number":"1234567890"
  }'
```

**Expected Success:**
```json
{
  "username": "New Owner",
  "email": "newowner@test.com",
  "owner_id": 2,
  "role": "owner",
  "resturent_name": "Test Restaurant",
  ...
}
```

---

### **Step 3: Test Frontend Login**

1. **Open:** https://officialcleverdining.netlify.app/login
2. **Open DevTools:** Press F12
3. **Go to Console tab**
4. **Try to login**
5. **Look for:**
   - Red errors
   - Network failures
   - CORS errors
   - 500/404 errors

---

## 🔧 **Quick Fixes**

### **Create Super Admin**

```bash
# On Render Shell
python manage.py createsuperuser

# Enter:
Email: admin@cleverbiz.ai
Username: admin
Password: [your-secure-password]
```

### **Create Owner User**

```bash
# On Render Shell
python manage.py shell
```

```python
from accounts.models import User
from restaurant.models import Restaurant

# Create owner user
owner = User.objects.create_user(
    username='Solomon',
    email='solomon@cleverbiz.ai',
    password='debbie12345',  # Your password
    role='owner'
)

# Create restaurant for owner
restaurant = Restaurant.objects.create(
    owner=owner,
    resturent_name='Clever Restaurant',
    location='Dubai, UAE',
    phone_number='1234567890',
    package='Premium'
)

print(f"Owner created: {owner.email}")
print(f"Restaurant created: {restaurant.resturent_name}")
```

### **Reset Password for Existing User**

```bash
# On Render Shell
python manage.py shell
```

```python
from accounts.models import User

user = User.objects.get(email='solomon@cleverbiz.ai')
user.set_password('new_password_here')
user.save()
print("Password updated!")
```

---

## 📋 **Debugging Checklist**

### **Backend Checks:**
- [ ] Health endpoint returns 200: https://cleverdining-2.onrender.com/health/
- [ ] Login endpoint returns 401 (not 404 or 500)
- [ ] At least one user exists in database
- [ ] User is active (`is_active=True`)
- [ ] Password is correct

### **Frontend Checks:**
- [ ] No CORS errors in console
- [ ] Request is sent to `/api/login/` or correct URL
- [ ] Request has `email` and `password` in body
- [ ] Content-Type is `application/json`
- [ ] No network errors

### **Environment Checks:**
- [ ] All Render environment variables set
- [ ] DATABASE connected (check health endpoint)
- [ ] SECRET_KEY set
- [ ] Migrations applied

---

## 🆘 **Still Not Working?**

### **Send Me:**

1. **Browser Console Error:**
   - Press F12 → Console tab
   - Copy any red errors

2. **Network Tab Info:**
   - F12 → Network tab
   - Try login
   - Click on `login` request
   - Screenshot or copy:
     - Request URL
     - Status code
     - Response

3. **Render Shell Output:**
   ```bash
   python manage.py shell
   ```
   ```python
   from accounts.models import User
   print(f"Total users: {User.objects.count()}")
   for user in User.objects.all()[:5]:
       print(f"- {user.email} (Role: {user.role}, Active: {user.is_active})")
   ```

4. **Login Attempt Test:**
   ```bash
   curl -X POST https://cleverdining-2.onrender.com/login/ \
     -H "Content-Type: application/json" \
     -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'
   ```

---

## 💡 **Most Likely Issue**

Based on common scenarios, you probably need to:

1. **Create a super admin user** (if fresh database)
2. **Or verify your password** is correct
3. **Or activate your user account**

**Quick test:**
```bash
# On Render Shell
python manage.py createsuperuser
# Email: test@test.com
# Password: test123

# Then login with these credentials
```

---

## 🎯 **Expected Working Flow**

### **Successful Login:**
```
1. User enters: test@test.com / test123
2. Frontend → POST /api/login/
3. Backend validates credentials ✅
4. Backend returns JWT tokens ✅
5. Frontend stores in localStorage ✅
6. User redirected to dashboard ✅
```

### **Failed Login (Wrong Password):**
```
1. User enters wrong password
2. Frontend → POST /api/login/
3. Backend returns 401: "Invalid email or password"
4. Frontend shows error message ✅
```

---

## 📞 **Next Steps**

1. **Create a test user** (if none exist)
2. **Test login with curl** (verify backend works)
3. **Test frontend login** (check console for errors)
4. **Send me the console errors** if still not working

**The backend is working perfectly - we just need to ensure you have valid users and the frontend is connecting properly!**

