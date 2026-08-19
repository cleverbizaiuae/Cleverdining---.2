import { OwnerProvider } from "@/context/ownerContext";
import { StaffProvider } from "@/context/staffContext";
import WebSocketProvider from "@/hooks/WebSocketProvider";
import { Navigate, useLocation } from "react-router";
import RestaurantLayout from "./layout";

const hasUsableAccessToken = () => {
  const token = localStorage.getItem("accessToken");
  if (!token || token === "guest_token") return false;

  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return false;
    const base64Payload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const normalizedPayload = base64Payload.padEnd(Math.ceil(base64Payload.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(normalizedPayload));
    return typeof payload.exp !== "number" || payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

const RestaurantRuntime = () => {
  const location = useLocation();

  if (!hasUsableAccessToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <WebSocketProvider>
      <OwnerProvider>
        <StaffProvider>
          <RestaurantLayout />
        </StaffProvider>
      </OwnerProvider>
    </WebSocketProvider>
  );
};

export default RestaurantRuntime;
