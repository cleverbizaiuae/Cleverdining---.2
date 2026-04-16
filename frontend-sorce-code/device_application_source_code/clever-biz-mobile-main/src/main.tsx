import { createRoot } from "react-dom/client";
import App from "./routes.tsx";
import { BrowserRouter } from "react-router-dom";
import "./main.css";
import { Toaster } from "react-hot-toast";
import { WebSocketProvider } from "./components/WebSocketContext.tsx";
import SocketProvider from "./components/SocketContext.tsx";
import { initSentry } from "./monitoring/sentry.ts";

// --- PWA Service Worker Lifecycle ---
declare const __BUILD_VERSION__: string;
const BUILD_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev';

// Build version cache invalidation
const STORED_VERSION_KEY = 'cleverdining_build_version';
const storedVersion = localStorage.getItem(STORED_VERSION_KEY);

if (storedVersion && storedVersion !== BUILD_VERSION) {
  console.log(`[PWA] Build version changed: ${storedVersion} → ${BUILD_VERSION}. Clearing caches.`);
  // Clear all caches on version mismatch
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(key => caches.delete(key));
    });
  }
}
localStorage.setItem(STORED_VERSION_KEY, BUILD_VERSION);

// Service Worker update handler
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    // Check for updates periodically without spamming network.
    setInterval(() => {
      if (navigator.onLine) {
        registration.update();
      }
    }, 15 * 60 * 1000);

    // Listen for new service worker
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          console.log('[PWA] New service worker activated, reloading...');
          // Only reload if not the first install
          if (registration.active) {
            window.location.reload();
          }
        }
      });
    });
  });

  // Handle controller change (when new SW takes over)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[PWA] Controller changed, new SW in control');
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
initSentry();

root.render(
  <BrowserRouter>
    <SocketProvider>
      <WebSocketProvider>
        <App />
      </WebSocketProvider>
      <Toaster />
    </SocketProvider>
  </BrowserRouter>
);

// Signal to recovery UI that app has mounted successfully
if (typeof (window as any).__cancelAppRecovery === 'function') {
  (window as any).__cancelAppRecovery();
}
