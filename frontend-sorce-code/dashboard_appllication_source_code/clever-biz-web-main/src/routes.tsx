import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";

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
const ScreenForgotPassword = lazy(() => import("./pages/authentication/screen_forgot_password"));
const ScreenResetPassword = lazy(() => import("./pages/authentication/screen_reset_password"));
const ScreenPrivacy = lazy(() => import("./pages/authentication/screen_privacy"));
const ScreenTermsCondition = lazy(() => import("./pages/authentication/screen_terms"));

// Layouts
const AuthLayout = lazy(() => import("./pages/authentication/layout"));
const RestaurantRuntime = lazy(() => import("./pages/restaurant/RestaurantRuntime"));

// Restaurant pages
const ScreenRestaurantDashboard = lazy(() => import("./pages/restaurant/screen_restaurant_dashboard"));
const ScreenRestaurantOrderList = lazy(() => import("./pages/restaurant/screen_restaurant_order_list"));
const ScreenRestaurantReservations = lazy(() => import("./pages/restaurant/screen_restaurant_reservations"));
const ScreenRestaurantChat = lazy(() => import("./pages/restaurant/screen_restaurant_chat"));
const ScreenRestaurantManagement = lazy(() => import("./pages/restaurant/screen_restaurant_management"));
const ScreenRestaurantDevices = lazy(() => import("./pages/restaurant/screen_restaurant_devices").then(m => ({ default: m.ScreenRestaurantDevices })));
const Payments = lazy(() => import("./pages/restaurant/Payments").then(m => ({ default: m.Payments })));
const ScreenRestaurantReviews = lazy(() => import("./pages/restaurant/screen_restaurant_reviews"));
const ScreenRestaurantUpsell = lazy(() => import("./pages/restaurant/screen_restaurant_upsell"));
const ScreenRestaurantLeads = lazy(() => import("./pages/restaurant/screen_restaurant_leads"));

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
const ScreenSuperAdminCrm = lazy(() => import("./pages/super-admin/ScreenSuperAdminCrm"));
const ScreenSuperAdminMultiLocation = lazy(() => import("./pages/super-admin/ScreenSuperAdminMultiLocation"));
const ScreenSuperAdminIntegrations = lazy(() => import("./pages/super-admin/ScreenSuperAdminIntegrations"));

// Admin pages
const AdminRuntime = lazy(() => import("./pages/super-admin/AdminRuntime"));
const ScreenAdminDashboard = lazy(() => import("./pages/super-admin/screen_admin_dashboard"));
const ScreenAdminManagement = lazy(() => import("./pages/super-admin/screen_admin_management"));
const ScreenAdminTermsAndCondition = lazy(() => import("./pages/super-admin/screen_admin_terms"));
const ScreenAdminPrivacy = lazy(() => import("./pages/super-admin/screen_admin_privacy"));
const ScreenAdminFaq = lazy(() => import("./pages/super-admin/screen_admin_faq"));

// Multi-location owner pages
const MultiLocationLayout = lazy(() => import("./pages/multilocation/layout"));
const ScreenMultiLocationDashboard = lazy(() => import("./pages/multilocation/screen_multilocation_dashboard"));
const ScreenMultiLocationReports = lazy(() => import("./pages/multilocation/screen_multilocation_reports"));
const ScreenMultiLocationLocations = lazy(() => import("./pages/multilocation/screen_multilocation_locations"));
const ScreenMultiLocationLocationDetail = lazy(
  () => import("./pages/multilocation/screen_multilocation_location_detail")
);
const ScreenMultiLocationStaff = lazy(() => import("./pages/multilocation/screen_multilocation_staff"));
const ScreenMultiLocationActivity = lazy(() => import("./pages/multilocation/screen_multilocation_activity"));
const ScreenMultiLocationBranding = lazy(() => import("./pages/multilocation/screen_multilocation_branding"));

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
        <Route path="crm" element={<ScreenSuperAdminCrm />} />
        <Route path="multi-location" element={<ScreenSuperAdminMultiLocation />} />
        <Route path="integrations" element={<ScreenSuperAdminIntegrations />} />
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
      <Route path="admin-login" element={
        <Suspense fallback={<PageLoader />}>
          <ScreenAdminLogin />
        </Suspense>
      } />
      <Route path="forgot-password" element={
        <Suspense fallback={<PageLoader />}>
          <ScreenForgotPassword />
        </Suspense>
      } />
      <Route path="reset-password" element={
        <Suspense fallback={<PageLoader />}>
          <ScreenResetPassword />
        </Suspense>
      } />

      {/* Entry screens */}
      <Route element={
        <Suspense fallback={<PageLoader />}>
          <AuthLayout />
        </Suspense>
      }>
        <Route path="verify-email" element={<ScreenEmailVerification />} />
        <Route path="create-password" element={<ScreenPassword />} />
        <Route path="verify-otp" element={<ScreenOtpVerification />} />
        <Route path="privacy-policy" element={<ScreenPrivacy />} />
        <Route path="terms-condition" element={<ScreenTermsCondition />} />
      </Route>

      {/* Staff screens */}
      <Route path="/staff" element={
        <Suspense fallback={<PageLoader />}>
          <RestaurantRuntime />
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
          <RestaurantRuntime />
        </Suspense>
      }>
        <Route index={true} element={<ScreenChefDashboard />} />
        <Route path="orders" element={<ScreenChefOrderList />} />
        <Route path="messages" element={<ScreenChefChat />} />
      </Route>

      {/* Restaurant screens */}
      <Route path="/restaurant" element={
        <Suspense fallback={<PageLoader />}>
          <RestaurantRuntime />
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
        <Route path="ai-upsell" element={<ScreenRestaurantUpsell />} />
        <Route path="upsell" element={<ScreenRestaurantUpsell />} />
        <Route path="branding" element={<ScreenMultiLocationBranding />} />
        <Route path="crm" element={<Navigate to="/restaurant" replace />} />
        <Route path="leads" element={<ScreenRestaurantLeads />} />
      </Route>

      {/* Manager Dashboard (alias workspace path) */}
      <Route path="/manageradmindashboard" element={
        <Suspense fallback={<PageLoader />}>
          <RestaurantRuntime />
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
        <Route path="ai-upsell" element={<ScreenRestaurantUpsell />} />
        <Route path="upsell" element={<ScreenRestaurantUpsell />} />
        <Route path="branding" element={<ScreenMultiLocationBranding />} />
        <Route path="crm" element={<Navigate to="/manageradmindashboard" replace />} />
        <Route path="leads" element={<ScreenRestaurantLeads />} />
      </Route>

      {/* Legacy admin dashboard alias used by older links/docs */}
      <Route path="/admindashboard" element={
        <Suspense fallback={<PageLoader />}>
          <RestaurantRuntime />
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
        <Route path="ai-upsell" element={<ScreenRestaurantUpsell />} />
        <Route path="upsell" element={<ScreenRestaurantUpsell />} />
        <Route path="branding" element={<ScreenMultiLocationBranding />} />
        <Route path="crm" element={<Navigate to="/admindashboard" replace />} />
        <Route path="leads" element={<ScreenRestaurantLeads />} />
      </Route>

      {/* Staff Dashboard */}
      <Route path="/staffadmindashboard" element={
        <Suspense fallback={<PageLoader />}>
          <RestaurantRuntime />
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
          <RestaurantRuntime />
        </Suspense>
      }>
        <Route index={true} element={<ScreenRestaurantOrderList />} />
        <Route path="orders" element={<ScreenRestaurantOrderList />} />
        <Route path="messages" element={<ScreenRestaurantChat />} />
      </Route>

      {/* Admin screens */}
      <Route path="/admin" element={
        <Suspense fallback={<PageLoader />}>
          <AdminRuntime />
        </Suspense>
      }>
        <Route index={true} element={<ScreenAdminDashboard />} />
        <Route path="management" element={<ScreenAdminManagement />} />
        <Route path="terms-condition" element={<ScreenAdminTermsAndCondition />} />
        <Route path="privacy-policy" element={<ScreenAdminPrivacy />} />
        <Route path="faq" element={<ScreenAdminFaq />} />
      </Route>

      {/* Multi-location owner workspace */}
      <Route path="/multilocation" element={
        <Suspense fallback={<PageLoader />}>
          <MultiLocationLayout />
        </Suspense>
      }>
        <Route index={true} element={<ScreenMultiLocationDashboard />} />
        <Route path="reports" element={<ScreenMultiLocationReports />} />
        <Route path="locations" element={<ScreenMultiLocationLocations />} />
        <Route path="locations/:locationId" element={<ScreenMultiLocationLocationDetail />} />
        <Route path="staff" element={<ScreenMultiLocationStaff />} />
        <Route path="activity" element={<ScreenMultiLocationActivity />} />
        <Route path="branding" element={<ScreenMultiLocationBranding />} />
      </Route>
    </Routes>
  );
}

export default App;
