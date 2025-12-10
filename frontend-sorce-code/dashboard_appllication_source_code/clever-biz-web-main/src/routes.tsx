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
import Layout from "./pages/authentication/layout";
import ScreenEmailVerification from "./pages/authentication/screen_email_verification";
import ScreenLanding from "./pages/authentication/screen_landing";
import ScreenLogin from "./pages/authentication/screen_login";
import ScreenAdminLogin from "./pages/authentication/screen_admin_login";
import ScreenAdminRegister from "./pages/authentication/screen_admin_register";
import ScreenOtpVerification from "./pages/authentication/screen_otp_verification";
import ScreenPassword from "./pages/authentication/screen_password";
import ScreenPrivacy from "./pages/authentication/screen_privacy";
import ScreenRegister from "./pages/authentication/screen_register";
import ScreenTermsCondition from "./pages/authentication/screen_terms";
import ChefLayout from "./pages/chef/layout";
import ScreenChefChat from "./pages/chef/screen_chef_chat";
import ScreenChefDashboard from "./pages/chef/screen_chef_dashboard";
import ScreenChefOrderList from "./pages/chef/screen_chef_order_list";
import RestaurantLayout from "./pages/restaurant/layout";
import ScreenRestaurantChat from "./pages/restaurant/screen_restaurant_chat";
import ScreenRestaurantDashboard from "./pages/restaurant/screen_restaurant_dashboard";
import { ScreenRestaurantDevices } from "./pages/restaurant/screen_restaurant_devices";
import ScreenRestaurantManagement from "./pages/restaurant/screen_restaurant_management";
import ScreenRestaurantOrderList from "./pages/restaurant/screen_restaurant_order_list";
import ScreenRestaurantReservations from "./pages/restaurant/screen_restaurant_reservations";
// import { RestaurantReservationsWithGraphs } from "./pages/restaurant/screen_restaurant_reservations-with-graphs";
import ScreenRestaurantReviews from "./pages/restaurant/screen_restaurant_reviews";
import { Payments } from "./pages/restaurant/Payments";
import StaffLayout from "./pages/staff/layout";
import ScreenStaffChat from "./pages/staff/screen_staff_chat";
import ScreenStaffDashboard from "./pages/staff/screen_staff_dashboard";
import ScreenStaffOrderList from "./pages/staff/screen_staff_order_list";
import ScreenStaffReservations from "./pages/staff/screen_staff_reservations";
import AdminLayout from "./pages/super-admin/layout";
import ScreenAdminDashboard from "./pages/super-admin/screen_admin_dashboard";
import ScreenAdminFaq from "./pages/super-admin/screen_admin_faq";
import ScreenAdminManagement from "./pages/super-admin/screen_admin_management";
import ScreenAdminPrivacy from "./pages/super-admin/screen_admin_privacy";
import ScreenAdminTermsAndCondition from "./pages/super-admin/screen_admin_terms";

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
      <Route path="/" element={<ScreenLanding />} />
      {/* Entry screens */}
      <Route element={<Layout />}>
        <Route path="login" element={<ScreenAdminLogin />} />
        <Route path="adminlogin" element={<ScreenAdminLogin />} />
        <Route path="user-login" element={<ScreenLogin />} />
        <Route path="adminregister" element={<ScreenAdminRegister />} />
        <Route path="register" element={<ScreenRegister />} />
        <Route path="verify-email" element={<ScreenEmailVerification />} />
        <Route path="create-password" element={<ScreenPassword />} />
        <Route path="verify-otp" element={<ScreenOtpVerification />} />
        <Route path="privacy-policy" element={<ScreenPrivacy />} />
        <Route path="terms-condition" element={<ScreenTermsCondition />} />
      </Route>
      {/* Staff screens */}
      <Route path="/staff" element={<StaffLayout />}>
        <Route index={true} element={<ScreenStaffDashboard />} />
        <Route path="reservations" element={<ScreenStaffReservations />} />
        <Route path="orders" element={<ScreenStaffOrderList />} />
        <Route path="messages" element={<ScreenStaffChat />} />
      </Route>
      {/* Chef screens */}
      <Route path="/chef" element={<ChefLayout />}>
        <Route index={true} element={<ScreenChefDashboard />} />
        <Route path="orders" element={<ScreenChefOrderList />} />
        <Route path="messages" element={<ScreenChefChat />} />
      </Route>
      {/* Restaurant screens */}
      <Route path="/restaurant" element={<RestaurantLayout />}>
        <Route index={true} element={<ScreenRestaurantDashboard />} />
        <Route path="orders" element={<ScreenRestaurantOrderList />} />
        {/* <Route path="reservations" element={<ScreenRestaurantReservations />} /> */}
        <Route
          path="reservations"
          element={<ScreenRestaurantReservations />}
        />
        <Route path="management" element={<ScreenRestaurantManagement />} />
        <Route path="devices" element={<ScreenRestaurantDevices />} />
        <Route path="payments" element={<Payments />} />
        <Route path="reviews" element={<ScreenRestaurantReviews />} />
        <Route path="messages" element={<ScreenRestaurantChat />} />
      </Route>
      {/* Admin screens */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index={true} element={<ScreenAdminDashboard />} />
        <Route path="management" element={<ScreenAdminManagement />} />
        <Route
          path="terms-condition"
          element={<ScreenAdminTermsAndCondition />}
        />
        <Route path="privacy-policy" element={<ScreenAdminPrivacy />} />
        <Route path="faq" element={<ScreenAdminFaq />} />
      </Route>
    </Routes>
  );
}

export default App;
