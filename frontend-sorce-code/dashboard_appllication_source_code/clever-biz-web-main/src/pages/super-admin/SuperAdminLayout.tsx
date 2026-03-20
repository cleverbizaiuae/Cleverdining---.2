
import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import {
    LayoutDashboard,
    Users,
    LogOut,
    Menu,
    X,
    UserCircle,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import logo from "../../assets/cleverbiz_full_logo.png";

// Create a client for Super Admin pages
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 1,
        },
    },
});

const SuperAdminLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    // --- Authentication Check ---
    useEffect(() => {
        const isAuth = localStorage.getItem("superAdminAuth");
        if (!isAuth) {
            navigate("/superadmin/login", { replace: true });
        }
    }, [navigate]);

    // Format Date: "Monday, 12 January 2026"
    const today = new Date();
    const formattedDate = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(today);

    const handleLogout = () => {
        localStorage.removeItem("superAdminAuth");
        localStorage.removeItem("superAdminToken");
        navigate("/superadmin/login");
    };

    const navItems = [
        { label: "Dashboard", path: "/superadmin", icon: <LayoutDashboard size={20} /> },
        { label: "Management", path: "/superadmin/management", icon: <Users size={20} /> },
    ];

    return (
        <QueryClientProvider client={queryClient}>
            <div className="flex min-h-screen bg-slate-50">
                {/* --- Mobile Sidebar Overlay --- */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* --- Sidebar --- */}
                <aside className={`
                fixed top-0 left-0 h-full bg-white border-r border-slate-200 shadow-xl z-50 transition-all duration-300
                ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                ${isCollapsed ? "w-20" : "w-64"}
            `}>
                    <div className="flex flex-col h-full relative">
                        {/* Collapse Toggle Button - Desktop Only */}
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 rounded-full items-center justify-center text-slate-400 hover:text-[#0055FE] hover:border-[#0055FE] shadow-sm transition-colors z-10"
                        >
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                        </button>

                        {/* Sidebar Header */}
                        <div className="h-16 flex items-center justify-center px-4 border-b border-slate-100">
                            {isCollapsed ? (
                                <div className="w-10 h-10 bg-gradient-to-br from-[#0055FE] to-cyan-400 rounded-xl flex items-center justify-center text-white font-bold text-xl">
                                    C
                                </div>
                            ) : (
                                <img src={logo} alt="CleverBiz AI" className="h-8 w-auto" />
                            )}
                        </div>
                        <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-slate-600 absolute top-4 right-4">
                            <X size={24} />
                        </button>

                        {/* Navigation */}
                        <nav className="flex-1 px-3 py-4 space-y-2">
                            {navItems.map((item) => {
                                const isActive = location.pathname === item.path;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        title={isCollapsed ? item.label : undefined}
                                        className={`
                                        flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
                                        ${isCollapsed ? "justify-center" : ""}
                                        ${isActive
                                                ? "bg-[#0055FE] text-white shadow-lg shadow-blue-500/20"
                                                : "text-slate-500 hover:bg-slate-50 hover:text-[#0055FE]"
                                            }
                                    `}
                                    >
                                        {item.icon}
                                        {!isCollapsed && item.label}
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Logout */}
                        <div className="p-3 border-t border-slate-100">
                            <button
                                onClick={handleLogout}
                                title={isCollapsed ? "Logout" : undefined}
                                className={`
                                flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all
                                ${isCollapsed ? "justify-center" : ""}
                            `}
                            >
                                <LogOut size={20} />
                                {!isCollapsed && "Logout"}
                            </button>
                        </div>
                    </div>
                </aside>

                {/* --- Main Content --- */}
                <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isCollapsed ? "lg:ml-20" : "lg:ml-64"}`}>
                    {/* Header */}
                    <header className="sticky top-0 z-30 h-16 sm:h-20 bg-white border-b border-slate-200 shadow-sm px-4 sm:px-8 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setSidebarOpen(true)}
                                className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                            >
                                <Menu size={24} />
                            </button>
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold text-slate-900">Dashboard</h1>
                                <p className="hidden sm:block text-xs text-slate-400">{formattedDate}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-semibold text-slate-900">Hi, Admin</p>
                                <span className="text-xs font-medium text-[#0055FE]">Super Admin</span>
                            </div>
                            <div className="relative p-0.5 rounded-full bg-gradient-to-tr from-[#0055FE] to-cyan-400">
                                <div className="bg-white rounded-full p-0.5">
                                    <UserCircle className="w-8 h-8 text-slate-300" />
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Content Outlet */}
                    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
                        <Outlet />
                    </main>

                    {/* Footer */}
                    <footer className="py-6 text-center text-xs text-slate-400">
                        Powered by CleverBiz AI
                    </footer>
                </div>
            </div>
        </QueryClientProvider>
    );
};

export default SuperAdminLayout;
