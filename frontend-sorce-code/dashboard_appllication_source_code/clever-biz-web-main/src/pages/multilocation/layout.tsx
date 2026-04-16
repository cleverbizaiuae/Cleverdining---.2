import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  BarChart3,
  Building2,
  CalendarRange,
  Menu,
  Users,
  Activity,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { getBrandingSettings } from "./store";

type MenuEntry = {
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const MENU: MenuEntry[] = [
  { label: "Dashboard", path: "/multilocation", icon: BarChart3 },
  { label: "Reports", path: "/multilocation/reports", icon: CalendarRange },
  { label: "Locations", path: "/multilocation/locations", icon: Building2 },
  { label: "Staff", path: "/multilocation/staff", icon: Users },
  { label: "Activity", path: "/multilocation/activity", icon: Activity },
  { label: "Branding", path: "/multilocation/branding", icon: Palette },
];

function titleFromPath(pathname: string): string {
  const found = MENU.find((entry) => pathname === entry.path || pathname.startsWith(`${entry.path}/`));
  return found?.label || "Dashboard";
}

export default function MultiLocationLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brandLabel, setBrandLabel] = useState(() => getBrandingSettings().restaurantName?.trim() || "Group Owner");

  useEffect(() => {
    const refresh = () => setBrandLabel(getBrandingSettings().restaurantName?.trim() || "Group Owner");
    window.addEventListener("storage", refresh);
    window.addEventListener("branding-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("branding-updated", refresh);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex font-inter">
      {mobileOpen && (
        <button
          aria-label="Close menu overlay"
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-white border-r border-slate-200 transition-all duration-200 ${
          collapsed ? "w-[84px]" : "w-[280px]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="h-20 border-b border-slate-200 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 flex items-center justify-center">
            <Building2 size={20} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{brandLabel}</p>
              <p className="text-xs text-slate-500">Multi-Location Console</p>
            </div>
          )}

          <button
            className="ml-auto hidden lg:inline-flex w-8 h-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>

          <button
            className="ml-auto lg:hidden w-8 h-8 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center"
            onClick={() => setMobileOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          {MENU.map((entry) => {
            const Icon = entry.icon;
            const active = location.pathname === entry.path || location.pathname.startsWith(`${entry.path}/`);
            return (
              <Link
                key={entry.path}
                to={entry.path}
                onClick={() => setMobileOpen(false)}
                className={`group flex items-center rounded-xl border px-3 py-2.5 transition-colors ${
                  active
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white border-transparent text-slate-600 hover:bg-slate-50"
                }`}
                title={entry.label}
              >
                <span
                  className={`w-9 h-9 rounded-lg border flex items-center justify-center ${
                    active
                      ? "bg-white/15 border-white/20 text-white"
                      : "bg-slate-50 border-slate-100 text-slate-400"
                  }`}
                >
                  <Icon size={18} />
                </span>
                {!collapsed && <span className="ml-3 text-sm font-medium">{entry.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="h-20 sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden w-10 h-10 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{titleFromPath(location.pathname)}</h1>
              <p className="text-xs text-slate-500">{new Date().toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">Owner Workspace</p>
            <p className="text-xs text-slate-500">White-label multi-location control</p>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
