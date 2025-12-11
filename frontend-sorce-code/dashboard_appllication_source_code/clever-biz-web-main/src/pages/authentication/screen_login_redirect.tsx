import { useEffect } from "react";
import { useNavigate } from "react-router";

// This component is DEPRECATED and should not be used.
// It serves as a hard redirect to the new /login page (ScreenAdminLogin).
const ScreenLogin = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Force redirect to the new login route
    navigate("/login", { replace: true });
  }, [navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-white">
      <p className="text-slate-500 animate-pulse">Redirecting to login...</p>
    </div>
  );
};

export default ScreenLogin;
