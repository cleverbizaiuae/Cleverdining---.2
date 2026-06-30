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

const updateSW = registerSW({
  // Let the first render and initial route data win the network race.
  // The SW still registers after window load and keeps auto-updating.
  immediate: false,
  onNeedRefresh() {
    updateSW(true);
  },
});

if ("caches" in window) {
  window.addEventListener("load", () => {
    caches.delete("dashboard-static-assets").catch(() => undefined);
  });
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
