import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { AdminSidebar } from "../../components/sidebar";
import { Header } from "../../components/utilities";
import useLocalStorage from "../../hooks/useLocalStorage";
import { useRole } from "../../hooks/useRole";

const AdminLayout = () => {
  const [sidebarOpen, setDrawerOpen] = useLocalStorage("staff_sidebar", false);
  const navigate = useNavigate();
  const { userRole, isLoading, getDashboardPath } = useRole();

  const toggleSidebar = () => {
    setDrawerOpen(!sidebarOpen);
  };

  useEffect(() => {
    if (isLoading) return;
    if (userRole === "admin") {
      return;
    }
    if (userRole) {
      navigate(getDashboardPath(userRole), { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [getDashboardPath, isLoading, navigate, userRole]);

  if (isLoading || userRole !== "admin") {
    return (
      <div className="flex h-screen items-center justify-center bg-dashboard text-primary-text">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <AdminSidebar
        isOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        home="/admin"
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Content Area */}
        <main className="bg-dashboard flex-1 overflow-auto p-4">
          <Outlet />
        </main>
        <footer className="w-full text-center py-2 text-gray-500 text-sm bg-dashboard">
          Powered By CleverBiz AI
        </footer>
      </div>
    </div>
  );
};

export default AdminLayout;
