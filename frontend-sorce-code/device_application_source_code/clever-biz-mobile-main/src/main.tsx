import { createRoot } from "react-dom/client";
import App from "./routes.tsx";
import { BrowserRouter } from "react-router-dom";
import "./main.css";
import { Toaster } from "react-hot-toast";
import { WebSocketProvider } from "./components/WebSocketContext.tsx";
import SocketProvider from "./components/SocketContext.tsx";


createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
  <SocketProvider>
    <WebSocketProvider>
      <App />
    </WebSocketProvider>
    <Toaster />
  </SocketProvider>
  </BrowserRouter>
);
