import { useEffect, useState, useCallback, useContext, useRef } from "react";
import { useOwner } from "@/context/ownerContext";
import { useRole } from "@/hooks/useRole";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { WebSocketContext } from "@/hooks/WebSocketProvider";
import {
  TrendingUp,
  ShoppingBag,
  Users,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  MoreVertical,
  FolderPlus,
  Layers,
  Pencil,
  Trash2,
  X,
  Upload,
  Lock,
  Video
} from "lucide-react";
import { RevenueAnalyticsChart } from "@/components/analytics/RevenueAnalyticsChart";
import { TimeRangeToggle } from "@/components/analytics/TimeRangeToggle";
import { useRestaurantContext } from "@/lib/useRestaurantContext";




const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 py-8 backdrop-blur-sm animate-fadeIn overflow-y-auto"
    >
      <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl animate-scaleIn my-auto max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 sticky top-0 bg-white pb-2 -mt-2 pt-2 border-b border-transparent">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 p-1 transition-colors">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
};

// --- COMPONENTS ---

// 1. METRIC CARDS
// Spec: Left: Title (slate-500), Value (slate-900), Change (green/red). Right: Icon (Royal Blue) in container (bg-[#0055FE]/10)
const MetricCard = ({ title, value, subtext, icon: Icon, trend, isPositive = true, featured = false }: any) => (
  <div className={`bg-white ${featured ? "p-7 min-h-[132px]" : "p-5"} rounded-lg border border-slate-200 flex justify-between items-start`}>
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

const toNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatInputDate = (date: Date) => date.toISOString().slice(0, 10);

const normalizeSalesAnalytics = (payload: any) => {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.sales)
        ? payload.sales
        : Array.isArray(payload?.chart)
          ? payload.chart
          : [];

  if (Array.isArray(payload?.labels)) {
    return {
      labels: payload.labels,
      revenue: (payload.revenue || payload.values || []).map(toNumber),
      orders: (payload.orders || payload.orderCounts || payload.order_counts || []).map(toNumber),
    };
  }

  return {
    labels: rows.map((row: any) => row.label || row.date || row.day || row.hour || ""),
    revenue: rows.map((row: any) => toNumber(row.revenue || row.totalRevenue || row.total_revenue || row.sales || row.amount)),
    orders: rows.map((row: any) => toNumber(row.orders || row.totalOrders || row.total_orders || row.order_count || row.count)),
  };
};

// 2. REVENUE CHART
// Spec: Gradient #0055FE (8% -> 0%), Line stroke 1.5px, Dashed grid


const ScreenRestaurantDashboard = () => {
  const { fmt } = useRestaurantContext();
  const {
    foodItems,
    currentPage,
    setCurrentPage,
    searchQuery,
    setSearchQuery,
    fetchFoodItems,
    updateAvailability,

    categories,
    subCategories,
    fetchCategories,
    fetchSubCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    createSubCategory,
    updateSubCategory,
    deleteSubCategory,

    // Consumed from Context (Render-First)
    analytics,
    sellingItems: sellingItemData, // Alias to match existing usage
    isAnalyticsLoading: analyticsLoading, // Alias
    fetchAnalytics,
    fetchMostSellingItems
  } = useOwner();

  const { userRole, isLoading } = useRole();
  const { response } = useContext(WebSocketContext);

  // State
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  // Removed local sellingItemData state (using Context)
  // Removed local analytics state (using Context)

  const [timeRange, setTimeRange] = useState("year");
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [selectedDate, setSelectedDate] = useState(formatInputDate(new Date()));
  const [dailyStats, setDailyStats] = useState<any>(null);
  const [dailyStatsLoading, setDailyStatsLoading] = useState(false);
  const [salesAnalytics, setSalesAnalytics] = useState<{ labels: string[]; revenue: number[]; orders: number[] } | null>(null);
  const [salesAnalyticsLoading, setSalesAnalyticsLoading] = useState(false);

  const [isEdit, setIsEdit] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<any>(null);

  // Category Management State
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showEditCategory, setShowEditCategory] = useState(false);
  const [showDeleteCategory, setShowDeleteCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<any>(null);

  const [showAddSubCategory, setShowAddSubCategory] = useState(false);
  const [showEditSubCategory, setShowEditSubCategory] = useState(false);
  const [showDeleteSubCategory, setShowDeleteSubCategory] = useState(false);
  const [editingSubCategory, setEditingSubCategory] = useState<any>(null);
  const [subCategoryToDelete, setSubCategoryToDelete] = useState<any>(null);

  // Generic Form Data
  const [catFormData, setCatFormData] = useState({ name: "", image: null as File | null });
  const [subCatFormData, setSubCatFormData] = useState({ Category_name: "", parent_category: "", image: null as File | null });


  // Add Item State
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemFormData, setItemFormData] = useState({ item_name: "", price: "", description: "", category: "", sub_category: "", discount_percentage: "" as string | number, image1: null as File | null, video: null as File | null });
  const [isViewAll, setIsViewAll] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDailyStats = useCallback(async () => {
    if (userRole !== "owner" && userRole !== "manager") return;
    setDailyStatsLoading(true);
    try {
      const response = await axiosInstance.get("/api/daily-stats");
      setDailyStats(response.data?.data || response.data);
    } catch (err) {
      console.error("Failed to load daily stats", err);
    } finally {
      setDailyStatsLoading(false);
    }
  }, [userRole]);

  const fetchSalesAnalytics = useCallback(async () => {
    if ((userRole !== "owner" && userRole !== "manager") || !selectedDate) return;
    setSalesAnalyticsLoading(true);
    try {
      const startDate = new Date(`${selectedDate}T00:00:00.000`);
      const endDate = new Date(`${selectedDate}T23:59:59.999`);
      const response = await axiosInstance.get("/api/analytics/sales", {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
      setSalesAnalytics(normalizeSalesAnalytics(response.data?.data || response.data));
    } catch (err) {
      console.error("Failed to load sales analytics", err);
    } finally {
      setSalesAnalyticsLoading(false);
    }
  }, [selectedDate, userRole]);

  // Trigger Analytics Fetch when filters change (Context handles the fetch)
  useEffect(() => {
    if (userRole === 'owner' || userRole === 'manager') {
      fetchAnalytics(timeRange, compareEnabled);
      fetchMostSellingItems();
      fetchDailyStats();
    }
  }, [timeRange, compareEnabled, fetchAnalytics, fetchMostSellingItems, fetchDailyStats, userRole]);

  useEffect(() => {
    fetchSalesAnalytics();
  }, [fetchSalesAnalytics]);

  // Real-time Updates
  useEffect(() => {
    if (
      response?.type === "order_paid" ||
      response?.type === "cash_payment_confirmed" ||
      response?.type === "order_completed" ||
      response?.type === "new_order" ||
      response?.type === "order_created" ||
      response?.type === "order_status_update" ||
      response?.type === "payment:created"
    ) {
      console.log("Real-time Analytics refresh triggered by:", response.type);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        // Re-fetch analytics on order/payment updates
        fetchAnalytics(timeRange, compareEnabled);
        fetchMostSellingItems();
        fetchDailyStats();
        fetchSalesAnalytics();
      }, 2000);
    }
  }, [response, fetchAnalytics, fetchMostSellingItems, fetchDailyStats, fetchSalesAnalytics, timeRange, compareEnabled]);

  // GUARANTEED POLLING FALLBACK — 60s refresh for analytics (heavier queries)
  useEffect(() => {
    if (userRole !== 'owner' && userRole !== 'manager') return;
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchAnalytics(timeRange, compareEnabled);
      fetchMostSellingItems();
      fetchDailyStats();
    }, 60000);
    return () => clearInterval(poll);
  }, [fetchAnalytics, fetchMostSellingItems, fetchDailyStats, timeRange, compareEnabled, userRole]);

  // NOTE: Initial Fetch is now handled by OwnerContext (Background Fetch)
  // We DO NOT fetch here on mount to avoid waterfall.


  useEffect(() => {
    if (userRole !== "owner" && userRole !== "manager") return;
    const timer = window.setTimeout(() => {
      if (categories.length === 0) fetchCategories();
      if (subCategories.length === 0) fetchSubCategories();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    userRole,
    categories.length,
    subCategories.length,
    fetchCategories,
    fetchSubCategories,
  ]);

  // Edit/Delete State
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [showDeleteItem, setShowDeleteItem] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCategorySubmitting, setIsCategorySubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Handlers
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const isInitialMenuFetch = currentPage === 1 && debouncedSearchQuery === "";
    const timer = window.setTimeout(
      () => fetchFoodItems(currentPage, debouncedSearchQuery),
      isInitialMenuFetch ? 900 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [currentPage, debouncedSearchQuery, fetchFoodItems]);


  // Removed fetchMostSellingItems local definition
  // Removed local initial useEffect for analytics/selling items


  // Chart Data Preparation
  const statsLoading = dailyStatsLoading || analyticsLoading;
  const totalRevenue = toNumber(
    dailyStats?.totalRevenue ||
    dailyStats?.total_revenue ||
    dailyStats?.revenue ||
    analytics?.status?.total_revenue
  );
  const totalOrders = toNumber(
    dailyStats?.totalOrders ||
    dailyStats?.total_orders ||
    dailyStats?.orders ||
    dailyStats?.ordersCount ||
    analytics?.status?.total_orders
  );
  const activeStaff = toNumber(dailyStats?.activeStaff || dailyStats?.active_staff || analytics?.status?.active_staff);
  const averageOrderValue = toNumber(dailyStats?.averageOrderValue || dailyStats?.average_order_value || dailyStats?.aov);
  const chartSource = salesAnalytics && salesAnalytics.labels.length > 0
    ? salesAnalytics
    : {
      labels: analytics?.chart?.labels || [],
      revenue: analytics?.chart?.revenue || [],
      orders: analytics?.chart?.orders || [],
    };

  const ImageUploaderWithAI = ({ label, currentImage, existingImageUrl, onImageSelected }: any) => {
    const [mode, setMode] = useState<'upload' | 'ai'>('upload');
    const [prompt, setPrompt] = useState('');
    const [generating, setGenerating] = useState(false);
    const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
    const handleGenerate = async () => {
      if (!prompt) return toast.error("Please enter a prompt");
      setGenerating(true);
      try {
        // Strategy 1: Try Pollinations AI
        let imageBlob: Blob | null = null;
        try {
          const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ' food professional photography')}?width=1024&height=1024&nologo=true`;
          const res = await fetch(pollinationsUrl);
          if (res.ok) {
            const blob = await res.blob();
            if (blob.type.startsWith('image/')) imageBlob = blob;
          }
        } catch { /* Pollinations down, try fallback */ }

        // Strategy 2: Foodish API (random food photos, always works)
        if (!imageBlob) {
          const foodishRes = await fetch('https://foodish-api.com/api/');
          if (!foodishRes.ok) throw new Error('Image services unavailable');
          const foodishData = await foodishRes.json();
          const imgRes = await fetch(foodishData.image);
          if (!imgRes.ok) throw new Error('Failed to download image');
          imageBlob = await imgRes.blob();
        }

        const objectUrl = URL.createObjectURL(imageBlob);
        setGeneratedPreview(objectUrl);
        const file = new File([imageBlob], "generated-image.jpg", { type: imageBlob.type || "image/jpeg" });
        onImageSelected(file);
        toast.success("Image generated!");
      } catch (e: any) {
        console.error(e);
        toast.error("Generation failed: " + (e.message || "Unknown error"));
      } finally { setGenerating(false); }
    };
    const previewUrl = currentImage
      ? (typeof currentImage === 'string' ? currentImage : URL.createObjectURL(currentImage))
      : (generatedPreview || existingImageUrl || null);
    return (
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-xs font-medium text-slate-700">{label}</label>
          <div className="flex gap-2 text-[10px]">
            <button onClick={() => setMode('upload')} className={`px-2 py-1 rounded ${mode === 'upload' ? 'bg-slate-100 text-slate-800 font-bold' : 'text-slate-500'}`}>Upload</button>
            <button onClick={() => setMode('ai')} className={`px-2 py-1 rounded ${mode === 'ai' ? 'bg-[#0055FE]/10 text-[#0055FE] font-bold' : 'text-slate-500'}`}>Generate with AI</button>
          </div>
        </div>
        {mode === 'upload' ? (
          <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:border-[#0055FE]/50 transition-colors cursor-pointer relative">
            <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => { const file = e.target.files?.[0] || null; onImageSelected(file); }} />
            {previewUrl ? (
              <div className="w-full">
                <img src={previewUrl} alt="Preview" className="w-full h-24 object-cover rounded-md border border-slate-200 mb-2" />
                <p className="text-xs text-green-600 font-medium">{currentImage?.name || "Current Image"}</p>
                <p className="text-[10px] text-slate-400">Click to replace</p>
              </div>
            ) : (
              <>
                <div className="mb-2 text-slate-400"><Upload size={24} /></div>
                <p className="text-sm font-medium text-slate-700">Upload a File</p>
                <p className="text-xs text-slate-500">Drag and drop or browse</p>
              </>
            )}
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <textarea className="w-full text-xs p-2 border border-slate-200 rounded mb-2 h-16 outline-none focus:border-[#0055FE]" placeholder="Describe the image..." value={prompt} onChange={e => setPrompt(e.target.value)} />
            <button onClick={handleGenerate} disabled={generating} className="w-full py-1.5 bg-[#0055FE] text-white text-xs rounded hover:bg-[#0047D1] disabled:opacity-50 flex items-center justify-center gap-2">
              {generating ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <TrendingUp size={12} />}
              Generate Image
            </button>
            {generatedPreview && (
              <div className="mt-2">
                <img src={generatedPreview} alt="AI Generated" className="w-full h-24 object-cover rounded-md border border-slate-200" />
                <p className="text-[10px] text-green-600 mt-1 text-center font-medium">Image selected</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }


  return (
    <div className="flex flex-col gap-6">

      {/* METRICS GRID - OWNER & MANAGER */}
      {(userRole === 'owner' || userRole === 'manager') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            title="Total Revenue"
            value={statsLoading ? <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" /> : fmt(totalRevenue)}
            trend={`${analytics?.status?.weekly_growth || 0}%`}
            isPositive={(analytics?.status?.weekly_growth || 0) >= 0}
            subtext={statsLoading ? "" : averageOrderValue > 0 ? `AOV ${fmt(averageOrderValue)}` : "Live today"}
            icon={TrendingUp}
            featured
          />
          <MetricCard
            title="Total Orders"
            value={statsLoading ? <div className="h-8 w-16 bg-slate-100 animate-pulse rounded" /> : totalOrders}
            subtext={statsLoading ? "" : "Processed today"}
            trend="12%"
            isPositive={true}
            icon={ShoppingBag}
          />
          <MetricCard
            title="Active Staff"
            value={statsLoading ? <div className="h-8 w-12 bg-slate-100 animate-pulse rounded" /> : activeStaff}
            subtext={statsLoading ? "" : "Currently online"}
            trend="0%"
            isPositive={true}
            icon={Users}
          />
        </div>
      )}


      {/* REVENUE CHART SECTION */}
      {(userRole === 'owner' || userRole === 'manager') && (
        <div className="bg-white p-6 rounded-lg border border-slate-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Revenue Analytics</h3>
              <p className="text-sm text-slate-500">Track sales for the selected date using live analytics</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                <Calendar size={14} strokeWidth={1.8} />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="bg-transparent outline-none"
                />
              </label>

              {/* Compare Toggle */}
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors select-none bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  checked={compareEnabled}
                  onChange={(e) => setCompareEnabled(e.target.checked)}
                  className="accent-[#0055FE] w-3.5 h-3.5"
                />
                Compare
              </label>

              <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

              <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
            </div>
          </div>

          <div className="h-80 w-full">
            {salesAnalyticsLoading ? (
              <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">Loading sales analytics...</div>
            ) : (
              <RevenueAnalyticsChart
                labels={chartSource.labels}
                data={chartSource.revenue}
                orders={chartSource.orders}
                comparisonData={analytics?.comparison?.revenue}
                comparisonOrders={analytics?.comparison?.orders || []}
                showComparison={compareEnabled}
              />
            )}
          </div>
        </div>
      )}



      {/* CONTENT GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* FOOD ITEMS TABLE (Left, 2 cols) */}
        <div className="xl:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden">
          {/* Header Bar */}
          <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <h3 className="text-sm font-semibold text-slate-900">Food Items</h3>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search..."
                  className="h-8 pl-8 pr-3 text-xs border border-slate-200 rounded-lg outline-none focus:border-[#0055FE] w-full sm:w-48"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              {(userRole === 'owner' || userRole === 'manager') && (
                <div className="grid grid-cols-1 min-[420px]:grid-cols-3 sm:flex sm:items-center gap-2">
                  <button data-testid="add-category-btn" className="h-8 px-3 border border-[#0055FE] text-[#0055FE] hover:bg-[#0055FE]/5 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap" onClick={() => setShowAddCategory(true)}>
                    <FolderPlus size={14} /> Add Category
                  </button>
                  <button data-testid="add-sub-category-btn" className="h-8 px-3 border border-[#0055FE] text-[#0055FE] hover:bg-[#0055FE]/5 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap" onClick={() => setShowAddSubCategory(true)}>
                    <Layers size={14} /> Add Sub-Category
                  </button>
                  <button className="h-8 px-3 bg-[#0055FE] hover:bg-[#0047D1] text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap" onClick={() => setShowAddItem(true)}>
                    <Plus size={14} /> Add Item
                  </button>
                </div>
              )}
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
                  foodItems.slice(0, isViewAll ? foodItems.length : 5).map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden shrink-0">
                            {item.image ? (
                              <img
                                src={item.image}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
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
                      <td className="px-5 py-3 text-xs text-slate-600 font-medium">{fmt(item.price)}</td>
                      <td className="px-5 py-3">
                        <select
                          className={`h-7 pl-2 pr-6 text-[10px] font-medium rounded border appearance-none outline-none cursor-pointer bg-no-repeat bg-[right_0.4rem_center] transition-colors ${item.availability
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                            }`}
                          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}
                          value={item.availability ? "true" : "false"}
                          onChange={(e) => {
                            if (userRole === 'owner' || (userRole as string) === 'manager') {
                              updateAvailability(item.id, e.target.value === "true");
                            } else {
                              toast.error("You don't have permission to change status");
                            }
                          }}
                          disabled={userRole !== 'owner' && (userRole as string) !== 'manager'}
                        >
                          <option value="true">Available</option>
                          <option value="false">Unavailable</option>
                        </select>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-3 text-xs font-medium">
                          {(userRole === 'owner' || userRole === 'manager') && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingItem(item);
                                  setItemFormData({
                                    item_name: item.item_name,
                                    price: item.price,
                                    description: item.description || "",
                                    category: item.category_id || "",
                                    sub_category: item.sub_category_id || "",
                                    discount_percentage: item.discount_percentage || 0,
                                    image1: null,
                                    video: null
                                  });
                                  setShowAddItem(true);
                                }}
                                className="text-[#0055FE] hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  setItemToDelete(item);
                                  setShowDeleteItem(true);
                                }}
                                className="text-red-500 hover:underline"
                              >
                                Delete
                              </button>
                            </>
                          )}
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
              onClick={() => setIsViewAll(!isViewAll)}
              className="text-xs text-[#0055FE] font-medium hover:underline"
            >
              {isViewAll ? "View Less" : "View All Items"}
            </button>
          </div>
        </div>



        {/* MOST SELLING ITEMS - OWNER & MANAGER */}
        {(userRole === 'owner' || userRole === 'manager') && (
          <div className="bg-white p-5 rounded-lg border border-slate-200 h-fit">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Most Selling</h3>
              <button className="p-1 rounded hover:bg-slate-50 text-slate-400">
                <MoreVertical size={14} />
              </button>
            </div>

            <div className="space-y-4">
              {sellingItemData && sellingItemData.length > 0 ? (() => {
                // Calculate max value for proportional bars
                const maxValue = Math.max(...sellingItemData.slice(0, 5).map((item: any) =>
                  parseFloat(item.percentage) || item.total_sold || 0
                ));

                return sellingItemData.slice(0, 5).map((item: any, idx: number) => {
                  const value = parseFloat(item.percentage) || item.total_sold || 0;
                  const barWidth = maxValue > 0 ? (value / maxValue) * 100 : 0;

                  return (
                    <div key={idx}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-medium text-slate-700">{item.item_name}</span>
                        <span className="text-slate-500">{typeof item.percentage === 'number' ? item.percentage.toFixed(2) : item.percentage || '0'}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0055FE] rounded-full transition-all duration-300"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                });
              })() : (
                <p className="text-xs text-slate-400 text-center py-4">No data available</p>
              )}
            </div>
          </div>
        )}

      </div>

      {/* CATEGORY & SUB-CATEGORY MANAGEMENT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ALL CATEGORY TABLE */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">All Category</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-xs font-medium text-slate-600">Category</th>
                  {(userRole === 'owner' || userRole === 'manager') && <th className="px-5 py-3 text-xs font-medium text-slate-600 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.filter((c: any) => c.parent_category === null || c.parent_category === undefined).length > 0 ? (
                  categories.filter((c: any) => c.parent_category === null || c.parent_category === undefined).map((cat: any) => (
                    <tr key={cat.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                            {cat.image ? (
                              <img src={cat.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] text-slate-400">No Image</span>
                            )}
                          </div>
                          <span className="text-xs font-medium text-slate-900">{cat.Category_name}</span>
                        </div>
                      </td>

                      {(userRole === 'owner' || userRole === 'manager') && (
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {/* Edit/Delete Actions - Wiring up to Modals later */}
                            <button onClick={() => { setEditingCategory(cat); setShowEditCategory(true); }} className="p-1.5 text-[#0055FE] hover:bg-blue-50 rounded transition-colors"><Pencil size={14} /></button>
                            <button onClick={() => { setCategoryToDelete(cat); setShowDeleteCategory(true); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={2} className="py-6 text-center text-slate-500 text-xs">No categories</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SUB CATEGORIES TABLE */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Sub Categories</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-xs font-medium text-slate-600">Sub-Category</th>
                  <th className="px-5 py-3 text-xs font-medium text-slate-600">Parent Category</th>
                  {(userRole === 'owner' || userRole === 'manager') && <th className="px-5 py-3 text-xs font-medium text-slate-600 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subCategories.length > 0 ? (
                  subCategories.map((sub: any) => (
                    <tr key={sub.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-slate-900">{sub.Category_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {categories.find(c => c.id === sub.parent_category)?.Category_name || '-'}
                      </td>

                      {(userRole === 'owner' || userRole === 'manager') && (
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => { setEditingSubCategory(sub); setShowEditSubCategory(true); }} className="p-1.5 text-[#0055FE] hover:bg-blue-50 rounded transition-colors"><Pencil size={14} /></button>
                            <button onClick={() => { setSubCategoryToDelete(sub); setShowDeleteSubCategory(true); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={3} className="py-6 text-center text-slate-500 text-xs">No sub-categories</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div >

      {/* --- MODALS --- */}

      {/* ADD/EDIT CATEGORY MODAL */}
      <Modal
        isOpen={showAddCategory || showEditCategory}
        onClose={() => { setShowAddCategory(false); setShowEditCategory(false); setCatFormData({ name: "", image: null }); }}
        title={showEditCategory ? "Edit Category" : "Add Category"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Category Name</label>
            <input
              type="text"
              placeholder="Category Name"
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={showEditCategory ? editingCategory?.Category_name : catFormData.name}
              onChange={e => showEditCategory ? setEditingCategory({ ...editingCategory, Category_name: e.target.value }) : setCatFormData({ ...catFormData, name: e.target.value })}
            />
          </div>

          {/* IMAGE UPLOADER WITH AI */}
          <ImageUploaderWithAI
            label="Category Image"
            currentImage={catFormData.image}
            existingImageUrl={showEditCategory ? editingCategory?.image : undefined}
            onImageSelected={(file: File) => setCatFormData({ ...catFormData, image: file })}
          />

          <button
            data-testid="submit-btn"
            disabled={isCategorySubmitting}
            onClick={async () => {
              if (isCategorySubmitting) return;
              setIsCategorySubmitting(true);
              try {
                const formData = new FormData();
                if (showEditCategory) {
                  formData.append('Category_name', editingCategory.Category_name);
                  if (catFormData.image) formData.append('image', catFormData.image);
                  await updateCategory(editingCategory.id, formData);
                  setShowEditCategory(false);
                  setCatFormData({ name: "", image: null });
                } else {
                  formData.append('Category_name', catFormData.name);
                  if (catFormData.image) formData.append('image', catFormData.image);
                  await createCategory(formData);
                  setShowAddCategory(false);
                  setCatFormData({ name: "", image: null });
                }
              } finally {
                setIsCategorySubmitting(false);
              }
            }}
            className={`w-full h-10 bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium rounded-lg transition-colors flex items-center justify-center ${isCategorySubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isCategorySubmitting ? "Saving..." : "Submit"}
          </button>
        </div>
      </Modal>

      {/* DELETE CATEGORY MODAL */}
      <Modal isOpen={showDeleteCategory} onClose={() => setShowDeleteCategory(false)} title="Delete Category">
        <div className="space-y-6">
          <p className="text-slate-600 text-sm">
            Are you sure you want to delete <span className="font-bold text-slate-900">{categoryToDelete?.Category_name}</span>? This will also delete all sub-categories within it.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowDeleteCategory(false)} className="flex-1 h-10 border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50">Cancel</button>
            <button disabled={isDeleting} onClick={async () => { if (isDeleting) return; setIsDeleting(true); try { await deleteCategory(categoryToDelete.id); setShowDeleteCategory(false); } finally { setIsDeleting(false); } }} className={`flex-1 h-10 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg ${isDeleting ? 'opacity-70 cursor-not-allowed' : ''}`}>{isDeleting ? "Deleting..." : "Delete"}</button>
          </div>
        </div>
      </Modal>

      {/* ADD/EDIT SUB-CATEGORY MODAL */}
      <Modal
        isOpen={showAddSubCategory || showEditSubCategory}
        onClose={() => { setShowAddSubCategory(false); setShowEditSubCategory(false); setSubCatFormData({ Category_name: "", parent_category: "", image: null }); }}
        title={showEditSubCategory ? "Edit Sub-Category" : "Add Sub-Category"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Sub-Category Name</label>
            <input
              type="text"
              placeholder="Sub-Category Name"
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={showEditSubCategory ? editingSubCategory?.Category_name : subCatFormData.Category_name}
              onChange={e => showEditSubCategory ? setEditingSubCategory({ ...editingSubCategory, Category_name: e.target.value }) : setSubCatFormData({ ...subCatFormData, Category_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Parent Category</label>
            <select
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none bg-white"
              value={showEditSubCategory ? editingSubCategory?.parent_category : subCatFormData.parent_category}
              onChange={e => showEditSubCategory ? setEditingSubCategory({ ...editingSubCategory, parent_category: e.target.value }) : setSubCatFormData({ ...subCatFormData, parent_category: e.target.value })}
            >
              <option value="">Select Parent Category</option>
              {categories.filter((cat: any) => !cat.parent_category).map((cat: any) => (
                <option key={cat.id} value={cat.id}>{cat.Category_name}</option>
              ))}
            </select>
          </div>

          {/* IMAGE UPLOADER WITH AI FOR SUBCATEGORY */}
          <ImageUploaderWithAI
            label="Sub-Category Image"
            currentImage={subCatFormData.image}
            existingImageUrl={showEditSubCategory ? editingSubCategory?.image : undefined}
            onImageSelected={(file: File) => setSubCatFormData({ ...subCatFormData, image: file })}
          />


          <button
            data-testid="submit-btn"
            disabled={isCategorySubmitting}
            onClick={async () => {
              if (isCategorySubmitting) return;
              setIsCategorySubmitting(true);
              try {
                const formData = new FormData();
                if (showEditSubCategory) {
                  formData.append('Category_name', editingSubCategory.Category_name);
                  formData.append('parent_category', editingSubCategory.parent_category);
                  if (subCatFormData.image) formData.append('image', subCatFormData.image);
                  await updateSubCategory(editingSubCategory.id, formData);
                  setShowEditSubCategory(false);
                  setSubCatFormData({ Category_name: "", parent_category: "", image: null });
                } else {
                  formData.append('Category_name', subCatFormData.Category_name);
                  formData.append('parent_category', subCatFormData.parent_category);
                  if (subCatFormData.image) formData.append('image', subCatFormData.image);
                  await createSubCategory(formData);
                  setShowAddSubCategory(false);
                  setSubCatFormData({ Category_name: "", parent_category: "", image: null });
                }
              } finally {
                setIsCategorySubmitting(false);
              }
            }}
            className={`w-full h-10 bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium rounded-lg transition-colors flex items-center justify-center ${isCategorySubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isCategorySubmitting ? "Saving..." : "Submit"}
          </button>
        </div>
      </Modal>

      {/* DELETE SUB-CATEGORY MODAL */}
      <Modal isOpen={showDeleteSubCategory} onClose={() => setShowDeleteSubCategory(false)} title="Delete Sub-Category">
        <div className="space-y-6">
          <p className="text-slate-600 text-sm">
            Are you sure you want to delete <span className="font-bold text-slate-900">{subCategoryToDelete?.Category_name}</span>? This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowDeleteSubCategory(false)} className="flex-1 h-10 border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50">Cancel</button>
            <button disabled={isDeleting} onClick={async () => { if (isDeleting) return; setIsDeleting(true); try { await deleteSubCategory(subCategoryToDelete.id); setShowDeleteSubCategory(false); } finally { setIsDeleting(false); } }} className={`flex-1 h-10 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg ${isDeleting ? 'opacity-70 cursor-not-allowed' : ''}`}>{isDeleting ? "Deleting..." : "Delete"}</button>
          </div>
        </div>
      </Modal>

      {/* DELETE ITEM MODAL */}
      <Modal isOpen={showDeleteItem} onClose={() => setShowDeleteItem(false)} title="Delete Item">
        <div className="space-y-6">
          <p className="text-slate-600 text-sm">
            Are you sure you want to delete <span className="font-bold text-slate-900">{itemToDelete?.item_name}</span>?
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowDeleteItem(false)} className="flex-1 h-10 border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50">Cancel</button>
            <button disabled={isDeleting} onClick={async () => {
              if (isDeleting) return;
              setIsDeleting(true);
              try {
                await axiosInstance.delete(`/owners/items/${itemToDelete.id}/`);
                toast.success("Item deleted");
                setShowDeleteItem(false);
                fetchFoodItems(currentPage, debouncedSearchQuery);
              } catch (e: any) {
                toast.error("Failed to delete item: " + (e.response?.data?.error || e.message));
              } finally {
                setIsDeleting(false);
              }
            }}
              className={`flex-1 h-10 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg ${isDeleting ? 'opacity-70 cursor-not-allowed' : ''}`}>{isDeleting ? "Deleting..." : "Delete"}</button>
          </div>
        </div>
      </Modal>

      {/* ADD/EDIT ITEM MODAL */}
      <Modal
        isOpen={showAddItem}
        onClose={() => {
          setShowAddItem(false);
          setEditingItem(null);
          setItemFormData({ item_name: "", price: "", description: "", category: "", sub_category: "", discount_percentage: "", image1: null, video: null });
        }}
        title={editingItem ? "Edit Item" : "Add New Item"}
      >
        <div className="space-y-4">
          <p className="text-[11px] text-slate-500">Fields marked <span className="text-red-500">*</span> are required.</p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Item Name <span className="text-red-500">*</span></label>
            <input type="text" placeholder="Burger, Pizza..." className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#0055FE]"
              value={itemFormData.item_name} onChange={e => setItemFormData({ ...itemFormData, item_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Price <span className="text-red-500">*</span></label>
              <input type="number" placeholder="0.00" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#0055FE]"
                value={itemFormData.price} onChange={e => setItemFormData({ ...itemFormData, price: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Discount (%)</label>
              <input type="number" placeholder="0" max="100" className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#0055FE]"
                value={(itemFormData as any).discount_percentage || ''}
                onChange={e => setItemFormData({ ...itemFormData, discount_percentage: e.target.value } as any)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Category <span className="text-red-500">*</span></label>
            <select className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-[#0055FE]"
              value={itemFormData.category} onChange={e => setItemFormData({ ...itemFormData, category: e.target.value, sub_category: "" })}>
              <option value="">Select Category</option>
              {categories.filter((c: any) => !c.parent_category).map((c: any) => <option key={c.id} value={c.id}>{c.Category_name}</option>)}
            </select>
          </div>

          {/* Sub-Category Dropdown - always shows after category is selected */}
          {itemFormData.category && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Sub-Category (Optional)</label>
              <select className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-[#0055FE]"
                value={itemFormData.sub_category || ""} onChange={e => setItemFormData({ ...itemFormData, sub_category: e.target.value })}>
                <option value="">Select Sub-Category</option>
                {categories.filter((c: any) => c.parent_category?.toString() === itemFormData.category.toString()).map((c: any) => <option key={c.id} value={c.id}>{c.Category_name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description <span className="text-red-500">*</span></label>
            <textarea className="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#0055FE] h-20"
              placeholder="Item description..."
              value={itemFormData.description} onChange={e => setItemFormData({ ...itemFormData, description: e.target.value })} />
          </div>

          <ImageUploaderWithAI
            label="Item Image"
            currentImage={itemFormData.image1}
            existingImageUrl={editingItem?.image1}
            onImageSelected={(file: File) => setItemFormData({ ...itemFormData, image1: file })}
          />

          {/* VIDEO UPLOADER */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-medium text-slate-700">Item Video (Optional)</label>
              <span className="text-[10px] text-slate-400">Max 30MB, MP4/WebM</span>
            </div>
            <div className="border border-slate-200 rounded-lg p-3 flex items-center gap-3 bg-slate-50">
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                <Video size={20} />
              </div>
              <div className="flex-1 overflow-hidden">
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  className="hidden"
                  id="video-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 30 * 1024 * 1024) return toast.error("Video too large (Max 30MB)");
                      setItemFormData({ ...itemFormData, video: file });
                    }
                  }}
                />
                <label htmlFor="video-upload" className="block cursor-pointer">
                  <p className="text-xs font-medium text-slate-700 truncate">
                    {itemFormData.video ? itemFormData.video.name : (editingItem?.video ? "Existing Video (Upload to Replace)" : "Click to Upload Video")}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {itemFormData.video ? `${(itemFormData.video.size / 1024 / 1024).toFixed(1)} MB` : "No video selected"}
                  </p>
                </label>
              </div>
              {itemFormData.video && (
                <button onClick={() => setItemFormData({ ...itemFormData, video: null })} className="p-1 hover:bg-slate-200 rounded text-slate-500">
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <button
            disabled={isSubmitting}
            onClick={async () => {
              if (isSubmitting) return; // Prevent double-click
              const itemName = (itemFormData.item_name || "").trim();
              const description = (itemFormData.description || "").trim();
              const price = (itemFormData.price || "").toString().trim();

              if (!itemName) return toast.error("Please enter item name");
              if (!price) return toast.error("Please enter a price");
              if (!itemFormData.category) return toast.error("Please select a category");
              if (!description) return toast.error("Please enter item description");

              setIsSubmitting(true);
              const formData = new FormData();
              formData.append('item_name', itemName);
              formData.append('price', price);
              formData.append('description', description);
              formData.append('category', itemFormData.category);
              if (itemFormData.sub_category) formData.append('sub_category', itemFormData.sub_category);
              if ((itemFormData as any).discount_percentage) formData.append('discount_percentage', (itemFormData as any).discount_percentage);
              if (itemFormData.image1) formData.append('image1', itemFormData.image1);
              if (itemFormData.video) formData.append('video', itemFormData.video);

              // Default availability for new items
              if (!editingItem) formData.append('availability', 'true');

              try {
                if (editingItem) {
                  await axiosInstance.patch(`/owners/items/${editingItem.id}/`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                  });
                  toast.success("Item updated successfully");
                } else {
                  await axiosInstance.post('/owners/items/', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                  });
                  toast.success("Item created successfully");
                }

                setShowAddItem(false);
                setEditingItem(null);
                setItemFormData({ item_name: "", price: "", description: "", category: "", sub_category: "", discount_percentage: "", image1: null, video: null });
                fetchFoodItems(currentPage, debouncedSearchQuery);
              } catch (e: any) {
                console.error(e);
                let errorMsg = "Failed to save item";
                const data = e.response?.data;

                if (data) {
                  if (data.item_name) {
                    errorMsg = "Please enter item name";
                  } else if (data.price) {
                    errorMsg = "Please enter a valid price";
                  } else if (data.category) {
                    errorMsg = "Please select a category";
                  } else if (data.description) {
                    errorMsg = "Please enter item description";
                  } else if (typeof data === 'object') {
                    // Extract first error message from any field
                    const firstError = Object.values(data).flat()[0];
                    if (typeof firstError === 'string') {
                      errorMsg = firstError;
                    } else {
                      errorMsg = JSON.stringify(data);
                    }
                  } else {
                    errorMsg = data.detail || data.error || e.message;
                  }
                } else {
                  errorMsg = e.message;
                }

                toast.error(errorMsg);
              } finally {
                setIsSubmitting(false);
              }
            }}
            className={`w-full h-10 bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium rounded-lg transition-colors flex items-center justify-center ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}>
            {isSubmitting ? "Saving..." : (editingItem ? "Update Item" : "Create Item")}
          </button>
        </div>
      </Modal>

    </div>
  );
};

export default ScreenRestaurantDashboard;
