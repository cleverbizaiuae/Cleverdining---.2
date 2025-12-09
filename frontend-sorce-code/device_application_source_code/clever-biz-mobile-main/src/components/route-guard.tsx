import { Navigate } from "react-router-dom";

export const PrivateRouteGuard = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = localStorage.getItem("accessToken");
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
};

export const PublicRouteGuard = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = localStorage.getItem("accessToken");
  return !isAuthenticated ? <>{children}</> : <Navigate to="/dashboard" replace />;
};
