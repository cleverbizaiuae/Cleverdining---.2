import { Navigate } from "react-router";

export const PublicRouteGuard = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const isAuthenticated = localStorage.getItem("accessToken");
  return !isAuthenticated ? children : <Navigate to="/dashboard" />;
};

export const PrivateRouteGuard = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const isAuthenticated = localStorage.getItem("accessToken");
  return isAuthenticated ? children : <Navigate to="/" />;
};
