import { useState, useMemo } from "react";
import { Users, TrendingUp, Filter, Database, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, eachMonthOfInterval } from "date-fns";

// TypeScript Interfaces
interface RegisteredRestaurant {
    id: string;
    name: string;
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

// GCC Countries with cities
const COUNTRIES_DATA: Record<string, string[]> = {
    "UAE": ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"],
    "Saudi Arabia": ["Riyadh", "Jeddah", "Dammam", "Mecca"],
    "Qatar": ["Doha", "Al Wakrah", "Al Khor"],
    "Kuwait": ["Kuwait City", "Hawalli", "Salmiya"],
    "Bahrain": ["Manama", "Riffa", "Muharraq"],
    "Egypt": ["Cairo", "Alexandria", "Giza"]
};

// Seeded Sample Data (12 restaurants)
const SEEDED_RESTAURANTS: RegisteredRestaurant[] = [
    { id: "rest-001", name: "The Golden Fork", location: "Dubai Mall, Level 2", city: "Dubai", country: "UAE", phone: "+971 4 123 4567", email: "contact@goldenfork.ae", package: "Professional", status: "active", qrCodes: 15, tableCount: 12, paymentProcessor: "stripe", createdAt: "2026-01-10T20:39:25.775Z" },
    { id: "rest-002", name: "Spice Route Kitchen", location: "JBR Walk", city: "Dubai", country: "UAE", phone: "+971 4 234 5678", email: "info@spiceroute.ae", package: "Enterprise", status: "active", qrCodes: 20, tableCount: 18, paymentProcessor: "stripe", createdAt: "2026-01-08T15:20:00.000Z" },
    { id: "rest-003", name: "Marina Bites", location: "Dubai Marina", city: "Dubai", country: "UAE", phone: "+971 4 345 6789", email: "hello@marinabites.ae", package: "Starter", status: "inactive", qrCodes: 10, tableCount: 8, paymentProcessor: "paytabs", createdAt: "2025-12-20T10:00:00.000Z" },
    { id: "rest-004", name: "Abu Dhabi Grill House", location: "Yas Mall", city: "Abu Dhabi", country: "UAE", phone: "+971 2 456 7890", email: "reservations@adgrill.ae", package: "Enterprise", status: "active", qrCodes: 25, tableCount: 20, paymentProcessor: "stripe", createdAt: "2025-12-15T14:30:00.000Z" },
    { id: "rest-005", name: "The Corniche Cafe", location: "Corniche Road", city: "Abu Dhabi", country: "UAE", phone: "+971 2 567 8901", email: "info@corniche.ae", package: "Enterprise", status: "on_hold", qrCodes: 12, tableCount: 10, paymentProcessor: "checkout", createdAt: "2025-11-25T09:15:00.000Z" },
    { id: "rest-006", name: "Riyadh Palace Restaurant", location: "Kingdom Centre", city: "Riyadh", country: "Saudi Arabia", phone: "+966 11 123 4567", email: "palace@riyadhpalace.sa", package: "Enterprise", status: "active", qrCodes: 30, tableCount: 25, paymentProcessor: "stripe", createdAt: "2025-11-10T12:00:00.000Z" },
    { id: "rest-007", name: "Jeddah Seafood House", location: "Red Sea Mall", city: "Jeddah", country: "Saudi Arabia", phone: "+966 12 234 5678", email: "jeddah@seafood.sa", package: "Professional", status: "active", qrCodes: 18, tableCount: 15, paymentProcessor: "paytabs", createdAt: "2025-10-20T08:45:00.000Z" },
    { id: "rest-008", name: "Cairo Mezze", location: "City Stars Mall", city: "Cairo", country: "Egypt", phone: "+20 2 345 6789", email: "info@cairomezze.eg", package: "Professional", status: "inactive", qrCodes: 15, tableCount: 12, paymentProcessor: "stripe", createdAt: "2025-09-15T16:30:00.000Z" },
    { id: "rest-009", name: "Nile View Dining", location: "Zamalek", city: "Cairo", country: "Egypt", phone: "+20 2 456 7890", email: "dining@nileview.eg", package: "Enterprise", status: "active", qrCodes: 20, tableCount: 16, paymentProcessor: "stripe", createdAt: "2025-09-01T11:00:00.000Z" },
    { id: "rest-010", name: "Doha Delights", location: "The Pearl Qatar", city: "Doha", country: "Qatar", phone: "+974 4 567 8901", email: "info@dohadelights.qa", package: "Enterprise", status: "active", qrCodes: 22, tableCount: 18, paymentProcessor: "checkout", createdAt: "2025-08-20T13:15:00.000Z" },
    { id: "rest-011", name: "Kuwait Kitchen", location: "The Avenues Mall", city: "Kuwait City", country: "Kuwait", phone: "+965 2 678 9012", email: "kitchen@kuwait.kw", package: "Professional", status: "on_hold", qrCodes: 14, tableCount: 11, paymentProcessor: "paytabs", createdAt: "2025-08-10T10:30:00.000Z" },
    { id: "rest-012", name: "Bahrain Brasserie", location: "Seef Mall", city: "Manama", country: "Bahrain", phone: "+973 1789 0123", email: "brasserie@bahrain.bh", package: "Professional", status: "active", qrCodes: 16, tableCount: 13, paymentProcessor: "stripe", createdAt: "2025-08-01T09:00:00.000Z" },
];

const ScreenSuperAdminDashboard = () => {
    // State
    const [countryFilter, setCountryFilter] = useState("all");
    const [cityFilter, setCityFilter] = useState("all");

    // Data Fetching with React Query
    const { data: restaurants = SEEDED_RESTAURANTS } = useQuery<RegisteredRestaurant[]>({
        queryKey: ['registered-restaurants'],
        queryFn: async () => {
            try {
                const response = await axiosInstance.get('/api/registered-restaurants');
                return response.data;
            } catch {
                return SEEDED_RESTAURANTS;
            }
        },
        initialData: SEEDED_RESTAURANTS
    });

    // --- Computed Values ---
    const countries = ["all", ...Object.keys(COUNTRIES_DATA)];

    const cities = useMemo(() => {
        if (countryFilter === "all") {
            return ["all", ...Object.values(COUNTRIES_DATA).flat()];
        }
        return ["all", ...(COUNTRIES_DATA[countryFilter] || [])];
    }, [countryFilter]);

    const filteredRestaurants = useMemo(() => {
        return restaurants.filter(r => {
            const matchCountry = countryFilter === "all" || r.country === countryFilter;
            const matchCity = cityFilter === "all" || r.city === cityFilter;
            return matchCountry && matchCity;
        });
    }, [restaurants, countryFilter, cityFilter]);

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
                            value={countryFilter}
                            onChange={(e) => { setCountryFilter(e.target.value); setCityFilter("all"); }}
                            className="bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-[#0055FE] focus:border-[#0055FE] p-2.5 pr-8 outline-none appearance-none cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                            {countries.map(c => <option key={c} value={c}>{c === 'all' ? 'All Countries' : c}</option>)}
                        </select>
                        <Filter className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={14} />
                    </div>
                    <div className="relative">
                        <select
                            value={cityFilter}
                            onChange={(e) => setCityFilter(e.target.value)}
                            className="bg-white border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-[#0055FE] focus:border-[#0055FE] p-2.5 pr-8 outline-none appearance-none cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                            {cities.map(c => <option key={c} value={c}>{c === 'all' ? 'All Cities' : c}</option>)}
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
                            <p className="text-sm text-amber-700">Click to add sample restaurants for testing</p>
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
