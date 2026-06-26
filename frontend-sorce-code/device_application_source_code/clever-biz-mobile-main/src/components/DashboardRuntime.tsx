import SocketProvider from "./SocketContext";
import { WebSocketProvider } from "./WebSocketContext";
import LayoutDashboard from "../pages/layout_dashboard";

export default function DashboardRuntime() {
  return (
    <SocketProvider>
      <WebSocketProvider>
        <LayoutDashboard />
      </WebSocketProvider>
    </SocketProvider>
  );
}
