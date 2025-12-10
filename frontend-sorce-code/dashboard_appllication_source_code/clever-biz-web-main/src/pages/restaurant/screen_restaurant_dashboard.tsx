/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from "react";
import { useOwner } from "@/context/ownerContext";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import {
  TrendingUp,
  ShoppingBag,
  Users,
  Search,
  Plus,
  MoreHorizontal,
  ArrowUpRight,
  Loader2
} from "lucide-react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
  ScriptableContext
} from "chart.js";

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

// --- COMPONENTS ---

const MetricCard = ({ title, value, subtext, icon: Icon, trend }: any) => (
  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900 mb-1">{value}</h3>
      <p className="text-xs text-slate-400 flex items-center gap-1">
        {trend && <span className="text-emerald-500 font-medium flex items-center"><ArrowUpRight size={12} /> {trend}</span>}
        {subtext}
      </p>
    </div>
    <div className="w-10 h-10 rounded-lg bg-[#0055FE]/10 flex items-center justify-center text-[#0055FE]">
      <Icon size={20} />
    </div>
  </div>
);

const SalesChart = ({ data, labels }: { data: number[], labels: string[] }) => {
  const chartData = {
    labels: labels,
    datasets: [
      {
        label: 'Revenue',
        data: data,
        borderColor: '#0055FE',
        backgroundColor: (context: ScriptableContext<"line">) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 400);
          gradient.addColorStop(0, 'rgba(0, 85, 254, 0.2)');
          gradient.addColorStop(1, 'rgba(0, 85, 254, 0)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#FFFFFF',
        pointBorderColor: '#0055FE',
        pointBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#1E293B',
        padding: 12,
        titleFont: { size: 13 },
        bodyFont: { size: 13 },
        displayColors: false,
        callbacks: {
          label: (context: any) => `$${context.parsed.y}`
        }
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748B', font: { size: 11 } }
      },
      y: {
        grid: { color: '#F1F5F9' },
        ticks: { color: '#64748B', font: { size: 11 }, callback: (val: any) => `$${val}` },
        min: 0,
      },
    },
  };

  return <Line data={chartData} options={options} />;
};

const ScreenRestaurantDashboard = () => {
  const {
    foodItems,
    foodItemsCount,
    currentPage,
    searchQuery,
    fetchFoodItems,
    setCurrentPage,
    setSearchQuery,
  } = useOwner();

  // State
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [sellingItemData, setSellingItemData] = useState([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Handlers
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchFoodItems(currentPage, debouncedSearchQuery);
  }, [currentPage, debouncedSearchQuery, fetchFoodItems]);

  const fetchMostSellingItems = useCallback(async () => {
    try {
      const response = await axiosInstance.get("/owners/most-selling-items/");
      setSellingItemData(response.data);
    } catch (error) {
      console.error("Failed to fetch most selling items:", error);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const response = await axiosInstance.get("/owners/orders/analytics/");
      setAnalytics(response.data);
    } catch (error) {
      toast.error("Failed to load analytics data.");
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMostSellingItems();
    fetchAnalytics();
  }, [fetchMostSellingItems, fetchAnalytics]);

  // Chart Data Preparation
  const chartLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const chartValues = analytics?.current_year ? Object.values(analytics.current_year) as number[] : Array(12).fill(0);

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 font-inter">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Overview</h1>
          <p className="text-slate-500 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="bg-white px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
            Export Report
          </button>
          <button className="bg-[#0055FE] px-4 py-2 rounded-lg text-white text-sm font-medium hover:bg-[#0047D1] transition-colors shadow-lg shadow-blue-500/20">
            + Add New Item
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <MetricCard
          title="Total Revenue"
          value={analyticsLoading ? "..." : `$${analytics?.status?.today_total_completed_order_price || 0}`}
          subtext="Today's earnings"
          icon={TrendingUp}
          trend={analytics?.status?.weekly_growth ? `${analytics.status.weekly_growth}%` : "0%"}
        />
        <MetricCard
          title="Total Orders"
          value={analyticsLoading ? "..." : analytics?.status?.today_total_completed_order || 0}
          subtext="Orders processed today"
          icon={ShoppingBag}
        />
        <MetricCard
          title="Team Members"
          value={analyticsLoading ? "..." : analytics?.status?.total_member || 0}
          subtext="Active staff"
          icon={Users}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left Column (Chart + Table) */}
        <div className="xl:col-span-2 space-y-6">
          {/* Chart Section */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">Revenue Analytics</h3>
              <select className="bg-slate-50 border-none text-sm text-slate-600 rounded-lg px-3 py-1 cursor-pointer outline-none focus:ring-2 focus:ring-[#0055FE]/20">
                <option>This Year</option>
                <option>Last Year</option>
              </select>
            </div>
            <div className="h-[300px] w-full">
              <SalesChart data={chartValues} labels={chartLabels} />
            </div>
          </div>

          {/* Food Items Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-slate-900">Popular Items</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search items..."
                  className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 w-full sm:w-64"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-4">Item Name</th>
                    <th className="px-6 py-4">Price</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {foodItems.length > 0 ? (
                    foodItems.map((item: any) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden">
                              <img src={item.image} alt="" className="w-full h-full object-cover" />
                            </div>
                            <span className="font-medium text-slate-900">{item.item_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-medium">${item.price}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${item.availability
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-slate-100 text-slate-500"
                            }`}>
                            {item.availability ? "Available" : "Unavailable"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button className="p-2 rounded-lg text-slate-400 hover:text-[#0055FE] hover:bg-[#0055FE]/5 transition-colors">
                            <MoreHorizontal size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                        No items found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination (Simple) */}
            <div className="p-4 border-t border-slate-200 flex justify-center">
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p: number) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-slate-600 self-center">Page {currentPage}</span>
                <button
                  onClick={() => setCurrentPage((p: number) => p + 1)}
                  disabled={foodItems.length < 10} // Assuming 10 items per page limit from backend or context
                  className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (Most Selling) */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-full">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Top Selling Items</h3>
            <div className="space-y-6">
              {sellingItemData && sellingItemData.length > 0 ? (
                sellingItemData.slice(0, 5).map((item: any, index: number) => (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700 truncate max-w-[150px]">{item.item_name}</span>
                      <span className="text-sm font-bold text-slate-900">{item.total_sold} sold</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0055FE] rounded-full"
                        style={{ width: `${Math.min((item.total_sold / 100) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-slate-500 text-center py-10">No sales data yet.</p>
              )}
            </div>
            <div className="mt-8 pt-6 border-t border-slate-100">
              <button className="w-full py-2.5 text-sm font-medium text-[#0055FE] bg-[#0055FE]/5 rounded-lg hover:bg-[#0055FE]/10 transition-colors">
                View Full Report
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ScreenRestaurantDashboard;
