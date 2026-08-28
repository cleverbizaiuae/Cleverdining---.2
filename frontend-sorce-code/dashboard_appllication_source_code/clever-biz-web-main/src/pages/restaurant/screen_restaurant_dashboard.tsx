import { Fragment, useEffect, useState, useCallback, useContext, useMemo, useRef } from "react";
import { useOwner } from "@/context/ownerContext";
import { useRole } from "@/hooks/useRole";
import axiosInstance from "@/lib/axios";
import { cachedGet, invalidateApiCache } from "@/lib/requestCache";
import toast from "react-hot-toast";
import { WebSocketContext } from "@/hooks/WebSocketProvider";
import {
  TrendingUp,
  Users,
  DollarSign,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  BarChart3,
  LayoutGrid,
  FolderPlus,
  Layers,
  Pencil,
  Trash2,
  X,
  Upload,
  Lock,
  Video
} from "lucide-react";
import type { ChartOptions, ScriptableContext } from "chart.js";
import { Line } from "react-chartjs-2";
import { RevenueAnalyticsChart } from "@/components/analytics/RevenueAnalyticsChart";
import { TimeRangeToggle } from "@/components/analytics/TimeRangeToggle";
import { useRestaurantContext } from "@/lib/useRestaurantContext";
import { OptimizedImage } from "@/components/OptimizedImage";




const Modal = ({ isOpen, onClose, title, children, clipRoundedCorners = false }: any) => {
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 py-8 backdrop-blur-sm animate-fadeIn overflow-y-auto"
    >
      <div className={`bg-white rounded-2xl w-full max-w-md p-7 shadow-2xl animate-scaleIn my-auto max-h-[90vh] ${clipRoundedCorners ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}>
        <div className={`flex justify-between items-center mb-6 sticky top-0 bg-white pb-2 -mt-2 pt-2 border-b border-transparent ${clipRoundedCorners ? "shrink-0" : ""}`}>
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 p-1 transition-colors">
            <X size={20} />
          </button>
        </div>
        {clipRoundedCorners ? <div className="min-h-0 overflow-y-auto">{children}</div> : children}
      </div>
    </div>
  )
};

const MoveButtons = ({
  canMoveUp,
  canMoveDown,
  isMoving,
  onMove,
  variant = "table",
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  isMoving: boolean;
  onMove: (direction: "up" | "down") => void;
  variant?: "category-filter" | "subcategory-filter" | "table";
}) => {
  const isFilter = variant !== "table";
  const enabledHoverClass = variant === "subcategory-filter"
    ? "hover:bg-slate-100 hover:text-slate-700"
    : "hover:bg-blue-50 hover:text-[#0055FE]";
  const buttonClass = isFilter
    ? "rounded p-0.5 transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-30"
    : `rounded p-1.5 text-slate-400 transition-colors disabled:cursor-not-allowed disabled:text-slate-200 ${enabledHoverClass}`;
  const iconClass = "h-3 w-3";

  return (
    <div className={isFilter
      ? "inline-flex items-center gap-0.5"
      : "inline-flex items-center gap-0.5"
    }>
      <button
        type="button"
        title="Move up"
        aria-label="Move up"
        disabled={!canMoveUp || isMoving}
        onClick={(event) => {
          event.stopPropagation();
          onMove("up");
        }}
        className={buttonClass}
      >
        <svg viewBox="0 0 10 6" className={iconClass} fill="currentColor" aria-hidden="true">
          <path d="M5 0L10 6H0z" />
        </svg>
      </button>
      <button
        type="button"
        title="Move down"
        aria-label="Move down"
        disabled={!canMoveDown || isMoving}
        onClick={(event) => {
          event.stopPropagation();
          onMove("down");
        }}
        className={buttonClass}
      >
        <svg viewBox="0 0 10 6" className={iconClass} fill="currentColor" aria-hidden="true">
          <path d="M0 0H10L5 6z" />
        </svg>
      </button>
    </div>
  );
};

// --- COMPONENTS ---

// 1. METRIC CARDS
// Spec: Left: Title (slate-500), Value (slate-900), Change (green/red). Right: subtle line icon.
const MetricCard = ({ title, value, subtext, icon: Icon, trend, isPositive = true }: any) => (
  <div className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-5">
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-1 text-2xl font-semibold leading-none text-slate-900">{value}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {trend && (
          <span className={`inline-flex items-center text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? <ArrowUpRight className="mr-0.5 h-3 w-3" strokeWidth={1.8} /> : <ArrowDownRight className="mr-0.5 h-3 w-3" strokeWidth={1.8} />}
            {trend}
          </span>
        )}
        <span className="text-xs text-slate-400">{subtext}</span>
      </div>
    </div>
    <Icon className="h-5 w-5 flex-shrink-0 text-slate-300" strokeWidth={1.8} />
  </div>
);

const toNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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

type ReservationChartPoint = {
  date: string;
  name: string;
  reservations: number;
  walkIns: number;
};

type DashboardUpsellSummary = {
  total_shown: number;
  total_accepted: number;
  total_rejected: number;
  acceptance_rate: number;
  upsell_revenue: string;
  avg_upsell_value: string;
  generated_at: string;
  last_event_at: string | null;
  engine_context?: {
    enabled: boolean;
    strategy: string;
    aggressiveness: string;
    tone: string;
    trigger_points: {
      add_to_cart: boolean;
      cart: boolean;
      before_payment: boolean;
    };
    enabled_item_count: number;
    inventory_priority_count: number;
    active_rule_count: number;
    tracked_pairing_count: number;
  };
};

const getSelectedWeek = (dateValue: string): ReservationChartPoint[] => {
  const [year, month, day] = dateValue.split("-").map(Number);
  const selected = new Date(year, month - 1, day);
  const monday = new Date(selected);
  const dayOffset = (selected.getDay() + 6) % 7;
  monday.setDate(selected.getDate() - dayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      date: formatInputDate(date),
      name: date.toLocaleDateString("en-US", { weekday: "short" }),
      reservations: 0,
      walkIns: 0,
    };
  });
};

const getReservationRows = (payload: any): any[] => {
  const raw = payload?.results || payload?.data || payload || [];
  return Array.isArray(raw) ? raw : [];
};

const normalizeReservationAnalytics = (payload: any, fallback: ReservationChartPoint[]) => {
  const rows = Array.isArray(payload?.days) ? payload.days : [];
  const rowsByDate = new Map(rows.map((row: any) => [String(row.date || ""), row]));

  return fallback.map((point) => {
    const row: any = rowsByDate.get(point.date);
    return {
      ...point,
      reservations: toNumber(row?.reservations),
      walkIns: toNumber(row?.walkIns ?? row?.walk_ins),
    };
  });
};

const ImageUploaderWithAI = ({ label, currentImage, existingImageUrl, onImageSelected }: any) => {
  const [mode, setMode] = useState<'upload' | 'ai'>('upload');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (generatedPreview) URL.revokeObjectURL(generatedPreview);
    };
  }, [generatedPreview]);

  useEffect(() => {
    if (!currentImage || typeof currentImage === 'string') {
      setSelectedFilePreview(null);
      return;
    }

    const objectUrl = URL.createObjectURL(currentImage);
    setSelectedFilePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [currentImage]);

  const handleGenerate = async () => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return toast.error("Please enter a prompt");

    setGenerating(true);
    try {
      const response = await axiosInstance.post(
        "/owners/generate-image/",
        { prompt: `${normalizedPrompt} food professional photography` },
        { timeout: 70000 },
      );
      const imageData = String(response.data?.image || "");
      const match = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
      if (!match) throw new Error("The image service returned an invalid image.");

      const binary = window.atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const imageBlob = new Blob([bytes], { type: match[1] });

      const objectUrl = URL.createObjectURL(imageBlob);
      setGeneratedPreview(objectUrl);
      const file = new File([imageBlob], "generated-image.jpg", { type: imageBlob.type || "image/jpeg" });
      onImageSelected(file);
      toast.success("Image generated!");
    } catch (error: any) {
      console.error(error);
      const message = error?.response?.data?.error;
      toast.error(message || "Image generation is temporarily unavailable. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const previewUrl = typeof currentImage === 'string'
    ? currentImage
    : (selectedFilePreview || generatedPreview || existingImageUrl || null);

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="block text-xs font-medium text-slate-700">{label}</label>
        <div className="flex gap-2 text-[10px]">
          <button type="button" onClick={() => setMode('upload')} className={`px-2 py-1 rounded ${mode === 'upload' ? 'bg-slate-100 text-slate-800 font-bold' : 'text-slate-500'}`}>Upload</button>
          <button type="button" onClick={() => setMode('ai')} className={`px-2 py-1 rounded ${mode === 'ai' ? 'bg-[#0055FE]/10 text-[#0055FE] font-bold' : 'text-slate-500'}`}>Generate with AI</button>
        </div>
      </div>
      {mode === 'upload' ? (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:border-[#0055FE]/50 transition-colors cursor-pointer relative">
          <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={event => onImageSelected(event.target.files?.[0] || null)} />
          {previewUrl ? (
            <div className="w-full">
              <div className="w-full h-48 sm:h-56 rounded-md border border-slate-200 bg-white overflow-hidden mb-2">
                <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
              </div>
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
          <textarea
            className="w-full text-xs p-2 border border-slate-200 rounded mb-2 h-16 outline-none focus:border-[#0055FE]"
            placeholder="Describe the image..."
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
          />
          <button type="button" onClick={handleGenerate} disabled={generating} className="w-full py-1.5 bg-[#0055FE] text-white text-xs rounded hover:bg-[#0047D1] disabled:opacity-50 flex items-center justify-center gap-2">
            {generating ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <TrendingUp size={12} />}
            {generating ? "Generating..." : "Generate Image"}
          </button>
          {generatedPreview && (
            <div className="mt-2">
              <div className="w-full h-48 sm:h-56 rounded-md border border-slate-200 bg-white overflow-hidden">
                <img src={generatedPreview} alt="AI Generated" className="w-full h-full object-contain" />
              </div>
              <p className="text-[10px] text-green-600 mt-1 text-center font-medium">Image selected</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const isWalkInReservation = (row: any) => {
  const source = String(row?.source || row?.booking_source || row?.source_type || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return source === "walk_in" || source === "walkin";
};

const isActiveReservation = (row: any) => {
  const status = String(row?.status || "").trim().toLowerCase();
  return !["cancel", "cancelled", "no_show"].includes(status);
};

const ReservationsAnalyticsChart = ({ data }: { data: ReservationChartPoint[] }) => {
  const chartData = {
    labels: data.map((item) => item.name),
    datasets: [
      {
        label: "Reservations",
        data: data.map((item) => item.reservations),
        borderColor: "#0055FE",
        borderWidth: 1.5,
        backgroundColor: (context: ScriptableContext<"line">) => {
          const chart = context.chart;
          const gradient = chart.ctx.createLinearGradient(0, 0, 0, chart.chartArea?.bottom || 280);
          gradient.addColorStop(0, "rgba(0, 85, 254, 0.08)");
          gradient.addColorStop(1, "rgba(0, 85, 254, 0)");
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: "#0055FE",
        pointHoverBorderColor: "#FFFFFF",
        pointHoverBorderWidth: 2,
      },
      {
        label: "Walk-ins",
        data: data.map((item) => item.walkIns),
        borderColor: "#0EA5E9",
        borderWidth: 1.5,
        backgroundColor: (context: ScriptableContext<"line">) => {
          const chart = context.chart;
          const gradient = chart.ctx.createLinearGradient(0, 0, 0, chart.chartArea?.bottom || 280);
          gradient.addColorStop(0, "rgba(14, 165, 233, 0.08)");
          gradient.addColorStop(1, "rgba(14, 165, 233, 0)");
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: "#0EA5E9",
        pointHoverBorderColor: "#FFFFFF",
        pointHoverBorderWidth: 2,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#FFFFFF",
        titleColor: "#0F172A",
        bodyColor: "#475569",
        borderColor: "#E2E8F0",
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        titleFont: { size: 12, weight: "bold", family: "Inter" },
        bodyFont: { size: 12, family: "Inter" },
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ${context.parsed.y ?? 0}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: "#94A3B8", font: { size: 11, family: "Inter" } },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: "#F1F5F9" },
        ticks: { color: "#94A3B8", font: { size: 11, family: "Inter" }, precision: 0 },
      },
    },
  };

  return (
    <div className="relative h-full w-full" role="img" aria-label="Weekly reservations and walk-ins chart">
      <Line data={chartData} options={options} />
    </div>
  );
};

// 2. REVENUE CHART
// Spec: Gradient #0055FE (8% -> 0%), Line stroke 1.5px, Dashed grid


const ScreenRestaurantDashboard = () => {
  const { fmt, restaurantId } = useRestaurantContext();
  const {
    foodItems,
    deviceStats,
    fetchDeviceStats,
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
    moveCategory,
    moveSubCategory,

    // Consumed from Context (Render-First)
    analytics,
    sellingItems: sellingItemData, // Alias to match existing usage
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
  const [analyticsTab, setAnalyticsTab] = useState<"revenue" | "reservations">("revenue");
  const [selectedDate, setSelectedDate] = useState(formatInputDate(new Date()));
  const [dailyStats, setDailyStats] = useState<any>(null);
  const [dailyStatsLoading, setDailyStatsLoading] = useState(false);
  const [salesAnalytics, setSalesAnalytics] = useState<{ labels: string[]; revenue: number[]; orders: number[] } | null>(null);
  const [salesAnalyticsLoading, setSalesAnalyticsLoading] = useState(false);
  const [dashboardUpsellStats, setDashboardUpsellStats] = useState<DashboardUpsellSummary | null>(null);
  const [reservationsToday, setReservationsToday] = useState<number | null>(null);
  const [reservationAnalytics, setReservationAnalytics] = useState<ReservationChartPoint[]>(() => getSelectedWeek(formatInputDate(new Date())));
  const [reservationAnalyticsLoading, setReservationAnalyticsLoading] = useState(false);
  const [reservationAnalyticsError, setReservationAnalyticsError] = useState(false);

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
  const [categoryNameError, setCategoryNameError] = useState("");
  const [subCatFormData, setSubCatFormData] = useState({ Category_name: "", parent_category: "" });


  // Add Item State
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemFormData, setItemFormData] = useState({ item_name: "", price: "", description: "", category: "", sub_category: "", discount_percentage: "" as string | number, image1: null as File | null, video: null as File | null });
  const [menuCategoryFilter, setMenuCategoryFilter] = useState("all");
  const [menuSubCategoryFilter, setMenuSubCategoryFilter] = useState("all");
  const [collapsedMenuCategories, setCollapsedMenuCategories] = useState<Set<string>>(() => new Set());
  const [movingMenuGroup, setMovingMenuGroup] = useState<string | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDailyStats = useCallback(async (force = false) => {
    if (userRole !== "owner" && userRole !== "manager") return;
    if (!restaurantId) {
      setDailyStats(null);
      setDailyStatsLoading(false);
      return;
    }
    setDailyStatsLoading(true);
    try {
      const response = await cachedGet("/api/daily-stats", {
        params: { restaurantId },
      }, { ttlMs: 10_000, force });
      setDailyStats(response.data?.data || response.data);
    } catch (err) {
      console.warn("Failed to load daily stats", err);
      setDailyStats(null);
    } finally {
      setDailyStatsLoading(false);
    }
  }, [restaurantId, userRole]);

  const fetchDashboardUpsellStats = useCallback(async (force = false) => {
    if (userRole !== "owner" && userRole !== "manager") return;
    if (!restaurantId) {
      setDashboardUpsellStats(null);
      return;
    }
    try {
      const response = await cachedGet<DashboardUpsellSummary>(
        "/api/upsell/analytics",
        {
          params: {
            restaurantId,
            summary: 1,
          },
        },
        { ttlMs: 0, force },
      );
      setDashboardUpsellStats(response.data || null);
    } catch (err) {
      console.warn("Failed to load dashboard upsell summary", err);
      setDashboardUpsellStats(null);
    }
  }, [restaurantId, userRole]);


  const fetchReservationStats = useCallback(async (force = false) => {
    if (userRole !== "owner" && userRole !== "manager") return;
    if (!restaurantId) {
      setReservationsToday(null);
      return;
    }
    try {
      const today = formatInputDate(new Date());
      const response = await cachedGet("/owners/reservations/", {
        params: { date: today, page_size: 1000 },
      }, { ttlMs: 30_000, force });
      const rows = getReservationRows(response.data).filter((row: any) => (
        String(row.restaurant || "") === String(restaurantId)
      ));
      setReservationsToday(rows.filter((row: any) => (
        isActiveReservation(row) && !isWalkInReservation(row)
      )).length);
    } catch (err) {
      console.warn("Failed to load reservation dashboard stats", err);
      setReservationsToday(null);
    }
  }, [restaurantId, userRole]);

  const fetchReservationAnalytics = useCallback(async (force = false) => {
    if ((userRole !== "owner" && userRole !== "manager") || !selectedDate) return;
    const selectedWeek = getSelectedWeek(selectedDate);
    if (!restaurantId) {
      setReservationAnalytics(selectedWeek);
      setReservationAnalyticsLoading(false);
      setReservationAnalyticsError(true);
      return;
    }
    setReservationAnalyticsLoading(true);
    setReservationAnalyticsError(false);

    try {
      const response = await cachedGet("/owners/reservations/analytics/", {
        params: { date: selectedDate, restaurantId },
      }, { ttlMs: 30_000, force });
      setReservationAnalytics(normalizeReservationAnalytics(response.data, selectedWeek));
    } catch (err) {
      console.warn("Failed to load reservation analytics", err);
      setReservationAnalytics(selectedWeek);
      setReservationAnalyticsError(true);
    } finally {
      setReservationAnalyticsLoading(false);
    }
  }, [restaurantId, selectedDate, userRole]);

  const fetchSalesAnalytics = useCallback(async (force = false) => {
    if ((userRole !== "owner" && userRole !== "manager") || !selectedDate) return;
    if (!restaurantId) {
      setSalesAnalytics(null);
      setSalesAnalyticsLoading(false);
      return;
    }
    setSalesAnalyticsLoading(true);
    try {
      const startDate = new Date(`${selectedDate}T00:00:00.000`);
      const endDate = new Date(`${selectedDate}T23:59:59.999`);
      const response = await cachedGet("/api/analytics/sales", {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          restaurantId,
        },
      }, { ttlMs: 10_000, force });
      setSalesAnalytics(normalizeSalesAnalytics(response.data?.data || response.data));
    } catch (err) {
      console.warn("Failed to load sales analytics", err);
    } finally {
      setSalesAnalyticsLoading(false);
    }
  }, [restaurantId, selectedDate, userRole]);

  // Trigger Analytics Fetch when filters change (Context handles the fetch)
  useEffect(() => {
    if (userRole === 'owner' || userRole === 'manager') {
      fetchAnalytics(timeRange, compareEnabled);
      fetchMostSellingItems();
      fetchDailyStats();
      fetchDashboardUpsellStats();
      fetchReservationStats();
      fetchDeviceStats();
    }
  }, [timeRange, compareEnabled, fetchAnalytics, fetchMostSellingItems, fetchDailyStats, fetchDashboardUpsellStats, fetchReservationStats, fetchDeviceStats, userRole]);

  useEffect(() => {
    fetchSalesAnalytics();
  }, [fetchSalesAnalytics]);

  useEffect(() => {
    fetchReservationAnalytics();
  }, [fetchReservationAnalytics]);

  // Real-time Updates
  useEffect(() => {
    if (response?.type === "upsell_event_updated") {
      fetchDashboardUpsellStats(true);
    }
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
        fetchAnalytics(timeRange, compareEnabled, true);
        fetchMostSellingItems(true);
        fetchDailyStats(true);
        fetchDashboardUpsellStats(true);
        fetchSalesAnalytics(true);
        fetchDeviceStats();
      }, 2000);
    }
    if (String(response?.type || "").startsWith("reservation_")) {
      fetchReservationStats(true);
      fetchReservationAnalytics(true);
    }
  }, [response, fetchAnalytics, fetchMostSellingItems, fetchDailyStats, fetchDashboardUpsellStats, fetchSalesAnalytics, fetchDeviceStats, fetchReservationStats, fetchReservationAnalytics, timeRange, compareEnabled]);

  // Near-real-time fallback for upsell events when websocket delivery is unavailable.
  useEffect(() => {
    if (userRole !== "owner" && userRole !== "manager") return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        fetchDashboardUpsellStats(true);
      }
    };
    const poll = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [fetchDashboardUpsellStats, userRole]);

  // GUARANTEED POLLING FALLBACK — 60s refresh for heavier dashboard queries.
  useEffect(() => {
    if (userRole !== 'owner' && userRole !== 'manager') return;
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetchAnalytics(timeRange, compareEnabled);
      fetchMostSellingItems();
      fetchDailyStats();
      fetchReservationStats();
      fetchReservationAnalytics();
      fetchDeviceStats();
    }, 60000);
    return () => clearInterval(poll);
  }, [fetchAnalytics, fetchMostSellingItems, fetchDailyStats, fetchReservationStats, fetchReservationAnalytics, fetchDeviceStats, timeRange, compareEnabled, userRole]);

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
    const isInitialMenuFetch = debouncedSearchQuery === "";
    const timer = window.setTimeout(
      () => fetchFoodItems(1, debouncedSearchQuery, 1000),
      isInitialMenuFetch ? 500 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [debouncedSearchQuery, fetchFoodItems]);

  const topLevelCategories = useMemo(
    () => categories
      .filter((category) => category.parent_category == null)
      .sort((left, right) =>
        (left.display_order ?? left.id) - (right.display_order ?? right.id)
      ),
    [categories],
  );

  const orderedSubCategories = useMemo(
    () => [...subCategories].sort((left, right) => {
      if (left.parent_category !== right.parent_category) {
        return left.parent_category - right.parent_category;
      }
      return (left.display_order ?? left.id) - (right.display_order ?? right.id);
    }),
    [subCategories],
  );

  const selectedCategorySubCategories = useMemo(
    () => menuCategoryFilter === "all"
      ? []
      : orderedSubCategories.filter(
        (subCategory) => String(subCategory.parent_category) === menuCategoryFilter,
      ),
    [menuCategoryFilter, orderedSubCategories],
  );

  const filteredMenuItems = useMemo(
    () => foodItems.filter((item: any) => {
      if (
        menuCategoryFilter !== "all" &&
        String(item.category_id ?? item.category) !== menuCategoryFilter
      ) {
        return false;
      }
      if (
        menuSubCategoryFilter !== "all" &&
        String(item.sub_category_id ?? item.sub_category) !== menuSubCategoryFilter
      ) {
        return false;
      }
      return true;
    }),
    [foodItems, menuCategoryFilter, menuSubCategoryFilter],
  );

  const groupedFilteredMenuItems = useMemo(() => {
    const groups = topLevelCategories
      .map((category) => ({
        key: String(category.id),
        name: category.Category_name,
        items: filteredMenuItems.filter(
          (item: any) => String(item.category_id ?? item.category) === String(category.id),
        ),
      }))
      .filter((group) => group.items.length > 0);
    const categoryIds = new Set(topLevelCategories.map((category) => String(category.id)));
    const uncategorized = filteredMenuItems.filter(
      (item: any) => !categoryIds.has(String(item.category_id ?? item.category)),
    );
    if (uncategorized.length > 0) {
      groups.push({ key: "uncategorized", name: "Uncategorized", items: uncategorized });
    }
    return groups;
  }, [filteredMenuItems, topLevelCategories]);

  useEffect(() => {
    if (
      menuCategoryFilter !== "all" &&
      !topLevelCategories.some((category) => String(category.id) === menuCategoryFilter)
    ) {
      setMenuCategoryFilter("all");
      setMenuSubCategoryFilter("all");
    }
  }, [menuCategoryFilter, topLevelCategories]);

  useEffect(() => {
    if (
      menuSubCategoryFilter !== "all" &&
      !selectedCategorySubCategories.some(
        (subCategory) => String(subCategory.id) === menuSubCategoryFilter,
      )
    ) {
      setMenuSubCategoryFilter("all");
    }
  }, [menuSubCategoryFilter, selectedCategorySubCategories]);

  const categoryItemCount = (categoryId: number) =>
    foodItems.filter((item: any) => String(item.category_id ?? item.category) === String(categoryId)).length;

  const subCategoryItemCount = (subCategoryId: number) =>
    foodItems.filter(
      (item: any) => String(item.sub_category_id ?? item.sub_category) === String(subCategoryId),
    ).length;

  const handleMoveCategory = async (
    categoryId: number,
    direction: "up" | "down",
  ) => {
    const movementKey = `category-${categoryId}`;
    if (movingMenuGroup) return;
    setMovingMenuGroup(movementKey);
    try {
      await moveCategory(categoryId, direction);
    } finally {
      setMovingMenuGroup(null);
    }
  };

  const handleMoveSubCategory = async (
    subCategoryId: number,
    direction: "up" | "down",
  ) => {
    const movementKey = `subcategory-${subCategoryId}`;
    if (movingMenuGroup) return;
    setMovingMenuGroup(movementKey);
    try {
      await moveSubCategory(subCategoryId, direction);
    } finally {
      setMovingMenuGroup(null);
    }
  };

  const toggleMenuCategoryGroup = (categoryKey: string) => {
    setCollapsedMenuCategories((previous) => {
      const next = new Set(previous);
      if (next.has(categoryKey)) next.delete(categoryKey);
      else next.add(categoryKey);
      return next;
    });
  };

  const renderMenuItemRow = (item: any) => (
    <tr key={item.id} className="transition-colors hover:bg-slate-50/60">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden shrink-0">
            {item.image ? (
              <OptimizedImage
                src={item.image}
                alt=""
                width={32}
                height={32}
                className="w-full h-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">Img</div>
            )}
          </div>
          <p className="min-w-0 truncate text-xs font-medium text-slate-900">{item.item_name}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {topLevelCategories.find(
          (category) => String(category.id) === String(item.category_id ?? item.category),
        )?.Category_name || item.category_name || "Uncategorized"}
      </td>
      <td className="px-4 py-3 text-xs font-medium text-slate-600">{fmt(item.price)}</td>
      <td className="px-4 py-3">
        <select
          className={`h-7 pl-2 pr-6 text-[10px] font-medium rounded border appearance-none outline-none cursor-pointer bg-no-repeat bg-[right_0.4rem_center] transition-colors ${item.availability
            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
            : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
          }`}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}
          value={item.availability ? "true" : "false"}
          onChange={(event) => {
            if (userRole === "owner" || (userRole as string) === "manager") {
              updateAvailability(item.id, event.target.value === "true");
            } else {
              toast.error("You don't have permission to change status");
            }
          }}
          disabled={userRole !== "owner" && (userRole as string) !== "manager"}
        >
          <option value="true">Available</option>
          <option value="false">Unavailable</option>
        </select>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-3 text-xs font-medium">
          {(userRole === "owner" || userRole === "manager") && (
            <>
              <button
                onClick={() => {
                  setEditingItem(item);
                  setItemFormData({
                    item_name: item.item_name,
                    price: item.price,
                    description: item.description || "",
                    category: item.category_id || "",
                    sub_category: item.sub_category_id ?? item.sub_category ?? "",
                    discount_percentage: item.discount_percentage || 0,
                    image1: null,
                    video: null,
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
  );


  // Removed fetchMostSellingItems local definition
  // Removed local initial useEffect for analytics/selling items


  // Chart Data Preparation
  const statsLoading = dailyStatsLoading;
  const hasDailyStats = dailyStats !== null;
  const totalRevenue = toNumber(
    dailyStats?.totalRevenue ??
    dailyStats?.total_revenue ??
    dailyStats?.revenue
  );
  const totalOrders = toNumber(
    dailyStats?.totalOrders ??
    dailyStats?.total_orders ??
    dailyStats?.orders ??
    dailyStats?.ordersCount
  );
  const activeStaff = toNumber(dailyStats?.activeStaff ?? dailyStats?.active_staff);
  const averageOrderValue = toNumber(dailyStats?.averageOrderValue ?? dailyStats?.average_order_value ?? dailyStats?.aov ?? (totalOrders > 0 ? totalRevenue / totalOrders : 0));
  const activeTables = toNumber(deviceStats?.active_devices);
  const hasDeviceStats = Boolean(deviceStats && !(deviceStats as { error?: unknown }).error);
  const teamMembersCount = activeStaff;
  const weeklyRevenueGrowthValue = analytics?.status?.weekly_growth;
  const weeklyRevenueGrowth = Number(weeklyRevenueGrowthValue);
  const hasWeeklyRevenueGrowth = weeklyRevenueGrowthValue !== null && weeklyRevenueGrowthValue !== undefined && weeklyRevenueGrowthValue !== "" && Number.isFinite(weeklyRevenueGrowth);
  const reservationAnalyticsHasActivity = reservationAnalytics.some((point) => point.reservations > 0 || point.walkIns > 0);
  const dashboardUpsellShown = toNumber(dashboardUpsellStats?.total_shown);
  const dashboardUpsellAccepted = toNumber(dashboardUpsellStats?.total_accepted);
  const dashboardUpsellAcceptance = toNumber(
    dashboardUpsellStats?.acceptance_rate ??
    (dashboardUpsellShown > 0 ? (dashboardUpsellAccepted / dashboardUpsellShown) * 100 : 0)
  );
  const dashboardUpsellRevenue = toNumber(dashboardUpsellStats?.upsell_revenue);
  const hasDashboardUpsellStats = dashboardUpsellStats !== null;
  const dashboardUpsellGeneratedAt = dashboardUpsellStats?.generated_at
    ? new Date(dashboardUpsellStats.generated_at)
    : null;
  const dashboardUpsellUpdatedLabel =
    dashboardUpsellGeneratedAt && !Number.isNaN(dashboardUpsellGeneratedAt.getTime())
      ? dashboardUpsellGeneratedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "";
  const dashboardUpsellEngineEnabled = dashboardUpsellStats?.engine_context?.enabled ?? false;
  const chartSource = salesAnalytics && salesAnalytics.labels.length > 0
    ? salesAnalytics
    : {
      labels: analytics?.chart?.labels || [],
      revenue: analytics?.chart?.revenue || [],
      orders: analytics?.chart?.orders || [],
    };

  return (
    <div className="flex flex-col gap-6">

      {/* METRICS GRID - OWNER & MANAGER */}
      {(userRole === 'owner' || userRole === 'manager') && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              title="Total Revenue"
              value={statsLoading ? <div className="h-8 w-24 bg-slate-100 animate-pulse rounded" /> : (hasDailyStats ? fmt(totalRevenue) : "—")}
              trend={hasWeeklyRevenueGrowth ? `${weeklyRevenueGrowth.toFixed(1)}%` : undefined}
              isPositive={weeklyRevenueGrowth >= 0}
              subtext="Today"
              icon={DollarSign}
            />
            <MetricCard title="Total Orders" value={statsLoading ? <div className="h-8 w-16 bg-slate-100 animate-pulse rounded" /> : (hasDailyStats ? totalOrders : "—")} subtext="Today" icon={TrendingUp} />
            <MetricCard title="Avg Order Value" value={statsLoading ? <div className="h-8 w-20 bg-slate-100 animate-pulse rounded" /> : (hasDailyStats ? fmt(averageOrderValue) : "—")} subtext="Per order today" icon={BarChart3} />
            <MetricCard title="Active Tables" value={hasDeviceStats ? activeTables : "—"} subtext="Active now" icon={LayoutGrid} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard title="Team Members" value={hasDailyStats ? teamMembersCount : "—"} subtext="Active staff" icon={Users} />
            <MetricCard title="Reservations" value={reservationsToday ?? "—"} subtext="Booked today" icon={Calendar} />
          </div>
        </div>
      )}


      {/* ANALYTICS CHART SECTION */}
      {(userRole === 'owner' || userRole === 'manager') && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center" role="tablist" aria-label="Dashboard analytics">
              <button
                id="revenue-analytics-tab"
                type="button"
                role="tab"
                aria-selected={analyticsTab === "revenue"}
                aria-controls="revenue-analytics-panel"
                onClick={() => setAnalyticsTab("revenue")}
                className={`mr-5 flex items-center gap-1.5 border-b-2 px-1 py-3.5 text-xs font-semibold transition-colors ${analyticsTab === "revenue"
                  ? "border-[#0055FE] text-[#0055FE]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
              >
                <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.8} />
                Revenue Overview
              </button>
              <button
                id="reservations-analytics-tab"
                type="button"
                role="tab"
                aria-selected={analyticsTab === "reservations"}
                aria-controls="reservations-analytics-panel"
                onClick={() => setAnalyticsTab("reservations")}
                className={`flex items-center gap-1.5 border-b-2 px-1 py-3.5 text-xs font-semibold transition-colors ${analyticsTab === "reservations"
                  ? "border-[#0055FE] text-[#0055FE]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
              >
                <Calendar className="h-3.5 w-3.5" strokeWidth={1.8} />
                Reservations
              </button>
            </div>
            <label className="mb-2 flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 sm:my-2 sm:self-auto">
              <Calendar size={14} strokeWidth={1.8} className="text-[#0055FE]" />
              <span className="sr-only">Analytics date</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="bg-transparent outline-none"
              />
            </label>
          </div>

          {analyticsTab === "revenue" && (
            <div
              id="revenue-analytics-panel"
              role="tabpanel"
              aria-labelledby="revenue-analytics-tab"
              className="p-6"
            >
              <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Revenue Analytics</h3>
                  <p className="text-sm text-slate-500">Track sales for the selected date using live analytics</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
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

          {analyticsTab === "reservations" && (
            <div
              id="reservations-analytics-panel"
              role="tabpanel"
              aria-labelledby="reservations-analytics-tab"
              className="p-5"
            >
              <div className="h-[280px] w-full">
                {reservationAnalyticsLoading ? (
                  <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">
                    Loading reservation analytics...
                  </div>
                ) : reservationAnalyticsError ? (
                  <div className="flex h-full flex-col items-center justify-center rounded-lg bg-slate-50 text-center">
                    <Calendar className="mb-2 h-6 w-6 text-slate-300" strokeWidth={1.8} />
                    <p className="text-sm font-medium text-slate-600">Reservation analytics unavailable</p>
                    <p className="mt-1 text-xs text-slate-400">The dashboard could not load live reservation data.</p>
                  </div>
                ) : reservationAnalyticsHasActivity ? (
                  <ReservationsAnalyticsChart data={reservationAnalytics} />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center rounded-lg bg-slate-50 text-center">
                    <Calendar className="mb-2 h-6 w-6 text-slate-300" strokeWidth={1.8} />
                    <p className="text-sm font-medium text-slate-600">No reservation activity this week</p>
                    <p className="mt-1 text-xs text-slate-400">Reservations and walk-ins will appear here when recorded.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}


      {/* AI UPSELL PERFORMANCE STRIP */}
      {(userRole === 'owner' || userRole === 'manager') && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <TrendingUp size={16} strokeWidth={1.8} className="text-slate-400" />
                AI Upsell Performance
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {hasDashboardUpsellStats
                  ? `${dashboardUpsellEngineEnabled ? "Live" : "Engine off"}${dashboardUpsellUpdatedLabel ? ` · Synced ${dashboardUpsellUpdatedLabel}` : ""}`
                  : "Live analytics unavailable"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const base = window.location.pathname.replace(/\/$/, "");
                window.location.assign(`${base}/ai-upsell`);
              }}
              className="text-sm font-medium text-[#0055FE] hover:text-[#0047D1] transition-colors"
            >
              View full analytics →
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
            <div className="px-5 py-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Suggestions Shown</p>
              <p className="text-2xl font-semibold text-slate-900 leading-none">{hasDashboardUpsellStats ? dashboardUpsellShown : "—"}</p>
            </div>
            <div className="px-5 py-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Add To Cart</p>
              <p className="text-2xl font-semibold text-slate-900 leading-none">{hasDashboardUpsellStats ? dashboardUpsellAccepted : "—"}</p>
            </div>
            <div className="px-5 py-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Acceptance Rate</p>
              <p className="text-2xl font-semibold text-slate-900 leading-none">{hasDashboardUpsellStats ? `${Math.round(dashboardUpsellAcceptance)}%` : "—"}</p>
            </div>
            <div className="px-5 py-5">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Upsell Revenue</p>
              <p className="text-2xl font-semibold text-slate-900 leading-none">{hasDashboardUpsellStats ? fmt(dashboardUpsellRevenue) : "—"}</p>
            </div>
          </div>
        </div>
      )}



      {/* CONTENT GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* FOOD ITEMS TABLE (Left, 2 cols) */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header Bar */}
          <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <h3 className="text-sm font-semibold text-slate-900">Food Items</h3>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search..."
                  className="h-9 pl-8 pr-3 text-xs border border-slate-200 rounded-lg outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 w-full sm:w-48"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              {(userRole === 'owner' || userRole === 'manager') && (
                <div className="grid grid-cols-1 min-[420px]:grid-cols-3 sm:flex sm:items-center gap-2">
                  <button data-testid="add-category-btn" className="h-9 px-3 border border-[#0055FE] text-[#0055FE] hover:bg-[#0055FE]/5 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap" onClick={() => { setCategoryNameError(""); setShowAddCategory(true); }}>
                    <FolderPlus size={14} /> Add Category
                  </button>
                  <button data-testid="add-sub-category-btn" className="h-9 px-3 border border-[#0055FE] text-[#0055FE] hover:bg-[#0055FE]/5 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap" onClick={() => setShowAddSubCategory(true)}>
                    <Layers size={14} /> Add Sub-Category
                  </button>
                  <button className="h-9 px-3 bg-[#0055FE] hover:bg-[#0047D1] text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap" onClick={() => setShowAddItem(true)}>
                    <Plus size={14} /> Add Item
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
                type="button"
                onClick={() => {
                  setMenuCategoryFilter("all");
                  setMenuSubCategoryFilter("all");
                }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  menuCategoryFilter === "all"
                    ? "bg-[#0055FE] text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                All ({foodItems.length})
            </button>
            {topLevelCategories.map((category, index) => {
                const isActive = menuCategoryFilter === String(category.id);
                const movementKey = `category-${category.id}`;
                return (
                  <div
                    key={category.id}
                    className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold transition-colors ${
                      isActive
                        ? "border-[#0055FE] bg-[#0055FE] text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-[#0055FE]/40"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuCategoryFilter(String(category.id));
                        setMenuSubCategoryFilter("all");
                      }}
                      className="px-1"
                    >
                      {category.Category_name} ({categoryItemCount(category.id)})
                    </button>
                    {(userRole === "owner" || userRole === "manager") && (
                      <MoveButtons
                        canMoveUp={index > 0}
                        canMoveDown={index < topLevelCategories.length - 1}
                        isMoving={movingMenuGroup === movementKey}
                        onMove={(direction) => handleMoveCategory(category.id, direction)}
                        variant="category-filter"
                      />
                    )}
                  </div>
                );
            })}
          </div>

          {menuCategoryFilter !== "all" && selectedCategorySubCategories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50/50 px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                  type="button"
                  onClick={() => setMenuSubCategoryFilter("all")}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    menuSubCategoryFilter === "all"
                      ? "bg-slate-700 text-white"
                      : "border border-slate-200 bg-white text-slate-500 hover:border-slate-400"
                  }`}
                >
                  All subs
              </button>
              {selectedCategorySubCategories.map((subCategory, index) => {
                  const isActive = menuSubCategoryFilter === String(subCategory.id);
                  const movementKey = `subcategory-${subCategory.id}`;
                  return (
                    <div
                      key={subCategory.id}
                      className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${
                        isActive
                          ? "border-[#0055FE] bg-[#0055FE] text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-[#0055FE]/40"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setMenuSubCategoryFilter(String(subCategory.id))}
                        className="px-1"
                      >
                        {subCategory.Category_name} ({subCategoryItemCount(subCategory.id)})
                      </button>
                      {(userRole === "owner" || userRole === "manager") && (
                        <MoveButtons
                          canMoveUp={index > 0}
                          canMoveDown={index < selectedCategorySubCategories.length - 1}
                          isMoving={movingMenuGroup === movementKey}
                          onMove={(direction) => handleMoveSubCategory(subCategory.id, direction)}
                          variant="subcategory-filter"
                        />
                      )}
                    </div>
                  );
              })}
            </div>
          )}

          {/* Table */}
          <div className="max-h-[520px] overflow-auto [scrollbar-gutter:stable]">
            <table className="w-full min-w-[680px] text-left">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Item</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Category</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Price</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMenuItems.length > 0 ? (
                  groupedFilteredMenuItems.map((group) => {
                    const isCollapsed = collapsedMenuCategories.has(group.key);
                    return (
                      <Fragment key={group.key}>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <td colSpan={5} className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => toggleMenuCategoryGroup(group.key)}
                              className="flex w-full items-center justify-between text-left"
                            >
                              <span className="text-xs font-semibold text-slate-700">{group.name}</span>
                              <span className="flex items-center gap-2 text-[10px] text-slate-400">
                                {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                                <svg
                                  viewBox="0 0 24 24"
                                  className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  aria-hidden="true"
                                >
                                  <path d="m6 9 6 6 6-6" />
                                </svg>
                              </span>
                            </button>
                          </td>
                        </tr>
                        {!isCollapsed && group.items.map(renderMenuItemRow)}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-sm text-slate-400">
                      No items in this section
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>



        {/* MOST SELLING ITEMS - OWNER & MANAGER */}
        {(userRole === 'owner' || userRole === 'manager') && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Most Selling Items</h3>
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">All Category</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Category</th>
                  {(userRole === 'owner' || userRole === 'manager') && <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topLevelCategories.length > 0 ? (
                  topLevelCategories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                            {cat.image ? (
                              <OptimizedImage src={cat.image} alt="" width={32} height={32} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] text-slate-400">No Image</span>
                            )}
                          </div>
                          <span className="text-xs font-medium text-slate-900">{cat.Category_name}</span>
                        </div>
                      </td>

                      {(userRole === 'owner' || userRole === 'manager') && (
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => { setCategoryNameError(""); setEditingCategory(cat); setShowEditCategory(true); }} className="p-1.5 text-[#0055FE] hover:bg-blue-50 rounded transition-colors"><Pencil size={14} /></button>
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
                {orderedSubCategories.length > 0 ? (
                  orderedSubCategories.map((sub) => {
                    return (
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
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => { setEditingSubCategory(sub); setShowEditSubCategory(true); }} className="p-1.5 text-[#0055FE] hover:bg-blue-50 rounded transition-colors"><Pencil size={14} /></button>
                              <button onClick={() => { setSubCategoryToDelete(sub); setShowDeleteSubCategory(true); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
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
        onClose={() => { setShowAddCategory(false); setShowEditCategory(false); setCategoryNameError(""); setCatFormData({ name: "", image: null }); }}
        title={showEditCategory ? "Edit Category" : "Add Category"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Category Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              aria-required="true"
              aria-invalid={Boolean(categoryNameError)}
              aria-describedby={categoryNameError ? "category-name-error" : undefined}
              placeholder="Category Name"
              className={`w-full h-10 px-3 border rounded-lg text-sm focus:ring-2 outline-none ${categoryNameError ? "border-red-400 focus:border-red-500 focus:ring-red-500/10" : "border-slate-200 focus:border-[#0055FE] focus:ring-[#0055FE]/10"}`}
              value={showEditCategory ? editingCategory?.Category_name : catFormData.name}
              onChange={e => {
                if (categoryNameError) setCategoryNameError("");
                showEditCategory ? setEditingCategory({ ...editingCategory, Category_name: e.target.value }) : setCatFormData({ ...catFormData, name: e.target.value });
              }}
            />
            {categoryNameError && <p id="category-name-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">{categoryNameError}</p>}
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
              const categoryName = String(showEditCategory ? editingCategory?.Category_name : catFormData.name).trim();
              if (!categoryName) {
                setCategoryNameError("Category name is required.");
                return;
              }
              setIsCategorySubmitting(true);
              try {
                const formData = new FormData();
                if (showEditCategory) {
                  formData.append('Category_name', categoryName);
                  if (catFormData.image) formData.append('image', catFormData.image);
                  await updateCategory(editingCategory.id, formData);
                  setShowEditCategory(false);
                  setCatFormData({ name: "", image: null });
                } else {
                  formData.append('Category_name', categoryName);
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
        onClose={() => { setShowAddSubCategory(false); setShowEditSubCategory(false); setSubCatFormData({ Category_name: "", parent_category: "" }); }}
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
                  await updateSubCategory(editingSubCategory.id, formData);
                  setShowEditSubCategory(false);
                  setSubCatFormData({ Category_name: "", parent_category: "" });
                } else {
                  formData.append('Category_name', subCatFormData.Category_name);
                  formData.append('parent_category', subCatFormData.parent_category);
                  await createSubCategory(formData);
                  setShowAddSubCategory(false);
                  setSubCatFormData({ Category_name: "", parent_category: "" });
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
                fetchFoodItems(1, debouncedSearchQuery, 1000);
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
        clipRoundedCorners={Boolean(editingItem)}
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
              // Send an empty value when clearing the optional relation so PATCH
              // does not silently retain the previously selected sub-category.
              formData.append('sub_category', itemFormData.sub_category ? String(itemFormData.sub_category) : '');
              if ((itemFormData as any).discount_percentage) formData.append('discount_percentage', (itemFormData as any).discount_percentage);
              if (itemFormData.image1) formData.append('image1', itemFormData.image1);
              if (itemFormData.video) formData.append('video', itemFormData.video);

              // Default availability for new items
              if (!editingItem) formData.append('availability', 'true');

              try {
                if (editingItem) {
                  const response = await axiosInstance.patch(`/owners/items/${editingItem.id}/`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                  });

                  const requestedSubCategory = itemFormData.sub_category
                    ? String(itemFormData.sub_category)
                    : "";
                  const persistedSubCategory = response.data?.sub_category == null
                    ? ""
                    : String(response.data.sub_category);

                  if (persistedSubCategory !== requestedSubCategory) {
                    throw new Error("The sub-category change was not saved. Please try again.");
                  }
                } else {
                  await axiosInstance.post('/owners/items/', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                  });
                }

                invalidateApiCache("items");
                await fetchFoodItems(1, debouncedSearchQuery, 1000);
                setShowAddItem(false);
                setEditingItem(null);
                setItemFormData({ item_name: "", price: "", description: "", category: "", sub_category: "", discount_percentage: "", image1: null, video: null });
                toast.success(editingItem ? "Item updated successfully" : "Item created successfully");
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
