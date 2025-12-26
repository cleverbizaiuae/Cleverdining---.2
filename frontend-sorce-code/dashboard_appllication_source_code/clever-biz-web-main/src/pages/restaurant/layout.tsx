import { useState, useContext } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router';
import { WebSocketContext } from '@/hooks/WebSocketProvider';
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
import mobileLogo from "../../assets/cleverbiz_full_logo.png"; // Updated Logo
// import bgAuth from "../../assets/bg-auth.webp"; // Not used here based on specs

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  matchType: 'exact' | 'startsWith';
  roles: string[]; // Added roles property
};

const MENU_ITEMS: MenuItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '', matchType: 'exact', roles: ['manager', 'staff', 'chef'] },
  { icon: ClipboardList, label: 'OrderList', path: '/orders', matchType: 'startsWith', roles: ['manager', 'staff', 'chef'] },
  { icon: CalendarDays, label: 'Reservation', path: '/reservations', matchType: 'startsWith', roles: ['manager', 'staff'] },
  { icon: MessageSquare, label: 'Messages', path: '/messages', matchType: 'startsWith', roles: ['manager', 'staff', 'chef'] },
  { icon: Users, label: 'Management', path: '/management', matchType: 'startsWith', roles: ['manager'] },
  { icon: ScanQrCode, label: 'Tables', path: '/devices', matchType: 'startsWith', roles: ['manager'] },
  { icon: Wallet, label: 'Payments', path: '/payments', matchType: 'startsWith', roles: ['manager'] },
  { icon: Star, label: 'Reviews', path: '/reviews', matchType: 'startsWith', roles: ['manager', 'staff'] },
];

const RestaurantLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { unreadCount } = useContext(WebSocketContext) || {};
  const location = useLocation();
  const navigate = useNavigate();

  // Get User Info
  const userStr = localStorage.getItem("userInfo");
  const user = userStr ? JSON.parse(userStr) : { username: "Manager", role: "manager" };

  // Determine Base Path based on current URL
  const isStaffDashboard = location.pathname.startsWith('/staff');
  const isChefDashboard = location.pathname.startsWith('/chef');

  let basePath = '/restaurant';
  if (isStaffDashboard) basePath = '/staff';
  if (isChefDashboard) basePath = '/chef';

  const handleLogout = () => {
    localStorage.clear();
    toast.success("Logged out successfully");
    navigate('/adminlogin');
  };

  const isActive = (item: MenuItem) => {
    const fullPath = item.path === '' ? basePath : `${basePath}${item.path}`;

    // Explicitly handle root path matching for dashboard/orders
    if (item.path === '' && location.pathname === basePath) return true;

    // For Staff/Chef, default route index is Orders (empty string path in Routes, but mapped to OrderList which has /orders path in MENU).
    // Wait, OrderList path in MENU is '/orders'.
    // In Routes:
    // /staffadmindashboard/ -> ScreenRestaurantOrderList (active)
    // /staffadmindashboard/orders -> ScreenRestaurantOrderList (active?)
    // If I'm at /staffadmindashboard/ (root), isActive for OrderList should be true.
    // Logic removed: previously forced OrderList to be active on root for staff/chef, causing double highlight with Dashboard.
    if ((isStaffDashboard || isChefDashboard) && location.pathname === basePath && item.label === 'OrderList') {
      return false;
    }

    if (item.matchType === 'exact') {
      return location.pathname === fullPath;
    }
    return location.pathname.startsWith(fullPath);
  };

  const getPageTitle = () => {
    // Find active item
    const activeItem = filteredItems.find(item => {
      const fullPath = item.path === '' ? basePath : `${basePath}${item.path}`;
      if (item.path === '' && location.pathname === basePath) return true;
      return location.pathname.startsWith(fullPath) && item.path !== '';
    });

    if (activeItem) return activeItem.label;

    // Fallback for staff/chef index
    if ((isStaffDashboard || isChefDashboard) && location.pathname === basePath) return "OrderList";

    return "Dashboard";
  };

  // Filter items based on role
  let currentRole = user.role || 'staff';

  // Only override if we are sure (Fallback safety, but user.role is better source of truth)
  // If user is logged in as 'manager', currentRole is 'manager'.
  // If user is 'staff', currentRole is 'staff'.

  // Ensure 'manager' can see manager items even on /staff route
  // The previous logic forced 'staff' role based on URL, blocking sidebar items.
  // Now we trust the token/localStorage.

  const filteredItems = MENU_ITEMS.filter(item => item.roles.includes(currentRole));

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
          {filteredItems.map((item) => {
            const fullPath = item.path === '' ? basePath : `${basePath}${item.path}`;
            // Special handling for Staff Index (Orders) URL correctness
            // If item is OrderList and we are Staff, path is /staffadmindashboard/orders OR default /staffadmindashboard

            const active = isActive(item);
            return (
              <Link
                key={item.label}
                to={fullPath}
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
                {item.label === "Messages" && unreadCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
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
              <p className="text-xs font-medium text-[#0055FE] capitalize">{user.role}</p>
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
