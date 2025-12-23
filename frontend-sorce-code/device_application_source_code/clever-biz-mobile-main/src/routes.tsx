import { useEffect } from "react";
import { Route, Routes, useSearchParams, useNavigate, useLocation } from "react-router-dom";

import CancelPage from "./pages/CancelPage";
import CheckoutPage from "./pages/CheckoutPage";
import LayoutDashboard from "./pages/layout_dashboard";
import ScreenOrders from "./pages/order/screen_orders";
import ScreenCart from "./pages/screen_cart";
import ScreenHome from "./pages/screen_home";

import ScreenMessage from "./pages/screen_message";
import SuccessPage from "./pages/SuccessPage";
import { PrivateRouteGuard } from "./components/route-guard";
import { NotFoundPage } from "./pages/not-found";
import TableEntry from "./pages/TableEntry";
import TableLanding from "./pages/TableLanding";
import ScreenScanTable from "./pages/screen_scan_table";

function App() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only run auto-login/redirect logic if we are at the root path
    if (location.pathname !== "/") {
      return;
    }

    const tableIdParam = searchParams.get("table_id");
    const tableNameParam = searchParams.get("table_name");
    const restaurantIdParam = searchParams.get("restaurant_id");
    const storedUserInfo = localStorage.getItem("userInfo");

    if (tableIdParam && restaurantIdParam) {
      // Case 1: URL params present - redirect to real login flow
      // Pass restaurant_id to allow Self-Healing URLs (fallback lookup)
      window.location.href = `/login?id=${tableIdParam}&table=${tableNameParam || 'Table'}&restaurant_id=${restaurantIdParam}`;
      return;

    } else if (storedUserInfo) {
      // Case 2: Session already exists - redirect to dashboard
      navigate("/dashboard");

    } else {
      // Case 3: No params and no session - Redirect to Scan Table
      // Do NOT use hardcoded ID=14 as it may be invalid/deleted.
      // If we are already at scan-table, do nothing.
      if (location.pathname !== "/scan-table" && location.pathname !== "/login") {
        navigate("/scan-table");
      }
    }
  }, [searchParams, navigate, location.pathname]);

  return (
    <Routes>
      <Route path="/" element={<div className="flex items-center justify-center h-screen">Loading...</div>} />
      <Route path="/scan-table" element={<ScreenScanTable />} />
      <Route path="/login" element={<TableLanding />} /> {/* Added for QR Code compatibility */}
      <Route path="/t/:restaurantId/:tableToken" element={<TableLanding />} />

      <Route path="/dashboard" element={
        <PrivateRouteGuard>
          <LayoutDashboard />
        </PrivateRouteGuard>
      }>
        <Route index={true} element={<ScreenHome />} />
        <Route path="message" element={<ScreenMessage />} />
        <Route path="cart" element={<ScreenCart />} />
        <Route path="orders" element={<ScreenOrders />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="success" element={<SuccessPage />} />
        <Route path="cancel" element={<CancelPage />} />
      </Route>

      <Route path="/table/:uuid" element={<TableEntry />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
