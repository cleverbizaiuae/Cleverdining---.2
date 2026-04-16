import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useSearchParams, useNavigate, useLocation } from "react-router-dom";

import { PrivateRouteGuard } from "./components/route-guard";
const CancelPage = lazy(() => import("./pages/CancelPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const LayoutDashboard = lazy(() => import("./pages/layout_dashboard"));
const ScreenOrders = lazy(() => import("./pages/order/screen_orders"));
const ScreenCart = lazy(() => import("./pages/screen_cart"));
const ScreenHome = lazy(() => import("./pages/screen_home"));
const ScreenMessage = lazy(() => import("./pages/screen_message"));
const SuccessPage = lazy(() => import("./pages/SuccessPage"));
const NotFoundPage = lazy(() => import("./pages/not-found").then((m) => ({ default: m.NotFoundPage })));
const TableEntry = lazy(() => import("./pages/TableEntry"));
const TableLanding = lazy(() => import("./pages/TableLanding"));
const ScreenScanTable = lazy(() => import("./pages/screen_scan_table"));

const RouteLoader = () => (
  <div className="flex items-center justify-center h-screen text-slate-500">Loading...</div>
);

function App() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only run auto-login/redirect logic if we are at the root path
    if (location.pathname !== "/") {
      return;
    }

    // Fix: QR Code uses 'id' and 'table', not just 'table_id' and 'table_name'
    const tableIdParam = searchParams.get("table_id") || searchParams.get("id");
    const tableNameParam = searchParams.get("table_name") || searchParams.get("table");
    const restaurantIdParam = searchParams.get("restaurant_id");
    const storedUserInfo = localStorage.getItem("userInfo");

    if (tableIdParam && restaurantIdParam) {
      // Case 1: URL params present - redirect to real login flow (TableLanding)
      // PRIORITY: This must happen even if logged in, to ensure Guest Token is generated for the new table.
      const encodedName = encodeURIComponent(tableNameParam || "Table");
      window.location.href = `/login?id=${encodeURIComponent(tableIdParam)}&table=${encodedName}&restaurant_id=${encodeURIComponent(restaurantIdParam)}`;
      return;

    } else if (storedUserInfo) {
      // Case 2: Session already exists (and no new table scan) - redirect to dashboard
      navigate("/dashboard");

    } else {
      // Case 3: No params and no session - Redirect to Scan Table
      // We are at root "/", so just redirect.
      navigate("/scan-table");
    }
  }, [searchParams, navigate, location.pathname]);

  return (
    <Suspense fallback={<RouteLoader />}>
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
      <Route path="/thankyou" element={<SuccessPage />} />
      <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export default App;
