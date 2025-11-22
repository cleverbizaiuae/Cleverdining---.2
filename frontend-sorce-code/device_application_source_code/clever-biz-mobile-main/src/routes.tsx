import { Route, Routes } from "react-router";

import CancelPage from "./pages/CancelPage";
import CheckoutPage from "./pages/CheckoutPage";
import LayoutDashboard from "./pages/layout_dashboard";
import ScreenOrders from "./pages/order/screen_orders";
import ScreenCart from "./pages/screen_cart";
import ScreenHome from "./pages/screen_home";
import ScreenLogin from "./pages/screen_login";
import ScreenMessage from "./pages/screen_message";
import SuccessPage from "./pages/SuccessPage";
// import { PrivateRouteGuard } from "./components/route-guard";
import { NotFoundPage } from "./pages/not-found";

function App() {
  return (
    <Routes>
      <Route path="/" element={<ScreenLogin />} />
      <Route path="/dashboard" element={<LayoutDashboard />}>
        {/* <Route index={true} element={<ScreenLogin />} /> */}
        <Route index={true} element={<ScreenHome />} />
        <Route path="message" element={<ScreenMessage />} />
        <Route path="cart" element={<ScreenCart />} />
        <Route path="orders" element={<ScreenOrders />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="success" element={<SuccessPage />} />
        <Route path="cancel" element={<CancelPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
