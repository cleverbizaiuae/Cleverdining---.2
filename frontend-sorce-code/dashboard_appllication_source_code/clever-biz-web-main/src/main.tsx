import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import App from "./routes.tsx";
import { BrowserRouter } from "react-router";
import { Provider } from "react-redux";
import { store } from "./store/store";
import "./main.css";
import { Toaster } from "react-hot-toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient.ts";
import { registerSW } from "virtual:pwa-register";
import { initSentry } from "./monitoring/sentry.ts";

const InstallPrompt = lazy(() =>
  import("./components/InstallPrompt.tsx").then((module) => ({ default: module.InstallPrompt })),
);

const PWA_UPDATE_INTERVAL_MS = 15 * 60 * 1000;
let serviceWorkerRegistration: ServiceWorkerRegistration | undefined;

const checkForPwaUpdate = () => {
  if (
    !serviceWorkerRegistration ||
    !navigator.onLine ||
    document.visibilityState === "hidden"
  ) {
    return;
  }

  void serviceWorkerRegistration.update().catch(() => undefined);
};

registerSW({
  // Installed iOS and Android dashboards can stay open for hours. Register
  // immediately, then recheck whenever the app returns to the foreground.
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    serviceWorkerRegistration = registration;
    checkForPwaUpdate();
  },
});

if ("serviceWorker" in navigator) {
  window.addEventListener("online", checkForPwaUpdate);
  window.addEventListener("pageshow", checkForPwaUpdate);
  document.addEventListener("visibilitychange", checkForPwaUpdate);
  window.setInterval(checkForPwaUpdate, PWA_UPDATE_INTERVAL_MS);
}

initSentry();

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster />
        <Suspense fallback={null}>
          <InstallPrompt />
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </Provider>
);
