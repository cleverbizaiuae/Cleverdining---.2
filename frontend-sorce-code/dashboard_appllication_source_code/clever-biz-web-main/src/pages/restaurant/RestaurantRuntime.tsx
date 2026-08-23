import { OwnerProvider } from "@/context/ownerContext";
import { StaffProvider } from "@/context/staffContext";
import WebSocketProvider from "@/hooks/WebSocketProvider";
import { Navigate, useLocation } from "react-router";
import RestaurantLayout from "./layout";

type RestaurantRole = "owner" | "manager" | "staff" | "chef";

const normalizeRestaurantRole = (value: unknown): RestaurantRole | "" => {
  const role = String(value || "").trim().toLowerCase();
  if (role === "owner" || role === "manager" || role === "staff" || role === "chef") {
    return role;
  }
  return "";
};

const getStoredRestaurantRole = (): RestaurantRole | "" => {
  try {
    const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
    return normalizeRestaurantRole(
      userInfo?.user?.role || userInfo?.role || localStorage.getItem("role"),
    );
  } catch {
    return normalizeRestaurantRole(localStorage.getItem("role"));
  }
};

export const canAccessRestaurantPath = (pathname: string, role: RestaurantRole | ""): boolean => {
  if (!role) return false;

  const prefix = [
    "/manageradmindashboard",
    "/staffadmindashboard",
    "/chefadmindashboard",
    "/admindashboard",
    "/restaurant",
    "/staff",
    "/chef",
  ].find((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
  if (!prefix) return false;

  const segment = pathname.slice(prefix.length).split("/").filter(Boolean)[0] || "";
  if (!segment) {
    if (prefix.includes("staff")) return role === "staff";
    if (prefix.includes("chef")) return role === "chef";
    return role === "owner" || role === "manager";
  }

  const allowedRolesBySegment: Record<string, RestaurantRole[]> = {
    orders: ["owner", "manager", "staff", "chef"],
    reservations: ["owner", "manager", "staff"],
    messages: ["owner", "manager", "staff", "chef"],
    reviews: ["owner", "manager", "staff"],
    management: ["owner", "manager"],
    devices: ["owner", "manager"],
    payments: ["owner", "manager"],
    "ai-upsell": ["owner", "manager"],
    upsell: ["owner", "manager"],
    branding: ["owner", "manager"],
    leads: ["owner", "manager"],
  };
  return Boolean(allowedRolesBySegment[segment]?.includes(role));
};

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

  const role = getStoredRestaurantRole();
  if (!canAccessRestaurantPath(location.pathname, role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section role="alert" className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-bold uppercase tracking-wider text-red-500">403 · Access Denied</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">You do not have permission to view this page.</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Sign in with an authorized account or return to the dashboard assigned to your role.
          </p>
        </section>
      </main>
    );
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
