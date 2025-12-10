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
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  MoreVertical
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
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend);

// --- COMPONENTS ---

// 1. METRIC CARDS
// Spec: Left: Title (slate-500), Value (slate-900), Change (green/red). Right: Icon (Royal Blue) in container (bg-[#0055FE]/10)
const MetricCard = ({ title, value, subtext, icon: Icon, trend, isPositive = true }: any) => (
  <div className="bg-white p-5 rounded-lg border border-slate-200 flex justify-between items-start">
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{title}</p>
      <h3 className="text-2xl font-semibold text-slate-900 mb-1">{value}</h3>
      <div className="flex items-center gap-2">
        {trend && (
          <span className={`text-xs font-medium flex items-center ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {trend}
          </span>
        )}
        <span className="text-xs text-slate-400">{subtext}</span>
      </div>
    </div>
    <div className="w-10 h-10 rounded-lg bg-[#0055FE]/10 flex items-center justify-center text-[#0055FE]">
      <Icon size={20} />
    </div>
  </div>
);

// 2. REVENUE CHART
// Spec: Gradient #0055FE (8% -> 0%), Line stroke 1.5px, Dashed grid
const SalesChart = ({ data, labels }: { data: number[], labels: string[] }) => {
  const chartData = {
    labels: labels,
    datasets: [
      {
        label: 'Revenue',
        data: data,
        borderColor: '#0055FE',
        borderWidth: 1.5,
        backgroundColor: (context: ScriptableContext<"line">) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(0, 85, 254, 0.08)'); // 8% opacity
          gradient.addColorStop(1, 'rgba(0, 85, 254, 0)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 0, // Clean look
        pointHoverRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#FFFFFF',
        titleColor: '#0F172A',
        bodyColor: '#475569',
        borderColor: '#E2E8F0',
        borderWidth: 1,
        padding: 12,
        titleFont: { size: 13, weight: 'bold' as const },
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
        ticks: { color: '#94a3b8', font: { size: 11 } }
      },
      y: {
        grid: { color: '#f1f5f9', borderDash: [4, 4] },
        ticks: { color: '#94a3b8', font: { size: 11 }, callback: (val: any) => `$${val}` },
        min: 0,
      },
    },
  };

  return <Line data={chartData} options={options} />;
};

const ScreenRestaurantDashboard = () => {
  const {
    foodItems,
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
    <div className="flex flex-col gap-6">

      {/* METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Total Revenue"
          value={analyticsLoading ? "..." : `$${analytics?.status?.today_total_completed_order_price || 0}`}
          trend={`${analytics?.status?.weekly_growth || 0}%`}
          isPositive={(analytics?.status?.weekly_growth || 0) >= 0}
          subtext="vs last week"
          icon={TrendingUp}
        />
        <MetricCard
          title="Total Orders"
          value={analyticsLoading ? "..." : analytics?.status?.today_total_completed_order || 0}
          subtext="Processed today"
          trend="12%"
          isPositive={true}
          icon={ShoppingBag}
        />
        <MetricCard
          title="Active Staff"
          value={analyticsLoading ? "..." : analytics?.status?.total_member || 0}
          subtext="Currently online"
          trend="0%"
          isPositive={true}
          icon={Users}
        />
      </div>

      {/* REVENUE CHART */}
      <div className="bg-white p-5 rounded-lg border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Revenue Analytics</h3>
            <p className="text-xs text-slate-500 mt-0.5">Monthly revenue performance</p>
          </div>
          <button className="flex items-center gap-2 h-8 px-3 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50">
            <Calendar size={14} className="text-[#0055FE]" />
            This Year
          </button>
        </div>
        <div className="h-[280px]">
          <SalesChart data={chartValues} labels={chartLabels} />
        </div>
      </div>

      {/* CONTENT GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* FOOD ITEMS TABLE (Left, 2 cols) */}
        <div className="xl:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden">
          {/* Header Bar */}
          <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-900">Food Items</h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search..."
                  className="h-8 pl-8 pr-3 text-xs border border-slate-200 rounded-lg outline-none focus:border-[#0055FE] w-32 sm:w-48"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <button className="h-8 px-3 bg-[#0055FE] hover:bg-[#0047D1] text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors">
                <Plus size={14} /> Add Item
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-xs font-medium text-slate-600">Item Name</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-600">Price</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-600">Status</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {foodItems.length > 0 ? (
                  foodItems.slice(0, 5).map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden shrink-0">
                            {item.image ? (
                              <img src={item.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">Img</div>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{item.item_name}</p>
                            {item.category && <p className="text-[10px] text-slate-500">{item.category}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600 font-medium">${item.price}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${item.availability ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                          }`}>
                          {item.availability ? 'Available' : 'Unavailable'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-3 text-xs font-medium">
                          <button className="text-[#0055FE] hover:underline">Edit</button>
                          <button className="text-red-500 hover:underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-xs text-slate-400">No items found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-slate-200 text-center">
            <button
              onClick={() => setCurrentPage(p => p + 1)} // Simple navigation for now
              className="text-xs text-[#0055FE] font-medium hover:underline"
            >
              View All Items
            </button>
          </div>
        </div>

        {/* MOST SELLING ITEMS (Right Sidebar) */}
        <div className="bg-white p-5 rounded-lg border border-slate-200 h-fit">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Most Selling</h3>
            <button className="p-1 rounded hover:bg-slate-50 text-slate-400">
              <MoreVertical size={14} />
            </button>
          </div>

          <div className="space-y-4">
            {sellingItemData && sellingItemData.length > 0 ? (
              sellingItemData.slice(0, 5).map((item: any, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-700">{item.item_name}</span>
                    <span className="text-slate-500">{item.percentage || '0%'}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0055FE] rounded-full"
                      style={{ width: `${Math.min((item.total_sold / 100) * 100, 100)}%` }} // Rough percentage calc if backend doesn't send %
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">No data available</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ScreenRestaurantDashboard;
