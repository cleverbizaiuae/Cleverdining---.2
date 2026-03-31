import { createRoot } from "react-dom/client";
import App from "./routes.tsx";
import { BrowserRouter } from "react-router";
import { Provider } from "react-redux";
import { store } from "./store/store";
import "./main.css";
import { Toaster } from "react-hot-toast";
import { OwnerProvider } from "./context/ownerContext.tsx";
import { StaffProvider } from "./context/staffContext.tsx";
import { AdminProvider } from "./context/adminContext.tsx";
import WebSocketProvider from "./hooks/WebSocketProvider.tsx";
import { InstallPrompt } from "./components/InstallPrompt.tsx";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient.ts";
import { registerSW } from "virtual:pwa-register";

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
});

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <BrowserRouter>
          <OwnerProvider>
            <StaffProvider>
              <AdminProvider>
                <App />
                <Toaster />
                <InstallPrompt />
              </AdminProvider>
            </StaffProvider>
          </OwnerProvider>
        </BrowserRouter>
      </WebSocketProvider>
    </QueryClientProvider>
  </Provider>
);
