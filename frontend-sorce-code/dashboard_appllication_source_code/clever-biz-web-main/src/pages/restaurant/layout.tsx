import { useState } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router';
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  MessageSquare,
  Users,
  Wallet,
  Star,
  LogOut,
  Menu,
  X,
  LayoutGrid,
  ScanQrCode // Replacing QrCode if needed, checking lucide later, QrCode usually exists.
} from 'lucide-react';
import toast from 'react-hot-toast';

// Assets
import mobileLogo from "../../assets/mobile_logo.png";
// import bgAuth from "../../assets/bg-auth.webp"; // Not used here based on specs

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  matchType: 'exact' | 'startsWith';
};

const MENU_ITEMS: MenuItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/restaurant', matchType: 'exact' },
  { icon: ClipboardList, label: 'OrderList', path: '/restaurant/orders', matchType: 'startsWith' },
  { icon: CalendarDays, label: 'Reservation', path: '/restaurant/reservations', matchType: 'startsWith' },
  { icon: MessageSquare, label: 'Messages', path: '/restaurant/messages', matchType: 'startsWith' },
  { icon: Users, label: 'Management', path: '/restaurant/management', matchType: 'startsWith' },
  { icon: ScanQrCode, label: 'Tables', path: '/restaurant/devices', matchType: 'startsWith' }, // Mapped 'Tables' to '/restaurant/devices' as per previous context
  { icon: Wallet, label: 'Payments', path: '/restaurant/payments', matchType: 'startsWith' },
  { icon: Star, label: 'Reviews', path: '/restaurant/reviews', matchType: 'startsWith' },
];

const RestaurantLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Get User Info
  const userStr = localStorage.getItem("userInfo");
  const user = userStr ? JSON.parse(userStr) : { username: "Manager", role: "manager" };

  const handleLogout = () => {
    localStorage.clear();
    toast.success("Logged out successfully");
    navigate('/adminlogin');
  };

  const isActive = (item: MenuItem) => {
    if (item.matchType === 'exact') {
      return location.pathname === item.path;
    }
    return location.pathname.startsWith(item.path);
  };

  const getPageTitle = () => {
    const currentItem = MENU_ITEMS.find(item => isActive(item));
    return currentItem ? currentItem.label : "Dashboard";
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-inter">

      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 shadow-xl transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Logo Section */}
        <div className="h-20 flex items-center px-6 border-b border-slate-100">
          <img src={mobileLogo} alt="CleverBiz" className="h-8 w-auto" />
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-slate-400 hover:text-slate-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Navigation */}
        <div className="p-4 space-y-2 overflow-y-auto h-[calc(100vh-160px)]">
          {MENU_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)} // Close on mobile click
                className={`
                   flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
                   ${active
                    ? "bg-[#0055FE] text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-500 hover:bg-slate-50 hover:text-[#0055FE] group"
                  }
                 `}
              >
                <item.icon
                  size={20}
                  className={`${active ? "text-white" : "text-slate-400 group-hover:text-[#0055FE]"}`}
                />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Logout Section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-100 bg-white">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-500 transition-colors duration-200"
          >
            <LogOut size={20} />
            <span className="text-sm font-medium">Log Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64 transition-all duration-300">

        {/* HEADER */}
        <header className="sticky top-0 z-30 h-20 bg-white border-b border-slate-200 shadow-sm px-4 sm:px-8 flex items-center justify-between">

          {/* Left: Title & Hamburger */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-slate-500 hover:text-[#0055FE] transition-colors"
            >
              <Menu size={24} />
            </button>

            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-slate-900">{getPageTitle()}</h1>
              <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Right: Profile */}
          <div className="flex items-center gap-4 h-full">
            <div className="hidden sm:flex flex-col items-end pr-4 border-r border-slate-200 h-10 justify-center">
              <p className="text-sm font-bold text-slate-900 leading-tight">Welcome, {user.username}</p>
              <p className="text-xs font-medium text-[#0055FE] uppercase">{user.role}</p>
            </div>

            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0055FE] to-cyan-400 p-[2px]">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                <span className="text-[#0055FE] font-bold text-lg uppercase">{user.username[0]}</span>
              </div>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 bg-slate-50 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <Outlet />
        </main>

        {/* Footer (Optional based on original layout, kept for consistency) */}
        {/* <footer className="bg-slate-50 text-center py-4 text-xs text-slate-400">
          Powered by CleverBiz AI
        </footer> */}
      </div>

    </div>
  );
};

export default RestaurantLayout;
