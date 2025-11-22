import { StaffSidebar } from "../../components/sidebar";
import useLocalStorage from "../../hooks/useLocalStorage";
import { Header } from "../../components/utilities";
import { Outlet } from "react-router";

const StaffLayout = () => {
  const [sidebarOpen, setDrawerOpen] = useLocalStorage("staff_sidebar", false);

  const toggleSidebar = () => {
    setDrawerOpen(!sidebarOpen);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <StaffSidebar
        isOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        home="/staff"
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

export default StaffLayout;
