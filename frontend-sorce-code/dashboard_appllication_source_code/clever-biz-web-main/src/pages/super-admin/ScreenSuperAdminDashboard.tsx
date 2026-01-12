import { useState, useMemo } from "react";
import { Users, TrendingUp, Filter, Database, BarChart3, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, eachMonthOfInterval } from "date-fns";

// TypeScript Interfaces
interface RegisteredRestaurant {
    id: string;
    name: string;
    city: string;
    country: string;
    phone: string;
    package: string;
    status: 'active' | 'on_hold' | 'inactive';
    created_at?: string;
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

const ScreenSuperAdminDashboard = () => {
    // State
    const [countryFilter, setCountryFilter] = useState("all");
    const [cityFilter, setCityFilter] = useState("all");

    // Mock Data for initial render
    const mockRestaurants: RegisteredRestaurant[] = [
        { id: "1", name: "Bella Italia", city: "Dubai", country: "UAE", phone: "+971 50 123 4567", package: "Pro", status: "active", created_at: "2025-11-15" },
        { id: "2", name: "Sushi Master", city: "Riyadh", country: "Saudi Arabia", phone: "+966 50 987 6543", package: "Business", status: "active", created_at: "2025-12-01" },
        { id: "3", name: "Burger King", city: "Doha", country: "Qatar", phone: "+974 55 123 456", package: "Basic", status: "on_hold", created_at: "2025-12-20" },
        { id: "4", name: "Pizza Hut", city: "Dubai", country: "UAE", phone: "+971 52 555 1234", package: "Enterprise", status: "active", created_at: "2026-01-05" },
        { id: "5", name: "Taco Bell", city: "Manama", country: "Bahrain", phone: "+973 33 444 555", package: "Pro", status: "inactive", created_at: "2025-10-10" },
        { id: "6", name: "La Mer", city: "Dubai", country: "UAE", phone: "+971 4 333 2222", package: "Basic", status: "active", created_at: "2025-09-25" },
        { id: "7", name: "Chai Karak", city: "Doha", country: "Qatar", phone: "+974 66 777 888", package: "Basic", status: "active", created_at: "2025-08-15" },
    ];

    const restaurants = mockRestaurants;

    // --- Computed Values ---

    // 1. Countries & Cities for filters
    const countries = ["all", ...Object.keys(COUNTRIES_DATA)];

    const cities = useMemo(() => {
        if (countryFilter === "all") {
            return ["all", ...Object.values(COUNTRIES_DATA).flat()];
        }
        return ["all", ...(COUNTRIES_DATA[countryFilter] || [])];
    }, [countryFilter]);

    // 2. Filtered Data
    const filteredRestaurants = useMemo(() => {
        return restaurants.filter(r => {
            const matchCountry = countryFilter === "all" || r.country === countryFilter;
            const matchCity = cityFilter === "all" || r.city === cityFilter;
            return matchCountry && matchCity;
        });
    }, [restaurants, countryFilter, cityFilter]);

    // 3. Stats
    const totalSubscribers = filteredRestaurants.length;
    const activeToday = filteredRestaurants.filter(r => r.status === 'active').length;

    // 4. Monthly Growth Chart Data using date-fns
    const growthData = useMemo(() => {
        const now = new Date();
        const sixMonthsAgo = subMonths(now, 5);

        // Get array of last 6 months
        const months = eachMonthOfInterval({
            start: startOfMonth(sixMonthsAgo),
            end: startOfMonth(now)
        });

        return months.map(month => {
            const monthStart = startOfMonth(month);
            const monthEnd = endOfMonth(month);

            // Count restaurants created in this month
            const count = restaurants.filter(r => {
                if (!r.created_at) return false;
                const createdDate = new Date(r.created_at);
                return isWithinInterval(createdDate, { start: monthStart, end: monthEnd });
            }).length;

            return {
                month: format(month, "MMM"),
                count
            };
        });
    }, [restaurants]);

    // Calculate max for Y-axis scale (minimum 5)
    const maxCount = Math.max(5, ...growthData.map(d => d.count));

    // Generate Y-axis labels
    const yAxisLabels = useMemo(() => {
        const step = Math.ceil(maxCount / 4);
        return [0, step, step * 2, step * 3, maxCount].filter((v, i, a) => a.indexOf(v) === i);
    }, [maxCount]);

    // Add sample data
    const handleAddSampleData = () => {
        toast.success("Sample restaurants added for testing!");
    };

    // Recent subscribers (last 3)
    const recentSubscribers = filteredRestaurants.slice(0, 3);

    return (
        <div className="space-y-6 animate-fadeIn font-inter">

            {/* --- Filter Section --- */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
                    <p className="text-sm text-slate-500">Platform performance metrics</p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none">
                        <select
                            value={countryFilter}
                            onChange={(e) => { setCountryFilter(e.target.value); setCityFilter("all"); }}
                            className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-[#0055FE] focus:border-[#0055FE] block w-full p-2.5 outline-none appearance-none pr-8 cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                            {countries.map(c => <option key={c} value={c}>{c === 'all' ? 'All Countries' : c}</option>)}
                        </select>
                        <Filter className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={14} />
                    </div>

                    <div className="relative flex-1 sm:flex-none">
                        <select
                            value={cityFilter}
                            onChange={(e) => setCityFilter(e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-[#0055FE] focus:border-[#0055FE] block w-full p-2.5 outline-none appearance-none pr-8 cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                            {cities.map(c => <option key={c} value={c}>{c === 'all' ? 'All Cities' : c}</option>)}
                        </select>
                        <Filter className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={14} />
                    </div>
                </div>
            </div>

            {/* --- Sample Data Banner (Only when no real data) --- */}
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
                    <button
                        onClick={handleAddSampleData}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
                    >
                        Add Sample Data
                    </button>
                </div>
            )}

            {/* --- Stats Cards --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Total Subscribers */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-colors">
                    <div className="flex justify-between items-start z-10 relative">
                        <div>
                            <p className="text-xs font-medium text-slate-500 mb-1">Total Subscribers</p>
                            <h3 className="text-3xl font-bold text-slate-900">{totalSubscribers}</h3>
                            <span className="text-xs text-[#0055FE] bg-blue-50 px-2 py-0.5 rounded-full mt-2 inline-block">Restaurants</span>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-xl text-[#0055FE]">
                            <Users size={24} />
                        </div>
                    </div>
                    {/* Mini SVG Chart */}
                    <div className="absolute bottom-0 right-0 w-32 opacity-20 group-hover:opacity-30 transition-opacity">
                        <svg viewBox="0 0 100 40" className="w-full h-auto text-[#0055FE] fill-current">
                            <path d="M0,40 L0,20 Q25,10 50,25 T100,10 L100,40 Z" />
                        </svg>
                    </div>
                </div>

                {/* Active Today */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-green-200 transition-colors">
                    <div className="flex justify-between items-start z-10 relative">
                        <div>
                            <p className="text-xs font-medium text-slate-500 mb-1">Active Today</p>
                            <h3 className="text-3xl font-bold text-slate-900">{activeToday}</h3>
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full mt-2 inline-block">Operating</span>
                        </div>
                        <div className="p-3 bg-green-50 rounded-xl text-green-600">
                            <TrendingUp size={24} />
                        </div>
                    </div>
                    {/* Mini SVG Chart */}
                    <div className="absolute bottom-0 right-0 w-32 opacity-20 group-hover:opacity-30 transition-opacity">
                        <svg viewBox="0 0 100 40" className="w-full h-auto text-green-500 fill-current">
                            <path d="M0,40 L0,30 Q25,15 50,30 T100,5 L100,40 Z" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* --- Subscriber Growth Chart --- */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                    <BarChart3 size={18} className="text-slate-400" />
                    <h3 className="text-lg font-semibold text-slate-900">Subscribers</h3>
                </div>

                <div className="flex gap-4">
                    {/* Y-Axis Labels */}
                    <div className="flex flex-col justify-between h-48 text-right pr-2 py-2">
                        {[...yAxisLabels].reverse().map((label, idx) => (
                            <span key={idx} className="text-xs text-slate-400">{label}</span>
                        ))}
                    </div>

                    {/* Chart Bars */}
                    <div className="flex-1 h-48 flex items-end justify-between gap-2 sm:gap-4">
                        {growthData.map((item, idx) => {
                            const heightPercent = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                            return (
                                <div key={idx} className="flex flex-col items-center gap-2 group flex-1">
                                    <div className="relative w-full max-w-[40px] flex items-end justify-center h-40">
                                        {/* Tooltip */}
                                        <span className="absolute -top-6 text-[10px] font-bold text-[#0055FE] opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white px-2 py-1 rounded shadow-sm border border-slate-100">
                                            {item.count}
                                        </span>
                                        {/* Bar */}
                                        <div
                                            className="w-full bg-gradient-to-t from-[#0055FE] to-[#0055FE]/60 rounded-t-lg transition-all duration-700 group-hover:to-[#0055FE]/80"
                                            style={{ height: `${heightPercent}%`, minHeight: item.count > 0 ? '8px' : '0' }}
                                        />
                                    </div>
                                    <span className="text-xs font-medium text-slate-500">{item.month}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* --- Recent Subscribers Section --- */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-slate-900">Recent Subscribers</h3>
                    <button className="text-xs font-medium text-[#0055FE] hover:underline">View All</button>
                </div>

                {/* Restaurant Cards */}
                <div className="divide-y divide-slate-100">
                    {recentSubscribers.length > 0 ? recentSubscribers.map((restaurant) => (
                        <div key={restaurant.id} className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-medium text-slate-900 truncate">{restaurant.name}</h4>
                                <p className="text-xs text-slate-500">{restaurant.city}, {restaurant.country}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`
                                    inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize
                                    ${restaurant.status === 'active' ? 'bg-green-100 text-green-700' : ''}
                                    ${restaurant.status === 'on_hold' ? 'bg-amber-100 text-amber-700' : ''}
                                    ${restaurant.status === 'inactive' ? 'bg-slate-100 text-slate-600' : ''}
                                `}>
                                    {restaurant.status.replace('_', ' ')}
                                </span>
                                <button className="text-xs font-medium text-[#0055FE] hover:underline flex items-center gap-1">
                                    <Eye size={14} />
                                    View
                                </button>
                            </div>
                        </div>
                    )) : (
                        <div className="p-8 text-center text-slate-400 text-sm">
                            No restaurants found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ScreenSuperAdminDashboard;
