import { Navigate } from "react-router-dom";

export const PrivateRouteGuard = ({ children }: { children: React.ReactNode }) => {
  const userInfo = localStorage.getItem("userInfo");
  const guestToken = localStorage.getItem("guest_session_token");

  // Strict check: Must have userInfo or guest token to view dashboard
  const isAuthenticated = !!userInfo || !!guestToken;

  return isAuthenticated ? <>{children}</> : <Navigate to="/scan-table" replace />;
};

export const PublicRouteGuard = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = localStorage.getItem("accessToken");
  return !isAuthenticated ? <>{children}</> : <Navigate to="/dashboard" replace />;
};
