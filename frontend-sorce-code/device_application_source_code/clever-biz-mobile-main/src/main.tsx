import { createRoot } from "react-dom/client";
import App from "./routes.tsx";
import { BrowserRouter } from "react-router-dom";
import "./main.css";
import { Toaster } from "react-hot-toast";
import { initSentry } from "./monitoring/sentry.ts";
import { preloadCachedBrandAssets } from "./lib/useBrandConfig.ts";

// VitePWA handles activation. Check for updates in the background without
// clearing immutable caches or forcing a visible cold-start reload.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    setInterval(() => {
      if (navigator.onLine) registration.update();
    }, 15 * 60 * 1000);
  });
}

// --- PWA App Badge (for installed PWA icon) ---
function updateAppBadge(count: number) {
  try {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  } catch (e) {
    // Gracefully fail if not supported
  }
}

// Export for use in other components
(window as any).__updateAppBadge = updateAppBadge;

// --- Render App ---
const root = createRoot(document.getElementById("root")!);
preloadCachedBrandAssets();

root.render(
  <BrowserRouter>
    <App />
    <Toaster />
  </BrowserRouter>
);

const runAfterStartup = () => initSentry();
if (typeof window.requestIdleCallback === "function") {
  window.requestIdleCallback(runAfterStartup, { timeout: 2000 });
} else {
  globalThis.setTimeout(runAfterStartup, 0);
}

// Signal to recovery UI that app has mounted successfully
if (typeof (window as any).__cancelAppRecovery === 'function') {
  (window as any).__cancelAppRecovery();
}
