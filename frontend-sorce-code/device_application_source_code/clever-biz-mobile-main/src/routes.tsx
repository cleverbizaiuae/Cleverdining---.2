import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Route, Routes, useSearchParams, useNavigate, useLocation } from "react-router-dom";

import { PrivateRouteGuard } from "./components/route-guard";
import ScreenSplash from "./pages/screen_splash";
import { ActiveBrandProvider, FONT_PRESETS, getBrandSplashSessionKey, hexToHsl, useBrandConfig } from "./lib/useBrandConfig";
import { loadDashboardRuntime, loadHomeScreen } from "./lib/dashboardPreload";

const CHUNK_RELOAD_KEY = "cb_chunk_reload_attempted";

function lazyWithRecovery<T extends ComponentType>(loader: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const module = await loader();
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return module;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isChunkFailure = /dynamically imported module|module script|ChunkLoadError|Loading chunk/i.test(message);
      if (isChunkFailure && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
        window.location.reload();
        return new Promise<never>(() => undefined);
      }
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      throw error;
    }
  });
}

const CancelPage = lazyWithRecovery(() => import("./pages/CancelPage"));
const CheckoutPage = lazyWithRecovery(() => import("./pages/CheckoutPage"));
const DashboardRuntime = lazyWithRecovery(loadDashboardRuntime);
const ScreenOrders = lazyWithRecovery(() => import("./pages/order/screen_orders"));
const ScreenCart = lazyWithRecovery(() => import("./pages/screen_cart"));
const ScreenHome = lazyWithRecovery(loadHomeScreen);
const ScreenMessage = lazyWithRecovery(() => import("./pages/screen_message"));
const SuccessPage = lazyWithRecovery(() => import("./pages/SuccessPage"));
const NotFoundPage = lazyWithRecovery(() => import("./pages/not-found").then((m) => ({ default: m.NotFoundPage })));
const TableEntry = lazyWithRecovery(() => import("./pages/TableEntry"));
const TableLanding = lazyWithRecovery(() => import("./pages/TableLanding"));
const ScreenScanTable = lazyWithRecovery(() => import("./pages/screen_scan_table"));

const RouteLoader = () => (
  <div className="h-[100dvh] w-full bg-[linear-gradient(160deg,#0055FEdd_0%,#0055FE_100%)]" aria-label="Loading menu" />
);

function DashboardExperience({ restaurantId }: { restaurantId: string | number | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const splashSessionKey = useMemo(() => getBrandSplashSessionKey(restaurantId), [restaurantId]);
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return !sessionStorage.getItem(splashSessionKey);
    } catch {
      return true;
    }
  });

  const completeSplash = useCallback(() => {
    setShowSplash(false);
    if (location.pathname === "/splash") {
      navigate("/dashboard", { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!showSplash && location.pathname === "/splash") {
      navigate("/dashboard", { replace: true });
    }
  }, [location.pathname, navigate, showSplash]);

  return (
    <>
      <Suspense fallback={<RouteLoader />}>
        <DashboardRuntime />
      </Suspense>
      {showSplash ? <ScreenSplash onComplete={completeSplash} sessionKey={splashSessionKey} /> : null}
    </>
  );
}

function resolveStoredRestaurantId() {
  try {
    const parsed = JSON.parse(localStorage.getItem("userInfo") || "{}");
    return (
      parsed?.user?.restaurants?.[0]?.id ||
      parsed?.restaurants?.[0]?.id ||
      parsed?.restaurant?.id ||
      parsed?.restaurant_id ||
      parsed?.restaurantId ||
      localStorage.getItem("restaurantId") ||
      localStorage.getItem("selectedRestaurantId") ||
      localStorage.getItem("restaurant_id") ||
      null
    );
  } catch {
    return localStorage.getItem("restaurant_id");
  }
}

function BrandWrapper({
  children,
  restaurantId,
}: {
  children: ReactNode;
  restaurantId: string | number | null;
}) {
  const brand = useBrandConfig(restaurantId);
  const hasBranding = brand.brandingEnabled;
  const primaryHsl = useMemo(() => hexToHsl(brand.primaryColor || "#0055FE"), [brand.primaryColor]);
  const fontFamily = useMemo(
    () => FONT_PRESETS.find((font) => font.value === brand.fontPreset)?.family || FONT_PRESETS[0].family,
    [brand.fontPreset],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--primary", primaryHsl);
    root.style.setProperty("--brand-primary", brand.primaryColor || "#0055FE");
    if (hasBranding) {
      root.style.setProperty("--font-sans", fontFamily);
      root.style.setProperty("--brand-font-family", fontFamily);
      root.style.setProperty("font-family", fontFamily);
    } else {
      root.style.removeProperty("--font-sans");
      root.style.removeProperty("--brand-font-family");
      root.style.removeProperty("font-family");
    }

    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--brand-primary");
      root.style.removeProperty("--font-sans");
      root.style.removeProperty("--brand-font-family");
      root.style.removeProperty("font-family");
    };
  }, [brand.primaryColor, fontFamily, hasBranding, primaryHsl]);

  return <ActiveBrandProvider brand={brand}>{children}</ActiveBrandProvider>;
}

function App() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const restaurantId = useMemo(
    () => searchParams.get("restaurant_id") || resolveStoredRestaurantId(),
    [searchParams, location.pathname],
  );

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
    const storedGuestToken = localStorage.getItem("guest_session_token");

    if (tableIdParam && restaurantIdParam) {
      // Case 1: URL params present - redirect to real login flow (TableLanding)
      // PRIORITY: This must happen even if logged in, to ensure Guest Token is generated for the new table.
      const encodedName = encodeURIComponent(tableNameParam || "Table");
      window.location.href = `/login?id=${encodeURIComponent(tableIdParam)}&table=${encodedName}&restaurant_id=${encodeURIComponent(restaurantIdParam)}`;
      return;

    } else if (storedUserInfo || storedGuestToken) {
      // Case 2: Session already exists (and no new table scan) - keep the guest in the app.
      navigate("/dashboard", { replace: true });

    } else {
      // Case 3: No params and no session - Redirect to Scan Table
      // We are at root "/", so just redirect.
      navigate("/scan-table");
    }
  }, [searchParams, navigate, location.pathname]);

  return (
    <Suspense fallback={<RouteLoader />}>
      <BrandWrapper restaurantId={restaurantId}>
        <Routes>
      <Route path="/" element={<div className="flex items-center justify-center h-screen">Loading...</div>} />
      <Route path="/scan-table" element={<ScreenScanTable />} />
      <Route path="/login" element={<TableLanding />} /> {/* Added for QR Code compatibility */}
      <Route path="/t/:restaurantId/:tableToken" element={<TableLanding />} />
      <Route element={
        <PrivateRouteGuard>
          <DashboardExperience key={String(restaurantId || "default")} restaurantId={restaurantId} />
        </PrivateRouteGuard>
      }>
        <Route path="/splash" element={<ScreenHome />} />
        <Route path="/dashboard">
        <Route index={true} element={<ScreenHome />} />
        <Route path="message" element={<ScreenMessage />} />
        <Route path="cart" element={<ScreenCart />} />
        <Route path="orders" element={<ScreenOrders />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="success" element={<SuccessPage />} />
        <Route path="cancel" element={<CancelPage />} />
        </Route>
      </Route>

      <Route path="/table/:uuid" element={<TableEntry />} />
      <Route path="/thankyou" element={<SuccessPage />} />
      <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrandWrapper>
    </Suspense>
  );
}

export default App;
