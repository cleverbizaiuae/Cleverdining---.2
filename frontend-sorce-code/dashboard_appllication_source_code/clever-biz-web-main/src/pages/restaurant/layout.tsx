import { useEffect, useRef, useState, useContext, Suspense } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router';
import { WebSocketContext } from '@/hooks/WebSocketProvider';
import { useOwner } from '@/context/ownerContext';
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  MessageSquare,
  Users,
  ContactRound,
  Wallet,
  LogOut,
  Menu,
  X,
  ScanQrCode,
  BrainCircuit,
  Paintbrush,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

// Assets
import mobileLogo from "../../assets/cleverbiz_full_logo.png"; // Updated Logo
import iconLogo from "../../assets/mobile_logo.png";
// import bgAuth from "../../assets/bg-auth.webp"; // Not used here based on specs

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  matchType: 'exact' | 'startsWith';
  roles: string[]; // Added roles property
};

type DashboardRole = "owner" | "manager" | "staff" | "chef" | "admin";

const SEGMENT_PRELOADERS: Record<string, () => Promise<unknown>> = {
  Dashboard: () => import("./screen_restaurant_dashboard"),
  Orders: () => import("./screen_restaurant_order_list"),
  Reservations: () => import("./screen_restaurant_reservations"),
  Messages: () => import("./screen_restaurant_chat"),
  Management: () => import("./screen_restaurant_management"),
  Tables: () => import("./screen_restaurant_devices"),
  Payments: () => import("./Payments"),
  "AI Upsell": () => import("./screen_restaurant_upsell"),
  Branding: () => import("../multilocation/screen_multilocation_branding"),
  Customers: () => import("./screen_restaurant_crm"),
  Leads: () => import("./screen_restaurant_leads"),
};

const prefetchedSegments = new Set<string>();

const prefetchSegment = (label: string) => {
  if (prefetchedSegments.has(label)) return;
  prefetchedSegments.add(label);
  SEGMENT_PRELOADERS[label]?.().catch(() => {
    prefetchedSegments.delete(label);
  });
};

const MENU_ITEMS: MenuItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '', matchType: 'exact', roles: ['owner', 'manager'] },
  { icon: ClipboardList, label: 'Orders', path: '/orders', matchType: 'startsWith', roles: ['owner', 'manager', 'staff', 'chef'] },
  { icon: CalendarDays, label: 'Reservations', path: '/reservations', matchType: 'startsWith', roles: ['owner', 'manager', 'staff'] },
  { icon: MessageSquare, label: 'Messages', path: '/messages', matchType: 'startsWith', roles: ['owner', 'manager', 'staff', 'chef'] },
  { icon: Users, label: 'Management', path: '/management', matchType: 'startsWith', roles: ['owner', 'manager'] },
  { icon: ScanQrCode, label: 'Tables', path: '/devices', matchType: 'startsWith', roles: ['owner', 'manager'] },
  { icon: Wallet, label: 'Payments', path: '/payments', matchType: 'startsWith', roles: ['owner', 'manager'] },
  { icon: Paintbrush, label: 'Branding', path: '/branding', matchType: 'startsWith', roles: ['owner', 'manager'] },
  { icon: BrainCircuit, label: 'AI Upsell', path: '/ai-upsell', matchType: 'startsWith', roles: ['owner', 'manager'] },
  { icon: ContactRound, label: 'Customers', path: '/crm', matchType: 'startsWith', roles: ['owner', 'manager'] },
];

const ROLE_ALIASES: Record<string, DashboardRole> = {
  owner: "owner",
  manager: "manager",
  staff: "staff",
  chef: "chef",
  admin: "admin",
  "owner user": "owner",
  restaurant_owner: "owner",
  "restaurant owner": "owner",
  "manager user": "manager",
  restaurant_manager: "manager",
  "restaurant manager": "manager",
  "admin user": "manager",
};

const normalizeDashboardRole = (roleValue: unknown): DashboardRole | "" => {
  const key = String(roleValue || "").trim().toLowerCase();
  if (!key) return "";
  return ROLE_ALIASES[key] || "";
};

const resolveSidebarRole = (user: any, pathname: string): DashboardRole => {
  const candidates = [
    user?.role,
    user?.user?.role,
    user?.profile?.role,
    localStorage.getItem("adminRole"),
    localStorage.getItem("role"),
  ];

  for (const roleCandidate of candidates) {
    const normalized = normalizeDashboardRole(roleCandidate);
    if (normalized) return normalized;
  }

  if (pathname.startsWith("/chef")) return "chef";
  if (pathname.startsWith("/staff")) return "staff";
  return "manager";
};

const RestaurantLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("adminSidebarCollapsed") === "true");
  const { unreadCount, unreadTableSummary } = useContext(WebSocketContext) || {};
  const { fetchMembers, fetchAllDevices, fetchDeviceStats } = useOwner();
  const dataPrefetchedRef = useRef<Set<string>>(new Set());
  const location = useLocation();
  const navigate = useNavigate();

  // Get User Info
  const userStr = localStorage.getItem("userInfo");
  const user = userStr ? JSON.parse(userStr) : { username: "Manager", role: "manager" };
  const currentRole = resolveSidebarRole(user, location.pathname);
  const displayUser = user?.user || user || {};
  const username = String(displayUser?.username || user?.username || "Manager");

  // Determine Base Path based on current URL
  const isStaffAliasDashboard = location.pathname.startsWith('/staffadmindashboard');
  const isChefAliasDashboard = location.pathname.startsWith('/chefadmindashboard');
  const isStaffDashboard = isStaffAliasDashboard || location.pathname.startsWith('/staff');
  const isChefDashboard = isChefAliasDashboard || location.pathname.startsWith('/chef');
  const isManagerDashboard = location.pathname.startsWith('/manageradmindashboard');
  const isLegacyAdminDashboard = location.pathname.startsWith('/admindashboard');

  let basePath = '/restaurant';
  if (isStaffAliasDashboard) basePath = '/staffadmindashboard';
  else if (isStaffDashboard) basePath = '/staff';
  if (isChefAliasDashboard) basePath = '/chefadmindashboard';
  else if (isChefDashboard) basePath = '/chef';
  if (isManagerDashboard) basePath = '/manageradmindashboard';
  if (isLegacyAdminDashboard) basePath = '/admindashboard';

  useEffect(() => {
    localStorage.setItem("adminSidebarCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleLogout = () => {
    localStorage.clear();
    toast.success("Logged out successfully");
    navigate('/adminlogin');
  };

  const isActive = (item: MenuItem) => {
    const fullPath = item.path === '' ? basePath : `${basePath}${item.path}`;
    const legacyUpsellPath = `${basePath}/upsell`;

    // Explicitly handle root path matching for dashboard/orders
    if (item.path === '' && location.pathname === basePath) return true;
    if (item.path === '/ai-upsell' && location.pathname.startsWith(legacyUpsellPath)) return true;

    if ((isStaffDashboard || isChefDashboard) && location.pathname === basePath && item.label === 'Orders') {
      return true;
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
      if (item.path === '/ai-upsell' && location.pathname.startsWith(`${basePath}/upsell`)) return true;
      return location.pathname.startsWith(fullPath) && item.path !== '';
    });

    if (activeItem) return activeItem.label;

    // Fallback for staff/chef index
    if ((isStaffDashboard || isChefDashboard) && location.pathname === basePath) return "Orders";

    return "Dashboard";
  };

  const filteredItems = MENU_ITEMS.filter(item => item.roles.includes(currentRole));

  const prefetchSegmentData = (label: string) => {
    if (dataPrefetchedRef.current.has(label)) return;
    dataPrefetchedRef.current.add(label);
    if (label === "Management") {
      fetchMembers().catch(() => dataPrefetchedRef.current.delete(label));
    }
    if (label === "Tables") {
      Promise.all([fetchDeviceStats(), fetchAllDevices()]).catch(() => dataPrefetchedRef.current.delete(label));
    }
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
          fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200 shadow-xl transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? "lg:w-20" : "lg:w-64"}
          w-64
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <button
          type="button"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setSidebarCollapsed((value) => !value)}
          className="absolute -right-3 top-24 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition-colors hover:text-[#0055FE] lg:flex"
        >
          {sidebarCollapsed ? <ChevronRight size={15} strokeWidth={1.8} /> : <ChevronLeft size={15} strokeWidth={1.8} />}
        </button>

        {/* Logo Section */}
        <div className={`h-20 flex items-center border-b border-slate-100 ${sidebarCollapsed ? "justify-center px-3" : "px-6"}`}>
          <img
            src={sidebarCollapsed ? iconLogo : mobileLogo}
            alt="CleverBiz"
            className={sidebarCollapsed ? "h-10 w-10 rounded-xl object-contain" : "h-8 w-auto"}
          />
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-slate-400 hover:text-slate-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Navigation */}
        <div className={`${sidebarCollapsed ? "px-3" : "p-4"} py-4 space-y-2 overflow-y-auto h-[calc(100vh-160px)]`}>
          {filteredItems.map((item) => {
            const fullPath = item.path === '' ? basePath : `${basePath}${item.path}`;
            const active = isActive(item);
            return (
              <Link
                key={item.label}
                to={fullPath}
                onMouseEnter={() => {
                  prefetchSegment(item.label);
                  prefetchSegmentData(item.label);
                }}
                onFocus={() => {
                  prefetchSegment(item.label);
                  prefetchSegmentData(item.label);
                }}
                onTouchStart={() => {
                  prefetchSegment(item.label);
                  prefetchSegmentData(item.label);
                }}
                onClick={() => setSidebarOpen(false)} // Close on mobile click
                title={sidebarCollapsed ? item.label : undefined}
                className={`
                   relative flex items-center ${sidebarCollapsed ? "gap-3 px-4 lg:justify-center lg:px-0" : "gap-3 px-4"} py-3 rounded-xl text-sm font-medium transition-all duration-200
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
                {sidebarCollapsed ? <span className="lg:hidden">{item.label}</span> : item.label}
                {item.label === "Messages" && unreadCount > 0 && (
                  <div className={`ml-auto flex items-center gap-1 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                    {unreadTableSummary && (
                      <span className={`text-[10px] text-red-500 max-w-[80px] truncate ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                        {unreadTableSummary}
                      </span>
                    )}
                    <span className={`bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  </div>
                )}
                {item.label === "Messages" && unreadCount > 0 && sidebarCollapsed && (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Logout Section */}
        <div className={`${sidebarCollapsed ? "p-3" : "p-4"} absolute bottom-0 left-0 right-0 border-t border-slate-100 bg-white`}>
          <button
            onClick={handleLogout}
            title={sidebarCollapsed ? "Log Out" : undefined}
            className={`flex items-center ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-4"} w-full py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-500 transition-colors duration-200`}
          >
            <LogOut size={20} />
            {!sidebarCollapsed && <span className="text-sm font-medium">Log Out</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarCollapsed ? "lg:ml-20" : "lg:ml-64"}`}>

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
              <p className="text-sm font-bold text-slate-900 leading-tight">Welcome, {username}</p>
              <p className="text-xs font-medium text-[#0055FE] capitalize">{currentRole}</p>
            </div>

            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0055FE] to-cyan-400 p-[2px]">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                <span className="text-[#0055FE] font-bold text-lg uppercase">{username[0]}</span>
              </div>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 bg-slate-50 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <Suspense fallback={
            <div className="flex items-center justify-center h-[calc(100vh-140px)]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0055FE]"></div>
            </div>
          }>
            <Outlet />
          </Suspense>
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
