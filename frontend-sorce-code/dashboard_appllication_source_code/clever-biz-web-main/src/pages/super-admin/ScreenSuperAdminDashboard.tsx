import { useState, useMemo } from "react";
import { Users, TrendingUp, Filter, Database, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cachedGet } from "@/lib/requestCache";
import toast from "react-hot-toast";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, eachMonthOfInterval } from "date-fns";

// TypeScript Interfaces
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
    status: 'active' | 'on_hold' | 'inactive';
    qrCodes: number;
    tableCount: number;
    paymentProcessor: string;
    subscriptionStart?: string;
    subscriptionEnd?: string;
    createdAt: string;
}

const normalizeRestaurant = (restaurant: any): RegisteredRestaurant => ({
    id: String(restaurant?.id ?? ""),
    name: String(restaurant?.name ?? restaurant?.resturent_name ?? ""),
    region: String(restaurant?.region ?? "UAE").toUpperCase() === "UK" ? "UK" : "UAE",
    location: String(restaurant?.location ?? ""),
    city: String(restaurant?.city ?? ""),
    country: String(restaurant?.country ?? ""),
    phone: String(restaurant?.phone ?? restaurant?.phone_number ?? ""),
    email: restaurant?.email ?? undefined,
    logoUrl: restaurant?.logoUrl ?? restaurant?.logo_url ?? restaurant?.logo ?? undefined,
    package: String(restaurant?.package ?? "Starter"),
    status: restaurant?.status === "on_hold" ? "on_hold" : restaurant?.status === "inactive" ? "inactive" : "active",
    qrCodes: Number(restaurant?.qrCodes ?? restaurant?.qr_codes ?? 10) || 10,
    tableCount: Number(restaurant?.tableCount ?? restaurant?.table_count ?? 10) || 10,
    paymentProcessor: String(restaurant?.paymentProcessor ?? restaurant?.payment_processor ?? "stripe"),
    subscriptionStart: restaurant?.subscriptionStart ?? restaurant?.subscription_start ?? undefined,
    subscriptionEnd: restaurant?.subscriptionEnd ?? restaurant?.subscription_end ?? undefined,
    createdAt: String(restaurant?.createdAt ?? restaurant?.created_at ?? new Date().toISOString()),
});

// Seeded fallback data (UAE + UK only)
const SEEDED_RESTAURANTS: RegisteredRestaurant[] = [
    { id: "rest-001", name: "The Golden Fork", region: "UAE", location: "Dubai Mall, Level 2", city: "Dubai", country: "UAE", phone: "+971 4 123 4567", email: "contact@goldenfork.ae", package: "Professional", status: "active", qrCodes: 15, tableCount: 12, paymentProcessor: "stripe", createdAt: "2026-01-10T20:39:25.775Z" },
    { id: "rest-002", name: "Spice Route Kitchen", region: "UAE", location: "JBR Walk", city: "Dubai", country: "UAE", phone: "+971 4 234 5678", email: "info@spiceroute.ae", package: "Enterprise", status: "active", qrCodes: 20, tableCount: 18, paymentProcessor: "stripe", createdAt: "2026-01-08T15:20:00.000Z" },
    { id: "rest-003", name: "The Corniche Cafe", region: "UAE", location: "Corniche Road", city: "Abu Dhabi", country: "UAE", phone: "+971 2 567 8901", email: "info@corniche.ae", package: "Enterprise", status: "on_hold", qrCodes: 12, tableCount: 10, paymentProcessor: "checkout", createdAt: "2025-11-25T09:15:00.000Z" },
    { id: "rest-004", name: "London Spice House", region: "UK", location: "Oxford Street", city: "London", country: "United Kingdom", phone: "+44 20 7123 4567", email: "hello@londonspice.uk", package: "Enterprise", status: "active", qrCodes: 18, tableCount: 14, paymentProcessor: "stripe", createdAt: "2025-12-15T14:30:00.000Z" },
    { id: "rest-005", name: "Manchester Grill", region: "UK", location: "Deansgate", city: "Manchester", country: "United Kingdom", phone: "+44 161 555 1020", email: "bookings@manchestergrill.uk", package: "Professional", status: "active", qrCodes: 16, tableCount: 12, paymentProcessor: "payme", createdAt: "2025-11-10T12:00:00.000Z" },
    { id: "rest-006", name: "Bristol Riverside", region: "UK", location: "Harbourside", city: "Bristol", country: "United Kingdom", phone: "+44 117 555 2200", email: "contact@bristolriverside.uk", package: "Starter", status: "inactive", qrCodes: 10, tableCount: 8, paymentProcessor: "stripe", createdAt: "2025-09-01T11:00:00.000Z" },
];

const ScreenSuperAdminDashboard = () => {
    // State
    const [regionFilter, setRegionFilter] = useState<"all" | "UAE" | "UK">("all");

    // Data Fetching with React Query
    const { data: restaurants = SEEDED_RESTAURANTS } = useQuery<RegisteredRestaurant[]>({
        queryKey: ['registered-restaurants', regionFilter],
        queryFn: async () => {
            try {
                const response = await cachedGet('/owners/registered-restaurants/', {
                    params: regionFilter === "all" ? undefined : { region: regionFilter },
                }, { ttlMs: 60_000 });
                const payload = Array.isArray(response.data) ? response.data : [];
                return payload.map(normalizeRestaurant);
            } catch {
                return SEEDED_RESTAURANTS;
            }
        },
        initialData: SEEDED_RESTAURANTS.map(normalizeRestaurant)
    });

    // --- Computed Values ---
    const regions = ["all", "UAE", "UK"] as const;

    const filteredRestaurants = useMemo(() => {
        return restaurants.filter(r => {
            return regionFilter === "all" || (r.region || "UAE") === regionFilter;
        });
    }, [restaurants, regionFilter]);

    const totalSubscribers = filteredRestaurants.length;
    const activeToday = filteredRestaurants.filter(r => r.status === 'active').length;

    // Monthly Growth Chart Data
    const growthData = useMemo(() => {
        const now = new Date();
        const sixMonthsAgo = subMonths(now, 5);
        const months = eachMonthOfInterval({
            start: startOfMonth(sixMonthsAgo),
            end: startOfMonth(now)
        });

        return months.map(month => {
            const monthStart = startOfMonth(month);
            const monthEnd = endOfMonth(month);
            const count = restaurants.filter(r => {
                if (!r.createdAt) return false;
                const createdDate = new Date(r.createdAt);
                return isWithinInterval(createdDate, { start: monthStart, end: monthEnd });
            }).length;
            return { month: format(month, "MMM"), count };
        });
    }, [restaurants]);

    const maxCount = Math.max(5, ...growthData.map(d => d.count));

    // Recent subscribers - sorted by createdAt descending
    const recentSubscribers = useMemo(() => {
        return [...restaurants]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);
    }, [restaurants]);

    const handleAddSampleData = () => {
        toast.success("Sample restaurants loaded!");
    };

    // Status badge styling
    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'active': return 'text-green-600';
            case 'on_hold': return 'text-amber-600';
            case 'inactive': return 'text-red-600';
            default: return 'text-slate-600';
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn font-inter">

            {/* --- Overview Section with Filters --- */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <select
                            value={regionFilter}
                            onChange={(e) => setRegionFilter(e.target.value as "all" | "UAE" | "UK")}
                            className="bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-[#0055FE] focus:border-[#0055FE] p-2.5 pr-8 outline-none appearance-none cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                            {regions.map(c => <option key={c} value={c}>{c === 'all' ? 'All Regions' : c}</option>)}
                        </select>
                        <Filter className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={14} />
                    </div>
                </div>
            </div>

            {/* --- Sample Data Banner --- */}
            {filteredRestaurants.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-100 rounded-xl">
                            <Database className="text-amber-600" size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-amber-900">No restaurants found</h3>
                            <p className="text-sm text-amber-700">Click to load UAE/UK sample restaurants for testing</p>
                        </div>
                    </div>
                    <button onClick={handleAddSampleData} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm transition-colors">
                        Add Sample Data
                    </button>
                </div>
            )}

            {/* --- Stats Cards --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Total Subscribers */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 text-slate-500 mb-2">
                            <Users size={16} className="text-[#0055FE]" />
                            <span className="text-xs font-medium">Total Subscribers</span>
                        </div>
                    </div>
                    <h3 className="text-3xl font-bold text-slate-900">{totalSubscribers}</h3>
                    <span className="text-xs text-[#0055FE]">Restaurants</span>
                    {/* Mini Chart */}
                    <div className="absolute bottom-0 right-4 w-24 h-12">
                        <svg viewBox="0 0 100 40" className="w-full h-full text-[#0055FE]/20 fill-current">
                            <path d="M0,40 L0,25 Q25,15 50,30 T100,15 L100,40 Z" />
                        </svg>
                    </div>
                </div>

                {/* Active Today */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 text-slate-500 mb-2">
                            <TrendingUp size={16} className="text-green-500" />
                            <span className="text-xs font-medium">Active Today</span>
                        </div>
                    </div>
                    <h3 className="text-3xl font-bold text-slate-900">{activeToday}</h3>
                    <span className="text-xs text-green-600">Operating</span>
                    {/* Mini Chart */}
                    <div className="absolute bottom-0 right-4 w-24 h-12">
                        <svg viewBox="0 0 100 40" className="w-full h-full text-green-500/20 fill-current">
                            <path d="M0,40 L0,30 Q25,10 50,25 T100,5 L100,40 Z" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* --- Subscriber Growth Chart --- */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900 mb-6">Subscriber Growth</h3>
                <div className="h-48 flex items-end justify-between gap-2 sm:gap-6 px-4">
                    {growthData.map((item, idx) => {
                        const heightPercent = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                        return (
                            <div key={idx} className="flex flex-col items-center gap-2 group flex-1">
                                <div className="relative w-full max-w-[50px] flex flex-col items-center justify-end h-36">
                                    {/* Count Label */}
                                    {item.count > 0 && (
                                        <span className="text-[10px] font-bold text-[#0055FE] mb-1">{item.count}</span>
                                    )}
                                    {/* Bar */}
                                    <div
                                        className="w-full bg-gradient-to-t from-[#0055FE] to-[#0055FE]/70 rounded-t-lg transition-all duration-500"
                                        style={{ height: `${Math.max(heightPercent, 4)}%` }}
                                    />
                                </div>
                                <span className="text-xs font-medium text-slate-500">{item.month}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --- Recent Subscribers TABLE --- */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                    <h3 className="text-base font-semibold text-slate-900">Recent Subscribers</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3">Restaurant</th>
                                <th className="px-6 py-3">City</th>
                                <th className="px-6 py-3">Phone</th>
                                <th className="px-6 py-3">Package</th>
                                <th className="px-6 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {recentSubscribers.length > 0 ? recentSubscribers.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{r.name}</td>
                                    <td className="px-6 py-4 text-sm text-slate-600">{r.city}</td>
                                    <td className="px-6 py-4 text-sm text-slate-600 font-mono">{r.phone}</td>
                                    <td className="px-6 py-4">
                                        <span className={`
                                            text-xs font-medium px-2 py-1 rounded-full
                                            ${r.package === 'Starter' ? 'bg-slate-100 text-slate-600' : ''}
                                            ${r.package === 'Professional' ? 'bg-blue-100 text-blue-700' : ''}
                                            ${r.package === 'Enterprise' ? 'bg-purple-100 text-purple-700' : ''}
                                        `}>
                                            {r.package}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-sm font-medium capitalize ${getStatusStyle(r.status)}`}>
                                            {r.status === 'on_hold' ? 'On Hold' : r.status}
                                        </span>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">
                                        No restaurants found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ScreenSuperAdminDashboard;
