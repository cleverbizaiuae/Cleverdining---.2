import { lazy, Suspense } from "react";
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { Route, Routes } from "react-router";

// ─── Lightweight inline spinner (no external dependency) ────────────────
const PageLoader = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f8fafc" }}>
    <div style={{
      width: 36, height: 36, border: "3px solid #e2e8f0",
      borderTopColor: "#0055FE", borderRadius: "50%",
      animation: "spin .6s linear infinite"
    }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

// ─── Lazy‑loaded page components (code‑split per route) ──────────────
// Auth pages
const ScreenLanding = lazy(() => import("./pages/authentication/screen_landing"));
const ScreenAdminLogin = lazy(() => import("./pages/authentication/screen_admin_login"));
const ScreenAdminRegister = lazy(() => import("./pages/authentication/screen_admin_register"));
const ScreenEmailVerification = lazy(() => import("./pages/authentication/screen_email_verification"));
const ScreenPassword = lazy(() => import("./pages/authentication/screen_password"));
const ScreenOtpVerification = lazy(() => import("./pages/authentication/screen_otp_verification"));
const ScreenPrivacy = lazy(() => import("./pages/authentication/screen_privacy"));
const ScreenTermsCondition = lazy(() => import("./pages/authentication/screen_terms"));

// Layouts (keep these eager – they are small and always needed)
import Layout from "./pages/authentication/layout";
import RestaurantLayout from "./pages/restaurant/layout";

// Restaurant pages
const ScreenRestaurantDashboard = lazy(() => import("./pages/restaurant/screen_restaurant_dashboard"));
const ScreenRestaurantOrderList = lazy(() => import("./pages/restaurant/screen_restaurant_order_list"));
const ScreenRestaurantReservations = lazy(() => import("./pages/restaurant/screen_restaurant_reservations"));
const ScreenRestaurantChat = lazy(() => import("./pages/restaurant/screen_restaurant_chat"));
const ScreenRestaurantManagement = lazy(() => import("./pages/restaurant/screen_restaurant_management"));
const ScreenRestaurantDevices = lazy(() => import("./pages/restaurant/screen_restaurant_devices").then(m => ({ default: m.ScreenRestaurantDevices })));
const Payments = lazy(() => import("./pages/restaurant/Payments").then(m => ({ default: m.Payments })));
const ScreenRestaurantReviews = lazy(() => import("./pages/restaurant/screen_restaurant_reviews"));

// Chef pages
const ScreenChefDashboard = lazy(() => import("./pages/chef/screen_chef_dashboard"));
const ScreenChefOrderList = lazy(() => import("./pages/chef/screen_chef_order_list"));
const ScreenChefChat = lazy(() => import("./pages/chef/screen_chef_chat"));

// Staff pages (mostly reuse restaurant components)
// const ScreenStaffDashboard = lazy(() => import("./pages/staff/screen_staff_dashboard"));
// const ScreenStaffOrderList = lazy(() => import("./pages/staff/screen_staff_order_list"));
// const ScreenStaffReservations = lazy(() => import("./pages/staff/screen_staff_reservations"));
// const ScreenStaffChat = lazy(() => import("./pages/staff/screen_staff_chat"));

// Super Admin pages
const ScreenSuperAdminLogin = lazy(() => import("./pages/super-admin/screen_super_admin_login"));
const SuperAdminLayout = lazy(() => import("./pages/super-admin/SuperAdminLayout"));
const ScreenSuperAdminDashboard = lazy(() => import("./pages/super-admin/ScreenSuperAdminDashboard"));
const ScreenSuperAdminManagement = lazy(() => import("./pages/super-admin/ScreenSuperAdminManagement"));

// Admin pages
const AdminLayout = lazy(() => import("./pages/super-admin/layout").then(m => ({ default: m.default })));
const ScreenAdminDashboard = lazy(() => import("./pages/super-admin/screen_admin_dashboard"));
const ScreenAdminManagement = lazy(() => import("./pages/super-admin/screen_admin_management"));
const ScreenAdminTermsAndCondition = lazy(() => import("./pages/super-admin/screen_admin_terms"));
const ScreenAdminPrivacy = lazy(() => import("./pages/super-admin/screen_admin_privacy"));
const ScreenAdminFaq = lazy(() => import("./pages/super-admin/screen_admin_faq"));

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
  ArcElement
);

function App() {
  return (
    <Routes>
      <Route path="/" element={
        <Suspense fallback={<PageLoader />}>
          <ScreenLanding />
        </Suspense>
      } />
      <Route path="adminlanding" element={
        <Suspense fallback={<PageLoader />}>
          <ScreenLanding />
        </Suspense>
      } />
      <Route path="admin" element={
        <Suspense fallback={<PageLoader />}>
          <ScreenLanding />
        </Suspense>
      } />

      {/* Super Admin Login */}
      <Route path="superadmin/login" element={
        <Suspense fallback={<PageLoader />}>
          <ScreenSuperAdminLogin />
        </Suspense>
      } />

      {/* Super Admin Dashboard */}
      <Route path="/superadmin" element={
        <Suspense fallback={<PageLoader />}>
          <SuperAdminLayout />
        </Suspense>
      }>
        <Route index element={<ScreenSuperAdminDashboard />} />
        <Route path="management" element={<ScreenSuperAdminManagement />} />
        <Route path="register-restaurant" element={<ScreenAdminRegister />} />
      </Route>

      <Route path="login" element={
        <Suspense fallback={<PageLoader />}>
          <ScreenAdminLogin />
        </Suspense>
      } />
      <Route path="adminlogin" element={
        <Suspense fallback={<PageLoader />}>
          <ScreenAdminLogin />
        </Suspense>
      } />

      {/* Entry screens */}
      <Route element={<Layout />}>
        <Route path="verify-email" element={<ScreenEmailVerification />} />
        <Route path="create-password" element={<ScreenPassword />} />
        <Route path="verify-otp" element={<ScreenOtpVerification />} />
        <Route path="privacy-policy" element={<ScreenPrivacy />} />
        <Route path="terms-condition" element={<ScreenTermsCondition />} />
      </Route>

      {/* Staff screens */}
      <Route path="/staff" element={
        <Suspense fallback={<PageLoader />}>
          <RestaurantLayout />
        </Suspense>
      }>
        <Route index={true} element={<ScreenRestaurantDashboard />} />
        <Route path="orders" element={<ScreenRestaurantOrderList />} />
        <Route path="reservations" element={<ScreenRestaurantReservations />} />
        <Route path="messages" element={<ScreenRestaurantChat />} />
        <Route path="management" element={<ScreenRestaurantManagement />} />
        <Route path="devices" element={<ScreenRestaurantDevices />} />
        <Route path="payments" element={<Payments />} />
        <Route path="reviews" element={<ScreenRestaurantReviews />} />
      </Route>

      {/* Chef screens */}
      <Route path="/chef" element={
        <Suspense fallback={<PageLoader />}>
          <RestaurantLayout />
        </Suspense>
      }>
        <Route index={true} element={<ScreenChefDashboard />} />
        <Route path="orders" element={<ScreenChefOrderList />} />
        <Route path="messages" element={<ScreenChefChat />} />
      </Route>

      {/* Restaurant screens */}
      <Route path="/restaurant" element={
        <Suspense fallback={<PageLoader />}>
          <RestaurantLayout />
        </Suspense>
      }>
        <Route index={true} element={<ScreenRestaurantDashboard />} />
        <Route path="orders" element={<ScreenRestaurantOrderList />} />
        <Route path="reservations" element={<ScreenRestaurantReservations />} />
        <Route path="management" element={<ScreenRestaurantManagement />} />
        <Route path="devices" element={<ScreenRestaurantDevices />} />
        <Route path="payments" element={<Payments />} />
        <Route path="reviews" element={<ScreenRestaurantReviews />} />
        <Route path="messages" element={<ScreenRestaurantChat />} />
      </Route>

      {/* Staff Dashboard */}
      <Route path="/staffadmindashboard" element={
        <Suspense fallback={<PageLoader />}>
          <RestaurantLayout />
        </Suspense>
      }>
        <Route index={true} element={<ScreenRestaurantOrderList />} />
        <Route path="orders" element={<ScreenRestaurantOrderList />} />
        <Route path="reservations" element={<ScreenRestaurantReservations />} />
        <Route path="messages" element={<ScreenRestaurantChat />} />
        <Route path="reviews" element={<ScreenRestaurantReviews />} />
      </Route>

      {/* Chef Dashboard */}
      <Route path="/chefadmindashboard" element={
        <Suspense fallback={<PageLoader />}>
          <RestaurantLayout />
        </Suspense>
      }>
        <Route index={true} element={<ScreenRestaurantOrderList />} />
        <Route path="orders" element={<ScreenRestaurantOrderList />} />
        <Route path="messages" element={<ScreenRestaurantChat />} />
      </Route>

      {/* Admin screens */}
      <Route path="/admin" element={
        <Suspense fallback={<PageLoader />}>
          <AdminLayout />
        </Suspense>
      }>
        <Route index={true} element={<ScreenAdminDashboard />} />
        <Route path="management" element={<ScreenAdminManagement />} />
        <Route path="terms-condition" element={<ScreenAdminTermsAndCondition />} />
        <Route path="privacy-policy" element={<ScreenAdminPrivacy />} />
        <Route path="faq" element={<ScreenAdminFaq />} />
      </Route>
    </Routes>
  );
}

export default App;
