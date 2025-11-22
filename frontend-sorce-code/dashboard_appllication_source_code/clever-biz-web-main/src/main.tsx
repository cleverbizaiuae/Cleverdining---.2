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
// import { MsgSocketProvider } from "./hooks/MsgSocketProvider.tsx";

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <WebSocketProvider>
      <BrowserRouter>
        <OwnerProvider>
          <StaffProvider>
            <AdminProvider>
              <App />
              <Toaster />
            </AdminProvider>
          </StaffProvider>
        </OwnerProvider>
      </BrowserRouter>
    </WebSocketProvider>
  </Provider>
);
