import { useState, useMemo } from "react";
import { Users, TrendingUp, Search, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import axiosInstance from "@/lib/axios";

// TypeScript Interfaces
interface RegisteredRestaurant {
    id: string;
    name: string;
    city: string;
    country: string;
    phone: string;
    package: string;
    status: 'active' | 'on_hold' | 'inactive';
    created_at?: string; // API might return snake_case or date string
}

const ScreenSuperAdminDashboard = () => {
    // State
    const [countryFilter, setCountryFilter] = useState("all");
    const [cityFilter, setCityFilter] = useState("all");

    // Mock Data for initial render (mimicking API response structure)
    // In real app, this would be replaced by useQuery fetching /api/registered-restaurants
    const mockRestaurants: RegisteredRestaurant[] = [
        { id: "1", name: "Bella Italia", city: "Dubai", country: "UAE", phone: "+971 50 123 4567", package: "Pro", status: "active" },
        { id: "2", name: "Sushi Master", city: "Riyadh", country: "KSA", phone: "+966 50 987 6543", package: "Business", status: "active" },
        { id: "3", name: "Burger King", city: "Doha", country: "Qatar", phone: "+974 55 123 456", package: "Basic", status: "on_hold" },
        { id: "4", name: "Pizza Hut", city: "Dubai", country: "UAE", phone: "+971 52 555 1234", package: "Enterprise", status: "active" },
        { id: "5", name: "Taco Bell", city: "Manama", country: "Bahrain", phone: "+973 33 444 555", package: "Pro", status: "inactive" },
        { id: "6", name: "La Mer", city: "Dubai", country: "UAE", phone: "+971 4 333 2222", package: "Basic", status: "active" },
        { id: "7", name: "Chai Karak", city: "Doha", country: "Qatar", phone: "+974 66 777 888", package: "Basic", status: "active" },
    ];

    // Simulating Data Fetch
    const restaurants = mockRestaurants;
    // NOTE: Uncomment below when API endpoint exists
    /*
    const { data: restaurants = [] } = useQuery({
        queryKey: ['registered-restaurants'],
        queryFn: async () => {
            const res = await axiosInstance.get('/api/registered-restaurants');
            return res.data;
        },
        initialData: mockRestaurants
    });
    */

    // --- Computed Values ---

    // 1. Unique Countries & Cities
    const countries = useMemo(() => ["all", ...new Set(restaurants.map(r => r.country))], [restaurants]);

    const cities = useMemo(() => {
        if (countryFilter === "all") return ["all", ...new Set(restaurants.map(r => r.city))];
        return ["all", ...new Set(restaurants.filter(r => r.country === countryFilter).map(r => r.city))];
    }, [restaurants, countryFilter]);

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

    // 4. Simulated Monthly Logic (Randomized strictly for UI demo as we don't have real dates in mock yet)
    // In production, parse `created_at`
    const growthData = [
        { month: 'Jul', count: 45 },
        { month: 'Aug', count: 62 },
        { month: 'Sep', count: 78 },
        { month: 'Oct', count: 95 },
        { month: 'Nov', count: 110 },
        { month: 'Dec', count: totalSubscribers * 10 + 20 } // Simulated scale
    ];


    return (
        <div className="space-y-6 animate-fadeIn">

            {/* --- Filter Section --- */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">Overview</h2>
                    <p className="text-sm text-slate-500">Platform performance metrics</p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none">
                        <select
                            value={countryFilter}
                            onChange={(e) => { setCountryFilter(e.target.value); setCityFilter("all"); }}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-[#0055FE] focus:border-[#0055FE] block w-full p-2.5 outline-none appearance-none pr-8 cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                            {countries.map(c => <option key={c} value={c}>{c === 'all' ? 'All Countries' : c}</option>)}
                        </select>
                        <Filter className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={14} />
                    </div>

                    <div className="relative flex-1 sm:flex-none">
                        <select
                            value={cityFilter}
                            onChange={(e) => setCityFilter(e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-[#0055FE] focus:border-[#0055FE] block w-full p-2.5 outline-none appearance-none pr-8 cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                            {cities.map(c => <option key={c} value={c}>{c === 'all' ? 'All Cities' : c}</option>)}
                        </select>
                        <Filter className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={14} />
                    </div>
                </div>
            </div>

            {/* --- Stats Cards --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Total Subscribers */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-colors">
                    <div className="flex justify-between items-start z-10 relative">
                        <div>
                            <p className="text-sm font-medium text-slate-500 mb-1">Total Subscribers</p>
                            <h3 className="text-3xl font-bold text-slate-900">{totalSubscribers}</h3>
                            <span className="text-xs font-semibold text-[#0055FE] bg-blue-50 px-2 py-0.5 rounded-full mt-2 inline-block">Restaurants</span>
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
                            <p className="text-sm font-medium text-slate-500 mb-1">Active Today</p>
                            <h3 className="text-3xl font-bold text-slate-900">{activeToday}</h3>
                            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full mt-2 inline-block">Operating</span>
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
                <h3 className="text-base font-bold text-slate-900 mb-6">Subscriber Growth</h3>
                <div className="h-48 flex items-end justify-between gap-2 sm:gap-4 px-2">
                    {growthData.map((item, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-2 group w-full">
                            <div className="relative w-full max-w-[40px] flex items-end justify-center h-40 bg-slate-50 rounded-t-lg overflow-hidden">
                                <span className="absolute -top-6 text-[10px] font-bold text-[#0055FE] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    {item.count}
                                </span>
                                <div
                                    className="w-full bg-gradient-to-t from-[#0055FE] to-[#0055FE]/60 rounded-t-lg transition-all duration-700 group-hover:to-[#0055FE]/80"
                                    style={{ height: `${(item.count / 200) * 100}%` }} // Simplified scaling
                                ></div>
                            </div>
                            <span className="text-xs font-medium text-slate-500">{item.month}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- Recent Subscribers Table --- */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-base font-bold text-slate-900">Recent Subscribers</h3>
                    <button className="text-xs font-medium text-[#0055FE] hover:underline">View All</button>
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                            <tr>
                                <th className="px-6 py-3 border-b border-slate-200">Restaurant</th>
                                <th className="px-6 py-3 border-b border-slate-200">City</th>
                                <th className="px-6 py-3 border-b border-slate-200">Phone</th>
                                <th className="px-6 py-3 border-b border-slate-200">Package</th>
                                <th className="px-6 py-3 border-b border-slate-200 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredRestaurants.length > 0 ? filteredRestaurants.map((restaurant) => (
                                <tr key={restaurant.id} className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
                                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                                        {restaurant.name}
                                        <div className="text-[10px] text-slate-400 font-normal lg:hidden">{restaurant.country}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-600">{restaurant.city}</td>
                                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{restaurant.phone || '-'}</td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-[#0055FE] border border-blue-100">
                                            {restaurant.package}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`
                                            inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize
                                            ${restaurant.status === 'active' ? 'bg-green-50 text-green-700 border border-green-200' : ''}
                                            ${restaurant.status === 'on_hold' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : ''}
                                            ${restaurant.status === 'inactive' ? 'bg-red-50 text-red-700 border border-red-200' : ''}
                                        `}>
                                            {restaurant.status.replace('_', ' ')}
                                        </span>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">
                                        No restaurants found matching filter.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                    {filteredRestaurants.length > 0 ? filteredRestaurants.map((restaurant) => (
                        <div key={restaurant.id} className="p-4 space-y-2 hover:bg-slate-50 transition-colors">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900">{restaurant.name}</h4>
                                    <p className="text-xs text-slate-500">{restaurant.city}, {restaurant.country}</p>
                                </div>
                                <span className={`
                                    inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize
                                     ${restaurant.status === 'active' ? 'bg-green-100 text-green-700' : ''}
                                     ${restaurant.status === 'on_hold' ? 'bg-yellow-100 text-yellow-700' : ''}
                                     ${restaurant.status === 'inactive' ? 'bg-red-100 text-red-700' : ''}
                                `}>
                                    {restaurant.status.replace('_', ' ')}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-mono text-slate-600">{restaurant.phone}</span>
                                <span className="text-[#0055FE] font-medium bg-blue-50 px-2 py-0.5 rounded">{restaurant.package}</span>
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
