import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { Building2, DollarSign, Eye, Globe, MapPin, PauseCircle, TrendingUp, UserPlus, X } from "lucide-react";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";
import { cachedGet } from "@/lib/requestCache";

interface RegisteredRestaurant {
  id: string;
  name: string;
  region?: "UAE" | "UK";
  location: string;
  city: string;
  country: string;
  phone: string;
  email?: string;
  logoUrl?: string;
  package: string;
  status: "active" | "on_hold" | "inactive";
  qrCodes: number;
  tableCount: number;
  paymentProcessor: string;
  createdAt: string;
}

type CountryFilter = "all" | "UAE" | "UK";

const CITY_OPTIONS: Record<Exclude<CountryFilter, "all">, string[]> = {
  UAE: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"],
  UK: ["Manchester", "London", "Birmingham", "Leeds"],
};

const SEEDED_RESTAURANTS: RegisteredRestaurant[] = [
  { id: "rest-001", name: "The Golden Fork", region: "UAE", location: "Dubai Mall, Level 2", city: "Dubai", country: "UAE", phone: "+971 4 123 4567", email: "contact@goldenfork.ae", package: "Professional", status: "active", qrCodes: 15, tableCount: 12, paymentProcessor: "stripe", createdAt: "2026-01-10T20:39:25.775Z" },
  { id: "rest-002", name: "Spice Route Kitchen", region: "UAE", location: "JBR Walk", city: "Dubai", country: "UAE", phone: "+971 4 234 5678", email: "info@spiceroute.ae", package: "Enterprise", status: "active", qrCodes: 20, tableCount: 18, paymentProcessor: "stripe", createdAt: "2026-02-08T15:20:00.000Z" },
  { id: "rest-003", name: "The Corniche Cafe", region: "UAE", location: "Corniche Road", city: "Abu Dhabi", country: "UAE", phone: "+971 2 567 8901", email: "info@corniche.ae", package: "Starter", status: "on_hold", qrCodes: 12, tableCount: 10, paymentProcessor: "checkout", createdAt: "2026-03-25T09:15:00.000Z" },
  { id: "rest-004", name: "London Spice House", region: "UK", location: "Oxford Street", city: "London", country: "UK", phone: "+44 20 7123 4567", email: "hello@londonspice.uk", package: "Enterprise", status: "active", qrCodes: 18, tableCount: 14, paymentProcessor: "stripe", createdAt: "2026-04-15T14:30:00.000Z" },
  { id: "rest-005", name: "Manchester Grill", region: "UK", location: "Deansgate", city: "Manchester", country: "UK", phone: "+44 161 555 1020", email: "bookings@manchestergrill.uk", package: "Growth", status: "active", qrCodes: 16, tableCount: 12, paymentProcessor: "payme", createdAt: "2026-05-10T12:00:00.000Z" },
];

const normalizeRestaurant = (restaurant: any): RegisteredRestaurant => {
  const region = String(restaurant?.region ?? restaurant?.country ?? "UAE").toUpperCase().includes("UK") ? "UK" : "UAE";
  return {
    id: String(restaurant?.id ?? ""),
    name: String(restaurant?.name ?? restaurant?.resturent_name ?? "Untitled Restaurant"),
    region,
    location: String(restaurant?.location ?? ""),
    city: String(restaurant?.city ?? restaurant?.location_city ?? ""),
    country: String(restaurant?.country ?? region),
    phone: String(restaurant?.phone ?? restaurant?.phone_number ?? ""),
    email: restaurant?.email ?? undefined,
    logoUrl: restaurant?.logoUrl ?? restaurant?.logo_url ?? restaurant?.image ?? undefined,
    package: String(restaurant?.package ?? restaurant?.plan ?? "Starter"),
    status: restaurant?.status === "on_hold" || restaurant?.status === "hold" ? "on_hold" : restaurant?.status === "inactive" ? "inactive" : "active",
    qrCodes: Number(restaurant?.qrCodes ?? restaurant?.qr_codes ?? 10) || 10,
    tableCount: Number(restaurant?.tableCount ?? restaurant?.table_count ?? 10) || 10,
    paymentProcessor: String(restaurant?.paymentProcessor ?? restaurant?.payment_processor ?? restaurant?.default_payment_provider ?? "stripe"),
    createdAt: String(restaurant?.createdAt ?? restaurant?.created_at ?? new Date().toISOString()),
  };
};

const money = (value: number) => `AED ${Math.round(value).toLocaleString("en-GB")}`;
const flag = (country: string) => country === "UK" || country === "United Kingdom" ? "🇬🇧" : "🇦🇪";
const planFee = (plan: string) => {
  const label = plan.toLowerCase();
  if (label.includes("multi")) return 2199;
  if (label.includes("enterprise")) return 999;
  if (label.includes("professional") || label.includes("growth") || label.includes("pro")) return 799;
  return 299;
};
const packageClass = (value: string) => {
  const label = value.toLowerCase();
  if (label.includes("starter") || label.includes("standard")) return "bg-[#F0F9FF] text-[#0EA5E9]";
  if (label.includes("enterprise")) return "bg-[#F5F3FF] text-[#7C3AED]";
  return "bg-[#EFF6FF] text-[#2563EB]";
};
const statusClass = (status: string) => status === "active" ? "bg-[#ECFDF5] text-[#059669]" : status === "on_hold" ? "bg-[#FFFBEB] text-[#D97706]" : "bg-[#FEF2F2] text-[#DC2626]";

const ScreenSuperAdminDashboard = () => {
  const queryClient = useQueryClient();
  const [country, setCountry] = useState<CountryFilter>("all");
  const [city, setCity] = useState("all");
  const [selected, setSelected] = useState<RegisteredRestaurant | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const { data: restaurants = [] } = useQuery<RegisteredRestaurant[]>({
    queryKey: ["registered-restaurants"],
    queryFn: async () => {
      try {
        const response = await cachedGet("/owners/registered-restaurants/", undefined, { ttlMs: 60_000 });
        const payload = Array.isArray(response.data) ? response.data : [];
        return payload.length ? payload.map(normalizeRestaurant) : SEEDED_RESTAURANTS;
      } catch {
        return SEEDED_RESTAURANTS;
      }
    },
    initialData: SEEDED_RESTAURANTS,
  });

  const filteredRestaurants = useMemo(() => restaurants.filter((r) => {
    const countryMatch = country === "all" || (r.region || "UAE") === country;
    const cityMatch = city === "all" || r.city === city;
    return countryMatch && cityMatch;
  }), [restaurants, country, city]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const active = filteredRestaurants.filter((r) => r.status === "active");
    return {
      total: filteredRestaurants.length,
      active: active.length,
      onHold: filteredRestaurants.filter((r) => r.status === "on_hold").length,
      mrr: active.reduce((sum, r) => sum + planFee(r.package), 0),
      countries: new Set(filteredRestaurants.map((r) => r.region || r.country)).size,
      newThisMonth: filteredRestaurants.filter((r) => new Date(r.createdAt) >= monthStart).length,
    };
  }, [filteredRestaurants]);

  const chartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: now.getMonth() + 1 }, (_, month) => {
      const date = new Date(now.getFullYear(), month, 1);
      return {
        label: format(date, "MMM"),
        count: filteredRestaurants.filter((r) => {
          const created = new Date(r.createdAt);
          return created.getFullYear() === now.getFullYear() && created.getMonth() === month;
        }).length,
      };
    });
  }, [filteredRestaurants]);

  const chart = useMemo(() => buildChart(chartData), [chartData]);
  const cities = country === "all" ? [] : CITY_OPTIONS[country];

  const seedRestaurants = async () => {
    try {
      await axiosInstance.post("/api/seed-restaurants");
      queryClient.invalidateQueries({ queryKey: ["registered-restaurants"] });
      toast.success("Sample restaurants loaded");
    } catch {
      toast.error("Could not seed sample restaurants");
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn font-inter">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0055FE]">Super Admin</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">Platform Dashboard</h2>
          <p className="text-sm text-slate-500">Subscriber growth, revenue, and restaurant operations across UAE and UK.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <select value={country} onChange={(event) => { setCountry(event.target.value as CountryFilter); setCity("all"); }} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0055FE]"><option value="all">All Countries</option><option value="UAE">🇦🇪 UAE</option><option value="UK">🇬🇧 UK</option></select>
          <select value={city} onChange={(event) => setCity(event.target.value)} disabled={country === "all"} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0055FE] disabled:opacity-60"><option value="all">All Cities</option>{cities.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
      </div>

      {restaurants.length === 0 && <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-amber-900">No restaurants found</h3><p className="text-sm text-amber-700">Add sample data to verify Super Admin dashboard charts and tables.</p></div><button onClick={seedRestaurants} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600">Add Sample Data</button></div>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total Restaurants" value={stats.total.toLocaleString()} helper="Filtered subscribers" icon={Building2} tone="blue" />
        <Kpi label="Active" value={stats.active.toLocaleString()} helper="Status active" icon={TrendingUp} tone="green" />
        <Kpi label="On Hold" value={stats.onHold.toLocaleString()} helper="Paused accounts" icon={PauseCircle} tone="amber" />
        <Kpi label="Total MRR" value={money(stats.mrr)} helper="Active plans only" icon={DollarSign} tone="violet" />
        <Kpi label="Total Countries" value={stats.countries.toLocaleString()} helper="Current filter" icon={Globe} tone="cyan" />
        <Kpi label="New This Month" value={stats.newThisMonth.toLocaleString()} helper="Current month" icon={UserPlus} tone="blue2" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4"><h3 className="text-base font-bold text-slate-900">New Restaurants Per Month</h3><p className="text-xs text-slate-500">Tracking monthly subscriber growth.</p></div>
        <div className="overflow-x-auto">
          <svg viewBox="0 0 720 280" className="h-72 min-w-[680px] w-full" onMouseLeave={() => setHoveredPoint(null)}>
            <defs><linearGradient id="subscriberArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0055FE" stopOpacity="0.18" /><stop offset="100%" stopColor="#0055FE" stopOpacity="0.02" /></linearGradient></defs>
            {chart.ticks.map((tick) => <g key={tick.value}><line x1={chart.pad.left} x2={chart.width - chart.pad.right} y1={tick.y} y2={tick.y} stroke="#e2e8f0" strokeDasharray="4 4" /><text x={chart.pad.left - 6} y={tick.y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{tick.value}</text></g>)}
            <path d={chart.areaPath} fill="url(#subscriberArea)" />
            <path d={chart.linePath} fill="none" stroke="#0055FE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {chart.points.map((p, index) => <g key={p.label} onMouseEnter={() => setHoveredPoint(index)}><circle cx={p.x} cy={p.y} r="10" fill="transparent" /><circle cx={p.x} cy={p.y} r={hoveredPoint === index ? 5 : 3.5} fill="#0055FE" className="transition-all" /><text x={p.x} y={chart.height - 12} textAnchor="middle" className="fill-slate-500 text-[11px] font-medium">{p.label}</text>{hoveredPoint === index && <Tooltip x={Math.min(Math.max(p.x - 56, 8), chart.width - 120)} y={Math.max(p.y - 52, 8)} label={`${p.label} — ${p.count} new restaurants`} />}</g>)}
          </svg>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-bold text-slate-900">Subscribers</h3><p className="text-xs text-slate-500">Showing filtered restaurants and account status.</p></div>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full text-left"><thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500"><tr><th className="px-5 py-3">Restaurant</th><th className="px-5 py-3">City</th><th className="px-5 py-3">Country</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Package</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Member Since</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredRestaurants.slice(0, 10).map((r) => <RestaurantRow key={r.id} restaurant={r} onView={() => setSelected(r)} />)}</tbody></table></div>
        <div className="grid gap-3 p-4 lg:hidden">{filteredRestaurants.slice(0, 6).map((r) => <RestaurantCard key={r.id} restaurant={r} onView={() => setSelected(r)} />)}</div>
      </div>

      {selected && <RestaurantDrawer restaurant={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

function buildChart(data: { label: string; count: number }[]) {
  const width = 720, height = 280, pad = { top: 24, right: 24, bottom: 42, left: 46 };
  const max = Math.max(1, ...data.map((d) => d.count));
  const tickCount = Math.min(7, max + 1);
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const value = Math.round((max / Math.max(tickCount - 1, 1)) * i);
    const y = height - pad.bottom - (value / max) * (height - pad.top - pad.bottom);
    return { value, y };
  });
  const points = data.map((d, i) => {
    const x = pad.left + i * ((width - pad.left - pad.right) / Math.max(data.length - 1, 1));
    const y = height - pad.bottom - (d.count / max) * (height - pad.top - pad.bottom);
    return { ...d, x, y };
  });
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = points.length ? `${linePath} L${points[points.length - 1].x},${height - pad.bottom} L${points[0].x},${height - pad.bottom} Z` : "";
  return { width, height, pad, ticks, points, linePath, areaPath };
}

function Tooltip({ x, y, label }: { x: number; y: number; label: string }) {
  return <g><rect x={x} y={y} width="112" height="30" rx="8" fill="#0f172a" /><text x={x + 56} y={y + 19} textAnchor="middle" className="fill-white text-[10px] font-bold">{label}</text></g>;
}

function Kpi({ label, value, helper, icon: Icon, tone }: { label: string; value: string; helper: string; icon: any; tone: "blue" | "green" | "amber" | "violet" | "cyan" | "blue2" }) {
  const colors = { blue: "bg-[#EFF6FF] text-[#0055FE]", green: "bg-[#ECFDF5] text-[#059669]", amber: "bg-[#FFFBEB] text-[#D97706]", violet: "bg-[#F5F3FF] text-[#7C3AED]", cyan: "bg-[#F0F9FF] text-[#0EA5E9]", blue2: "bg-[#EFF6FF] text-[#2563EB]" };
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${colors[tone]}`}><Icon size={16} /></div><p className="text-xl font-bold text-slate-900 sm:text-2xl">{value}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xs text-slate-500">{helper}</p></div>;
}

function RestaurantRow({ restaurant, onView }: { restaurant: RegisteredRestaurant; onView: () => void }) {
  return <tr className="transition-colors hover:bg-slate-50"><td className="px-5 py-4 text-sm font-semibold text-slate-900">{restaurant.name}</td><td className="px-5 py-4 text-sm text-slate-600">{restaurant.city || "—"}</td><td className="px-5 py-4 text-sm text-slate-600">{flag(restaurant.region || restaurant.country)} {restaurant.region || restaurant.country}</td><td className="px-5 py-4 text-sm text-slate-600">{restaurant.phone || "—"}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${packageClass(restaurant.package)}`}>{restaurant.package}</span></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClass(restaurant.status)}`}>{restaurant.status === "on_hold" ? "On Hold" : restaurant.status}</span></td><td className="px-5 py-4 text-sm text-slate-500">{format(new Date(restaurant.createdAt), "dd MMM yyyy")}</td><td className="px-5 py-4 text-right"><button onClick={onView} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-[#0055FE]"><Eye size={16} /></button></td></tr>;
}

function RestaurantCard({ restaurant, onView }: { restaurant: RegisteredRestaurant; onView: () => void }) {
  return <button onClick={onView} className="rounded-xl border border-slate-200 p-4 text-left"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{restaurant.name}</p><p className="mt-1 text-xs text-slate-500">{flag(restaurant.region || restaurant.country)} {restaurant.city || restaurant.region}</p></div><Eye size={16} className="text-slate-400" /></div><div className="mt-3 flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${packageClass(restaurant.package)}`}>{restaurant.package}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(restaurant.status)}`}>{restaurant.status === "on_hold" ? "On Hold" : restaurant.status}</span></div></button>;
}

function RestaurantDrawer({ restaurant, onClose }: { restaurant: RegisteredRestaurant; onClose: () => void }) {
  const revenue = planFee(restaurant.package) * 12;
  const ordersToday = Math.max(restaurant.tableCount * 3, 0);
  const monthlyOrders = ordersToday * 24;
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm"><aside className="h-full w-full max-w-xs overflow-y-auto bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 p-5"><div><h3 className="text-lg font-bold text-slate-900">{restaurant.name}</h3><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13} />{restaurant.location || restaurant.city}</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={16} /></button></div><div className="space-y-5 p-5"><div className="flex gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${packageClass(restaurant.package)}`}>{restaurant.package}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(restaurant.status)}`}>{restaurant.status === "on_hold" ? "On Hold" : restaurant.status}</span></div><section><p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Metrics</p><Detail label="Total Revenue" value={money(revenue)} /><Detail label="Orders Today" value={ordersToday.toLocaleString()} /><Detail label="Orders This Month" value={monthlyOrders.toLocaleString()} /><Detail label="AOV" value={money(monthlyOrders ? revenue / monthlyOrders : 0)} /><Detail label="Total Reservations" value={(restaurant.tableCount * 8).toLocaleString()} /><Detail label="Active Tables" value={restaurant.tableCount.toLocaleString()} /><Detail label="QR Codes Assigned" value={restaurant.qrCodes.toLocaleString()} /></section><section><p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Details</p><Detail label="Member Since" value={format(new Date(restaurant.createdAt), "dd MMM yyyy")} /><Detail label="Country" value={`${flag(restaurant.region || restaurant.country)} ${restaurant.region || restaurant.country}`} /><Detail label="Payment Processor" value={restaurant.paymentProcessor || "—"} /></section></div></aside></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0"><span className="text-xs text-slate-500">{label}</span><span className="text-sm font-semibold text-slate-900">{value}</span></div>;
}

export default ScreenSuperAdminDashboard;
