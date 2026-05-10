import { useCallback, useEffect, useMemo, useState } from "react";
import axiosInstance from "@/lib/axios";
import { useRestaurantContext } from "@/lib/useRestaurantContext";
import toast from "react-hot-toast";
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  GitFork,
  Loader2,
  Plus,
  RefreshCcw,
  ShoppingCart,
  Sparkles,
  Tag,
  Target,
  Trash2,
  TrendingUp,
  UtensilsCrossed,
  WandSparkles,
  XCircle,
  Zap,
} from "lucide-react";

type UpsellSettings = {
  enabled: boolean;
  strategy:
    | "balanced"
    | "highest_margin"
    | "highest_conversion"
    | "premium_experience"
    | "inventory_movement"
    | "margin"
    | "volume";
  aggressiveness: "subtle" | "moderate" | "aggressive";
  show_after_add_to_cart: boolean;
  show_in_cart: boolean;
  show_before_payment: boolean;
  tone: "friendly" | "premium" | "minimal" | "luxury_casual" | "professional" | "playful";
  prioritized_categories: string;
  prioritized_categories_list?: number[];
  category_role_map: Record<string, number[]>;
};

type Rule = {
  id: number;
  type: "pair" | "block";
  source_item: number;
  source_item_name?: string;
  target_item: number;
  target_item_name?: string;
  is_active: boolean;
};

type UpsellAnalytics = {
  total_shown: number;
  total_accepted: number;
  total_rejected: number;
  acceptance_rate: number;
  upsell_revenue: string;
  avg_upsell_value: string;
  by_trigger: Array<{ trigger_point: string; shown: number; accepted: number; acceptance_rate: number; revenue: string }>;
  by_category: Array<{ category: string; shown: number; accepted: number; acceptance_rate: number; revenue: string }>;
  top_items: Array<{
    item_id: number | null;
    item_name: string;
    shown: number;
    accepted: number;
    rejected: number;
    acceptance_rate: number;
    revenue: string;
  }>;
  by_hour: Array<{ hour: number; shown: number; accepted: number; acceptance_rate: number }>;
  revenue_trend: Array<{ date: string; revenue: string }>;
};

type UpsellItemRow = {
  id: number;
  item: number;
  item_name: string;
  price: string;
  image_url: string;
  availability: boolean;
  category_id: number | null;
  category_name: string;
  enabled: boolean;
  inventory_priority: boolean;
  shown_count: number;
  accepted_count: number;
  rejected_count: number;
  acceptance_rate: number;
};

type PairingRow = {
  source_item_id: number;
  source_item_name: string;
  target_item_id: number;
  target_item_name: string;
  frequency: number;
  association_strength: number;
  shown_count: number;
  accepted_count: number;
  dismissed_count: number;
  accept_rate: number;
};

type NewRuleDraft = {
  type: "pair" | "block";
  source_item?: number;
  target_item?: number;
};

type TabKey = "performance" | "pairing" | "items" | "settings";
type UpsellLoadScope = "base" | "items" | "settings" | "all";

const DEFAULT_SETTINGS: UpsellSettings = {
  enabled: true,
  strategy: "balanced",
  aggressiveness: "moderate",
  show_after_add_to_cart: true,
  show_in_cart: true,
  show_before_payment: true,
  tone: "friendly",
  prioritized_categories: "",
  prioritized_categories_list: [],
  category_role_map: { main: [], drinks: [], desserts: [], starters: [] },
};

const DEFAULT_ANALYTICS: UpsellAnalytics = {
  total_shown: 0,
  total_accepted: 0,
  total_rejected: 0,
  acceptance_rate: 0,
  upsell_revenue: "0",
  avg_upsell_value: "0",
  by_trigger: [],
  by_category: [],
  top_items: [],
  by_hour: [],
  revenue_trend: [],
};

const TABS: Array<{ key: TabKey; label: string; description: string }> = [
  { key: "performance", label: "Performance", description: "Live conversion + revenue analytics" },
  { key: "pairing", label: "Pairing Intelligence", description: "Learned co-order behavior" },
  { key: "items", label: "All Items", description: "Control what can be suggested" },
  { key: "settings", label: "Settings & Rules", description: "Strategy, triggers, manual overrides" },
];

const STRATEGY_OPTIONS: Array<{ value: UpsellSettings["strategy"]; label: string }> = [
  { value: "balanced", label: "Balanced" },
  { value: "highest_margin", label: "Highest Margin" },
  { value: "highest_conversion", label: "Highest Conversion" },
  { value: "premium_experience", label: "Premium Experience" },
  { value: "inventory_movement", label: "Inventory Movement" },
  { value: "margin", label: "Margin (Legacy)" },
  { value: "volume", label: "Volume (Legacy)" },
];

const AGGRESSIVENESS_OPTIONS: Array<{ value: UpsellSettings["aggressiveness"]; label: string }> = [
  { value: "subtle", label: "Subtle (1 suggestion)" },
  { value: "moderate", label: "Moderate (1-2 suggestions)" },
  { value: "aggressive", label: "Aggressive (max touchpoints)" },
];

const TONE_OPTIONS: Array<{ value: UpsellSettings["tone"]; label: string }> = [
  { value: "friendly", label: "Friendly" },
  { value: "premium", label: "Premium" },
  { value: "minimal", label: "Minimal" },
  { value: "luxury_casual", label: "Luxury Casual" },
  { value: "professional", label: "Professional (Legacy)" },
  { value: "playful", label: "Playful (Legacy)" },
];

const ROLE_KEYS = ["main", "drinks", "desserts", "starters"] as const;

const TRIGGER_LABELS: Record<string, string> = {
  add_to_cart: "After Add To Cart",
  cart: "Inside Cart",
  before_payment: "Before Payment",
};

const classNames = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const formatHour = (hour: number) => {
  const h = hour % 24;
  const suffix = h >= 12 ? "pm" : "am";
  const normalized = h % 12 === 0 ? 12 : h % 12;
  return `${normalized}${suffix}`;
};

const ROLE_ALIASES: Record<string, string> = {
  owner: "owner",
  manager: "manager",
  "owner user": "owner",
  restaurant_owner: "owner",
  "restaurant owner": "owner",
  "manager user": "manager",
  restaurant_manager: "manager",
  "restaurant manager": "manager",
  "admin user": "manager",
};

const resolveUpsellUserRole = (): string => {
  try {
    const raw = localStorage.getItem("userInfo");
    const parsed = raw ? JSON.parse(raw) : {};
    const candidates = [
      parsed?.role,
      parsed?.user?.role,
      parsed?.profile?.role,
      localStorage.getItem("adminRole"),
      localStorage.getItem("role"),
    ];

    for (const candidate of candidates) {
      const key = String(candidate || "").trim().toLowerCase();
      if (ROLE_ALIASES[key]) return ROLE_ALIASES[key];
      if (key === "owner" || key === "manager") return key;
    }
    return "";
  } catch {
    return "";
  }
};

const ToggleSwitch = ({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={classNames(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        checked ? "bg-[#0055FE]" : "bg-slate-300",
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <span
        className={classNames(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
};

const ScreenRestaurantUpsell = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [masterToggleSaving, setMasterToggleSaving] = useState(false);
  const [runningIntelligence, setRunningIntelligence] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("performance");

  const [settings, setSettings] = useState<UpsellSettings>(DEFAULT_SETTINGS);
  const [rules, setRules] = useState<Rule[]>([]);
  const [items, setItems] = useState<UpsellItemRow[]>([]);
  const [analytics, setAnalytics] = useState<UpsellAnalytics>(DEFAULT_ANALYTICS);
  const [pairingRows, setPairingRows] = useState<PairingRow[]>([]);
  const [pairingLoaded, setPairingLoaded] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [newRule, setNewRule] = useState<NewRuleDraft>({ type: "pair" });
  const [addingRule, setAddingRule] = useState(false);
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const userRole = useMemo(() => resolveUpsellUserRole(), []);
  const { fmt } = useRestaurantContext();

  const categoryOptions = useMemo(() => {
    const seen = new Map<number, string>();
    items.forEach((item) => {
      if (typeof item.category_id === "number") {
        seen.set(item.category_id, item.category_name || `Category ${item.category_id}`);
      }
    });
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const itemLookup = useMemo(() => {
    const map = new Map<number, UpsellItemRow>();
    items.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [items]);

  const groupedItems = useMemo(() => {
    const search = itemSearch.trim().toLowerCase();
    const groups = new Map<string, { name: string; rows: UpsellItemRow[]; shownTotal: number }>();

    items
      .filter((item) => !search || item.item_name.toLowerCase().includes(search))
      .sort((a, b) => {
        if ((b.shown_count || 0) !== (a.shown_count || 0)) {
          return (b.shown_count || 0) - (a.shown_count || 0);
        }
        return a.item_name.localeCompare(b.item_name);
      })
      .forEach((item) => {
        const groupKey = item.category_name || "Uncategorized";
        const existing = groups.get(groupKey) || { name: groupKey, rows: [], shownTotal: 0 };
        existing.rows.push(item);
        existing.shownTotal += Number(item.shown_count || 0);
        groups.set(groupKey, existing);
      });

    return Array.from(groups.values()).sort((a, b) => {
      if (b.shownTotal !== a.shownTotal) return b.shownTotal - a.shownTotal;
      return a.name.localeCompare(b.name);
    });
  }, [items, itemSearch]);

  const revenueSeries14Days = useMemo(() => {
    const map = new Map<string, number>();
    analytics.revenue_trend.forEach((row) => {
      map.set(row.date, Number(row.revenue || 0));
    });

    const values: Array<{ iso: string; label: string; value: number }> = [];
    const now = new Date();
    for (let offset = 13; offset >= 0; offset -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - offset);
      const iso = d.toISOString().slice(0, 10);
      values.push({
        iso,
        label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        value: map.get(iso) || 0,
      });
    }
    return values;
  }, [analytics.revenue_trend]);

  const maxRevenue = useMemo(() => {
    return Math.max(1, ...revenueSeries14Days.map((row) => row.value));
  }, [revenueSeries14Days]);

  const maxHourShown = useMemo(() => {
    return Math.max(1, ...analytics.by_hour.map((row) => row.shown || 0));
  }, [analytics.by_hour]);

  const byHourRows = useMemo(() => {
    const map = new Map<number, { hour: number; shown: number; accepted: number; acceptance_rate: number }>();
    (analytics.by_hour || []).forEach((row) => {
      map.set(Number(row.hour), {
        hour: Number(row.hour),
        shown: Number(row.shown || 0),
        accepted: Number(row.accepted || 0),
        acceptance_rate: Number(row.acceptance_rate || 0),
      });
    });
    return Array.from({ length: 24 }).map((_, hour) => map.get(hour) || { hour, shown: 0, accepted: 0, acceptance_rate: 0 });
  }, [analytics.by_hour]);

  const peakHour = useMemo(() => {
    return byHourRows.reduce(
      (best, row) => {
        if (!row.shown) return best;
        if (row.acceptance_rate > best.acceptance_rate) return row;
        return best;
      },
      { hour: 0, shown: 0, accepted: 0, acceptance_rate: 0 },
    );
  }, [byHourRows]);

  const activeHours = useMemo(() => byHourRows.filter((row) => row.shown > 0).length, [byHourRows]);

  const bestRevenueDay = useMemo(() => {
    return revenueSeries14Days.reduce(
      (best, row) => (row.value > best.value ? row : best),
      { iso: "", label: "--", value: 0 },
    );
  }, [revenueSeries14Days]);

  const trendTotalRevenue = useMemo(
    () => revenueSeries14Days.reduce((sum, row) => sum + row.value, 0),
    [revenueSeries14Days],
  );

  const acceptedVsRejected = useMemo(() => {
    const accepted = analytics.total_accepted || 0;
    const rejected = analytics.total_rejected || 0;
    const total = accepted + rejected;
    return {
      accepted,
      rejected,
      acceptedPct: total ? (accepted / total) * 100 : 0,
      rejectedPct: total ? (rejected / total) * 100 : 0,
    };
  }, [analytics]);

  const normalizeSettings = (incoming: any): UpsellSettings => {
    const prioritizedList = Array.isArray(incoming?.prioritized_categories_list)
      ? incoming.prioritized_categories_list
      : String(incoming?.prioritized_categories || "")
          .split(",")
          .map((entry: string) => Number(entry.trim()))
          .filter((value: number) => Number.isInteger(value));

    return {
      ...DEFAULT_SETTINGS,
      ...incoming,
      prioritized_categories_list: prioritizedList,
      category_role_map: {
        main: incoming?.category_role_map?.main || [],
        drinks: incoming?.category_role_map?.drinks || [],
        desserts: incoming?.category_role_map?.desserts || [],
        starters: incoming?.category_role_map?.starters || [],
      },
    };
  };

  const fetchUpsellData = useCallback(async (showLoader = false, scope: UpsellLoadScope = "base") => {
    try {
      if (showLoader) setLoading(true);
      else setRefreshing(true);

      const shouldFetchRules = scope === "settings" || scope === "all";
      const shouldFetchItems = scope === "items" || scope === "settings" || scope === "all";

      const [settingsRes, analyticsRes, rulesRes, itemsRes] = await Promise.allSettled([
        axiosInstance.get("/api/upsell/settings"),
        axiosInstance.get("/api/upsell/analytics"),
        shouldFetchRules ? axiosInstance.get("/api/upsell/rules") : Promise.resolve(null),
        shouldFetchItems ? axiosInstance.get("/api/upsell/items") : Promise.resolve(null),
      ]);

      const settingsData =
        settingsRes.status === "fulfilled" ? settingsRes.value.data : DEFAULT_SETTINGS;
      const analyticsData =
        analyticsRes.status === "fulfilled" ? analyticsRes.value.data : DEFAULT_ANALYTICS;

      let itemRows: UpsellItemRow[] = [];
      let usedItemsFallback = false;
      if (shouldFetchItems && itemsRes.status === "fulfilled" && Array.isArray(itemsRes.value?.data?.results)) {
        itemRows = itemsRes.value.data.results;
      } else if (shouldFetchItems) {
        usedItemsFallback = true;
        const ownerItemsFallback = await axiosInstance
          .get("/owners/items/")
          .then((response) => (Array.isArray(response.data?.results) ? response.data.results : []))
          .catch(() => []);
        itemRows = ownerItemsFallback.map((row: any) => ({
          id: Number(row?.id || 0),
          item: Number(row?.id || 0),
          item_name: String(row?.item_name || "Item"),
          price: String(row?.price || "0"),
          image_url: String(row?.image1 || ""),
          availability: row?.availability !== false,
          category_id: Number(row?.category ?? row?.category_id ?? 0) || null,
          category_name: String(row?.category_name || ""),
          enabled: true,
          inventory_priority: false,
          shown_count: 0,
          accepted_count: 0,
          rejected_count: 0,
          acceptance_rate: 0,
        }));
      }

      setSettings(normalizeSettings(settingsData || DEFAULT_SETTINGS));
      setAnalytics({ ...DEFAULT_ANALYTICS, ...(analyticsData || {}) });

      if (shouldFetchRules) {
        const rulesData =
          rulesRes.status === "fulfilled" && Array.isArray(rulesRes.value?.data)
            ? rulesRes.value.data
            : [];
        setRules(rulesData);
        setRulesLoaded(rulesRes.status === "fulfilled");
      }

      if (shouldFetchItems) {
        setItems(itemRows.filter((row) => Number.isInteger(row.id) && row.id > 0));
        setItemsLoaded(itemsRes.status === "fulfilled" || usedItemsFallback);
      }

      const criticalFailed = settingsRes.status !== "fulfilled" || analyticsRes.status !== "fulfilled";
      const partialFailed =
        (shouldFetchRules && rulesRes.status !== "fulfilled") ||
        (shouldFetchItems && itemsRes.status !== "fulfilled");
      if (criticalFailed) {
        toast.error("Failed to load AI upsell data.");
      } else if (partialFailed) {
        toast.error(
          usedItemsFallback
            ? "Some AI upsell sources failed. Using fallback item list."
            : "Some AI upsell sources failed. Showing available data.",
        );
      }
    } catch {
      toast.error("Failed to load AI upsell data.");
      setSettings(DEFAULT_SETTINGS);
      setAnalytics(DEFAULT_ANALYTICS);
      if (scope === "settings" || scope === "all") setRules([]);
      if (scope === "items" || scope === "settings" || scope === "all") setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchPairingIntelligence = useCallback(async (run = false) => {
    try {
      if (run) setRunningIntelligence(true);
      const response = run
        ? await axiosInstance.post("/api/upsell/compute-associations?restaurantId=default", {})
        : await axiosInstance.get("/api/upsell/association-analytics?restaurantId=default");
      const rows = Array.isArray(response.data?.results) ? response.data.results : [];
      setPairingRows(rows);
      setPairingLoaded(true);
      if (run) {
        toast.success("Pairing intelligence updated.");
      }
    } catch {
      toast.error("Failed to compute pairing intelligence.");
    } finally {
      setRunningIntelligence(false);
    }
  }, []);

  useEffect(() => {
    fetchUpsellData(true, "base");
  }, [fetchUpsellData]);

  useEffect(() => {
    if (activeTab === "pairing" && !pairingLoaded) {
      fetchPairingIntelligence(false);
    }
  }, [activeTab, pairingLoaded, fetchPairingIntelligence]);

  useEffect(() => {
    if (activeTab === "items" && !itemsLoaded) {
      fetchUpsellData(false, "items");
    }
    if (activeTab === "settings" && (!itemsLoaded || !rulesLoaded)) {
      fetchUpsellData(false, "settings");
    }
  }, [activeTab, fetchUpsellData, itemsLoaded, rulesLoaded]);

  const persistSettings = async (
    nextSettings: UpsellSettings,
    options?: { successMessage?: string; suppressToast?: boolean },
  ) => {
    const payload = {
      ...nextSettings,
      prioritized_categories: (nextSettings.prioritized_categories_list || []).join(","),
      category_role_map: nextSettings.category_role_map,
    };

    const response = await axiosInstance.put("/api/upsell/settings", payload);
    const normalized = normalizeSettings(response.data || payload);
    setSettings(normalized);
    if (!options?.suppressToast && options?.successMessage) {
      toast.success(options.successMessage);
    }
    return normalized;
  };

  const patchSettings = async (partial: Partial<UpsellSettings>, successMessage?: string) => {
    const previous = settings;
    const merged = normalizeSettings({ ...settings, ...partial });
    setSettings(merged);
    try {
      setSavingSettings(true);
      await persistSettings(merged, { successMessage, suppressToast: !successMessage });
    } catch {
      setSettings(previous);
      toast.error("Failed to update upsell settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      await persistSettings(settings, { successMessage: "Upsell settings saved." });
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleMasterToggle = async (nextEnabled: boolean) => {
    const rollback = settings.enabled;
    setSettings((prev) => ({ ...prev, enabled: nextEnabled }));
    try {
      setMasterToggleSaving(true);
      const response = await axiosInstance.put("/api/upsell/settings", { enabled: nextEnabled });
      setSettings((prev) => normalizeSettings({ ...prev, ...(response.data || {}) }));
      toast.success(nextEnabled ? "AI Upsell enabled." : "AI Upsell disabled.");
    } catch {
      setSettings((prev) => ({ ...prev, enabled: rollback }));
      toast.error("Failed to update AI Upsell status.");
    } finally {
      setMasterToggleSaving(false);
    }
  };

  const handleTogglePrioritizedCategory = (categoryId: number) => {
    const active = new Set(settings.prioritized_categories_list || []);
    if (active.has(categoryId)) active.delete(categoryId);
    else active.add(categoryId);
    patchSettings({ prioritized_categories_list: Array.from(active) });
  };

  const handleToggleRoleCategory = (role: (typeof ROLE_KEYS)[number], categoryId: number) => {
    const active = new Set(settings.category_role_map?.[role] || []);
    if (active.has(categoryId)) active.delete(categoryId);
    else active.add(categoryId);
    patchSettings({
      category_role_map: {
        ...settings.category_role_map,
        [role]: Array.from(active),
      },
    });
  };

  const addRule = async () => {
    if (!newRule.source_item || !newRule.target_item) {
      toast.error("Select both source and target items.");
      return;
    }
    if (newRule.source_item === newRule.target_item) {
      toast.error("Source and target must be different.");
      return;
    }

    try {
      const response = await axiosInstance.post("/api/upsell/rules", {
        type: newRule.type,
        source_item: newRule.source_item,
        target_item: newRule.target_item,
      });
      setRules((prev) => [response.data, ...prev]);
      setNewRule({ type: newRule.type });
      setAddingRule(false);
      toast.success("Rule added.");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to add rule.");
    }
  };

  const deleteRule = async (id: number) => {
    try {
      await axiosInstance.delete(`/api/upsell/rules/${id}`);
      setRules((prev) => prev.filter((rule) => rule.id !== id));
      toast.success("Rule deleted.");
    } catch {
      toast.error("Failed to delete rule.");
    }
  };

  const toggleItemEnabled = async (itemId: number, enabled: boolean) => {
    try {
      setUpdatingItemId(itemId);
      await axiosInstance.patch("/api/upsell/items", { item_id: itemId, enabled });
      setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, enabled } : item)));
    } catch {
      toast.error("Failed to update item suggestion status.");
    } finally {
      setUpdatingItemId(null);
    }
  };

  const refreshAll = async () => {
    const scope: UpsellLoadScope =
      activeTab === "settings" ? "settings" : activeTab === "items" ? "items" : "base";
    await fetchUpsellData(false, scope);
    if (pairingLoaded) {
      await fetchPairingIntelligence(false);
    }
  };

  const formatCurrency = (value: string | number) => fmt(value);

  if (!["owner", "manager"].includes(userRole)) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-600">
        AI Upsell is available for owner/manager accounts.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[55vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#0055FE]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-slate-400" strokeWidth={1.8} />
              AI Upsell Engine
            </h2>
            <p className="text-sm text-slate-500 mt-1">Increase order value with smart, timely suggestions.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
              Refresh
            </button>

            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-sm font-semibold text-slate-700">AI Upsell {settings.enabled ? "On" : "Off"}</span>
              {masterToggleSaving ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#0055FE]" />
              ) : (
                <ToggleSwitch checked={settings.enabled} onChange={handleMasterToggle} />
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-1 overflow-x-auto">
          <div className="flex min-w-max gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={classNames(
                  "rounded-lg border px-4 py-3 text-left transition min-w-[220px] sm:min-w-[230px]",
                  activeTab === tab.key
                    ? "border-[#0055FE] bg-[#0055FE] text-white shadow"
                    : "border-transparent bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                <p className="text-sm font-semibold">{tab.label}</p>
                <p className={classNames("text-xs mt-1", activeTab === tab.key ? "text-white/85" : "text-slate-500")}>
                  {tab.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === "performance" && (
        <div className="space-y-5">
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[
              {
                label: "OFFERS SHOWN",
                value: analytics.total_shown.toLocaleString(),
                icon: Zap,
                iconClass: "text-slate-500",
                sub: "",
              },
              {
                label: "ADD TO CART",
                value: analytics.total_accepted.toLocaleString(),
                icon: ShoppingCart,
                iconClass: "text-[#0055FE]",
                sub: "",
              },
              {
                label: "NO THANKS",
                value: analytics.total_rejected.toLocaleString(),
                icon: XCircle,
                iconClass: "text-red-500",
                sub: "",
              },
              {
                label: "ACCEPTANCE RATE",
                value: `${analytics.acceptance_rate.toFixed(2)}%`,
                icon: TrendingUp,
                iconClass: "text-emerald-500",
                sub: "Of upsells shown",
              },
              {
                label: "UPSELL REVENUE",
                value: formatCurrency(analytics.upsell_revenue),
                icon: BarChart3,
                iconClass: "text-[#0055FE]",
                sub: "From accepted upsells",
              },
              {
                label: "AVG UPSELL VALUE",
                value: formatCurrency(analytics.avg_upsell_value),
                icon: Target,
                iconClass: "text-slate-600",
                sub: "Per accepted upsell",
              },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{kpi.label}</p>
                  <kpi.icon className={classNames("h-4 w-4 shrink-0", kpi.iconClass)} strokeWidth={1.8} />
                </div>
                <p className="text-3xl font-bold text-slate-900 mt-3">{kpi.value}</p>
                {kpi.sub ? <p className="text-xs text-slate-500 mt-1">{kpi.sub}</p> : null}
              </div>
            ))}
          </section>

          {analytics.total_shown === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center">
              <BarChart3 className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-lg font-semibold text-slate-700 mt-3">No data yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Analytics will appear here once customers start interacting with upsell suggestions. Make sure AI Upsell is enabled.
              </p>
            </div>
          ) : (
            <>
              <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-base font-semibold text-slate-900">Performance by Trigger Point</h3>
                  <p className="text-xs text-slate-500 mt-1 mb-4">Where customers are most likely to accept suggestions.</p>
                  <div className="space-y-3">
                    {(analytics.by_trigger || []).map((row) => {
                      const pct = Math.max(0, Math.min(100, row.acceptance_rate));
                      return (
                        <div key={row.trigger_point} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm gap-2">
                            <span className="text-slate-700 font-medium truncate">{TRIGGER_LABELS[row.trigger_point] || row.trigger_point}</span>
                            <span className="text-slate-500 text-xs sm:text-sm shrink-0">{row.accepted}/{row.shown} ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-[#0055FE] rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-base font-semibold text-slate-900">Performance by Category</h3>
                  <p className="text-xs text-slate-500 mt-1 mb-4">Categories ordered by upsell revenue impact.</p>
                  <div className="space-y-3">
                    {(analytics.by_category || []).slice(0, 8).map((row) => {
                      const pct = Math.max(0, Math.min(100, row.acceptance_rate));
                      return (
                        <div key={row.category} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm gap-2 mb-0.5">
                            <span className="text-slate-700 font-medium">{row.category}</span>
                            <span className="text-slate-500 text-xs sm:text-sm">{row.accepted}/{row.shown} ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-[#0055FE]/70 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-base font-semibold text-slate-900 mb-4">No Thanks vs Add to Cart</h3>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[#0055FE] text-xs font-semibold">
                          <ShoppingCart className="h-3.5 w-3.5" strokeWidth={1.8} />
                          Add to Cart
                        </div>
                        <p className="text-2xl font-bold text-[#0055FE] mt-1">{acceptedVsRejected.accepted.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-slate-600 text-xs font-semibold">
                          <XCircle className="h-3.5 w-3.5" strokeWidth={1.8} />
                          No Thanks
                        </div>
                        <p className="text-2xl font-bold text-slate-700 mt-1">{acceptedVsRejected.rejected.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="h-4 w-full rounded-full overflow-hidden bg-slate-200 flex">
                      <div className="h-full bg-[#0055FE]" style={{ width: `${acceptedVsRejected.acceptedPct}%` }} />
                      <div className="h-full bg-red-400" style={{ width: `${acceptedVsRejected.rejectedPct}%` }} />
                      <div
                        className="h-full bg-slate-100"
                        style={{ width: `${Math.max(0, 100 - acceptedVsRejected.acceptedPct - acceptedVsRejected.rejectedPct)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs font-semibold">
                      <span className="text-[#0055FE]">{acceptedVsRejected.acceptedPct.toFixed(1)}% accepted</span>
                      <span className="text-red-500">{acceptedVsRejected.rejectedPct.toFixed(1)}% dismissed</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-base font-semibold text-slate-900 mb-4">Performance by Time of Day</h3>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                      <Clock3 className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.8} />
                      Peak hour: <span className="font-semibold">{peakHour.shown ? `${formatHour(peakHour.hour)} · ${peakHour.acceptance_rate.toFixed(0)}%` : "--"}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                      <Zap className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.8} />
                      Active hours: <span className="font-semibold">{activeHours} of 24</span>
                    </span>
                  </div>
                  <div className="flex items-end gap-1.5 h-36">
                    {byHourRows.map((row) => {
                      const height = Math.max(6, (row.shown / maxHourShown) * 100);
                      const hasData = row.shown > 0;
                      const isPeak = peakHour.shown > 0 && row.hour === peakHour.hour;
                      const isHovered = hoverHour === row.hour;
                      const barClass = isPeak
                        ? isHovered
                          ? "bg-[#3378FF]"
                          : "bg-[#0055FE]"
                        : isHovered
                          ? "bg-[#7ea5ff]"
                          : hasData
                            ? "bg-[#93b4ff]"
                            : "bg-slate-100";
                      return (
                        <div
                          key={`hour-${row.hour}`}
                          className="group flex flex-1 min-w-0 justify-center"
                          onMouseEnter={() => setHoverHour(row.hour)}
                          onMouseLeave={() => setHoverHour(null)}
                          title={`${formatHour(row.hour)} · ${row.acceptance_rate.toFixed(1)}% · ${row.accepted}/${row.shown}`}
                        >
                          <div
                            className={classNames("w-full rounded-t-md transition-colors", barClass)}
                            style={{ height: `${height}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-500">
                    <span className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-center">Night (11pm-5am)</span>
                    <span className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-center">Morning (6am-10am)</span>
                    <span className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-center">Afternoon (11am-4pm)</span>
                    <span className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1 text-center">Evening (5pm-10pm)</span>
                  </div>
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="text-base font-semibold text-slate-900 mb-4">Item Performance</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-3">Item</th>
                        <th className="py-2 pr-3 text-right">Shown</th>
                        <th className="py-2 pr-3 text-right">Add to Cart</th>
                        <th className="py-2 pr-3 text-right">No Thanks</th>
                        <th className="py-2 pr-0 text-right">Accept %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.top_items.length === 0 ? (
                        <tr>
                          <td className="py-3 text-slate-500" colSpan={5}>No item-level data yet.</td>
                        </tr>
                      ) : (
                        analytics.top_items.slice(0, 20).map((row) => {
                          const isWin = (row.accepted || 0) >= (row.rejected || 0);
                          const acceptRate = Number(row.acceptance_rate || 0);
                          const rateClass = acceptRate >= 50 ? "text-[#0055FE]" : acceptRate >= 25 ? "text-slate-600" : "text-red-500";
                          const imageUrl = row.item_id ? itemLookup.get(row.item_id)?.image_url : "";
                          return (
                            <tr key={`${row.item_id}-${row.item_name}`} className="border-b border-slate-100">
                              <td className="py-2 pr-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="h-8 w-8 rounded-md border border-slate-200 overflow-hidden bg-slate-50 shrink-0 flex items-center justify-center">
                                    {imageUrl ? (
                                      <img src={imageUrl} alt={row.item_name} className="h-full w-full object-cover" />
                                    ) : (
                                      <UtensilsCrossed className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.8} />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-slate-800 font-medium max-w-[190px]">{row.item_name || "Unknown"}</p>
                                    <span
                                      className={classNames(
                                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold mt-0.5",
                                        isWin ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700",
                                      )}
                                    >
                                      {isWin ? "Win" : "Lose"}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-slate-600 text-right tabular-nums">{row.shown}</td>
                              <td className="py-2 pr-3 text-[#0055FE] text-right tabular-nums">{row.accepted}</td>
                              <td className="py-2 pr-3 text-red-500 text-right tabular-nums">{row.rejected || 0}</td>
                              <td className="py-2 pr-0 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full bg-[#0055FE]" style={{ width: `${Math.max(0, Math.min(100, acceptRate))}%` }} />
                                  </div>
                                  <span className={classNames("text-xs font-semibold tabular-nums", rateClass)}>{acceptRate.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="text-base font-semibold text-slate-900 mb-2">Revenue Trend (Last 14 Days)</h3>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-[#0055FE]">
                    <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.8} />
                    Best day: <span className="font-semibold">{bestRevenueDay.label} · {formatCurrency(bestRevenueDay.value)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                    <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                    14-day total: <span className="font-semibold">{formatCurrency(trendTotalRevenue)}</span>
                  </span>
                </div>
                <div className="grid grid-cols-14 gap-2 items-end h-44">
                  {revenueSeries14Days.map((row) => {
                    const height = Math.max(10, (row.value / maxRevenue) * 100);
                    const isBest = bestRevenueDay.iso === row.iso && row.value > 0;
                    return (
                      <div key={row.iso} className="flex flex-col items-center gap-2">
                        <div
                          className={classNames(
                            "w-full rounded-t-md",
                            row.value === 0 ? "bg-slate-100" : isBest ? "bg-[#0055FE]" : "bg-[#93b4ff]",
                          )}
                          style={{ height: `${height}%` }}
                          title={`${row.label}: ${formatCurrency(row.value)}`}
                        />
                        <span className="text-[10px] text-slate-500">{row.label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {activeTab === "pairing" && (
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <GitFork className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
                Top Pairing Intelligence
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Learned from real completed orders - which items customers actually buy together. Stronger associations rise to the top and influence upsell rankings.
              </p>
            </div>
            <button
              onClick={() => fetchPairingIntelligence(true)}
              disabled={runningIntelligence}
              className="inline-flex items-center gap-2 rounded-lg border border-[#0055FE] bg-white px-4 py-2 text-sm font-semibold text-[#0055FE] hover:bg-blue-50 disabled:opacity-60"
            >
              {runningIntelligence ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
              Run Intelligence
            </button>
          </section>

          <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700 flex gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">How it works</p>
              <p className="text-slate-600 mt-1">
                Association strength is a normalized lift score from delivered/completed/served orders in the last 60 days. Pairs with fewer than 2 co-orders are ignored as noise.
              </p>
            </div>
          </section>

          {pairingRows.length === 0 ? (
            <section className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
              <GitFork className="mx-auto h-8 w-8 text-slate-300" strokeWidth={1.8} />
              <p className="mt-3 text-base font-semibold text-slate-700">No pairings yet</p>
              <p className="mt-1 text-sm text-slate-500">Run intelligence to compute co-order pairings from completed orders.</p>
              <button
                onClick={() => fetchPairingIntelligence(true)}
                disabled={runningIntelligence}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0055FE] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {runningIntelligence ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
                Run Intelligence Now
              </button>
            </section>
          ) : (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2.5 px-4">When Customer Adds</th>
                      <th className="py-2.5 pr-3">Suggest</th>
                      <th className="py-2.5 pr-3 text-right">Co-orders</th>
                      <th className="py-2.5 pr-3 text-right">Strength</th>
                      <th className="py-2.5 pr-3 text-right">Accepted</th>
                      <th className="py-2.5 pr-3 text-right">Shown</th>
                      <th className="py-2.5 pr-4 text-right">Accept %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairingRows.map((row, idx) => {
                      const strengthPct = Math.max(0, Math.min(Number(row.association_strength || 0) * 100, 100));
                      const acceptRate = Number(row.accept_rate || 0);
                      const rateClass = acceptRate >= 50 ? "text-[#0055FE]" : acceptRate >= 25 ? "text-slate-600" : "text-red-500";
                      return (
                        <tr key={`${row.source_item_id}-${row.target_item_id}-${idx}`} className="border-b border-slate-100 last:border-none">
                          <td className="py-2.5 px-4 text-slate-800 font-medium max-w-[230px] truncate">{row.source_item_name}</td>
                          <td className="py-2.5 pr-3 text-slate-700 max-w-[220px] truncate">{row.target_item_name}</td>
                          <td className="py-2.5 pr-3 text-slate-600 text-right tabular-nums">{row.frequency}</td>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-[#0055FE]" style={{ width: `${strengthPct}%` }} />
                              </div>
                              <span className="text-xs text-slate-600 w-10 text-right tabular-nums">{strengthPct.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 text-[#0055FE] text-right tabular-nums">{row.accepted_count || 0}</td>
                          <td className="py-2.5 pr-3 text-slate-600 text-right tabular-nums">{row.shown_count || 0}</td>
                          <td className={classNames("py-2.5 pr-4 text-right text-xs font-semibold tabular-nums", rateClass)}>
                            {acceptRate.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                {pairingRows.length} associations learned from the last 60 days of delivered orders. Strength is normalized lift score.
              </div>
            </section>
          )}
        </div>
      )}

      {activeTab === "items" && (
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">All Items</h3>
              <p className="text-sm text-slate-500 mt-1">Toggle items on/off for suggestions. Off means never shown to customers.</p>
            </div>
            <div className="flex w-full md:w-auto items-center gap-3">
              <div className="hidden md:flex items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#0055FE]" /> Enabled</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" /> Disabled</span>
              </div>
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search item..."
                className="w-full md:w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </section>

          {groupedItems.map((group) => (
            <section key={group.name} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{group.name}</h4>
                <span className="text-xs text-slate-500">{group.rows.length} items</span>
              </div>
              <div className="divide-y divide-slate-100">
                {group.rows.map((item) => (
                  <div key={item.id} className={classNames("px-4 py-3 transition", item.enabled ? "bg-white" : "bg-slate-50 opacity-50")}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.item_name} className="h-full w-full object-cover" />
                        ) : (
                          <UtensilsCrossed className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.8} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.item_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{formatCurrency(item.price)}</p>
                      </div>

                      <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-600">
                        <span>Shown: <span className="font-semibold tabular-nums">{item.shown_count || 0}</span></span>
                        <span className="text-[#0055FE]">Add: <span className="font-semibold tabular-nums">{item.accepted_count || 0}</span></span>
                        <span className="text-red-500">No: <span className="font-semibold tabular-nums">{item.rejected_count || 0}</span></span>
                        <span className={classNames("font-semibold tabular-nums", item.acceptance_rate >= 50 ? "text-[#0055FE]" : item.acceptance_rate >= 25 ? "text-slate-600" : "text-red-500")}>
                          {Number(item.acceptance_rate || 0).toFixed(1)}%
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={classNames("text-xs font-semibold", item.enabled ? "text-[#0055FE]" : "text-slate-500")}>
                          {item.enabled ? "Enabled" : "Disabled"}
                        </span>
                        {updatingItemId === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-[#0055FE]" />
                        ) : (
                          <ToggleSwitch checked={item.enabled} onChange={(next) => toggleItemEnabled(item.id, next)} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {groupedItems.length === 0 && (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-500">
              No items found for this filter.
            </div>
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 gap-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Upsell Strategy</h3>
                <p className="text-sm text-slate-500 mt-1">How the engine prioritizes which items to recommend.</p>
              </div>
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin text-[#0055FE]" /> : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Strategy</p>
                <select
                  value={settings.strategy}
                  onChange={(e) => patchSettings({ strategy: e.target.value as UpsellSettings["strategy"] })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {STRATEGY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">Aggressiveness</p>
                <select
                  value={settings.aggressiveness}
                  onChange={(e) => patchSettings({ aggressiveness: e.target.value as UpsellSettings["aggressiveness"] })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {AGGRESSIVENESS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">Tone</p>
                <select
                  value={settings.tone}
                  onChange={(e) => patchSettings({ tone: e.target.value as UpsellSettings["tone"] })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {TONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs text-slate-500 mb-2">Prioritized Categories (optional)</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {categoryOptions.map((category) => {
                  const active = (settings.prioritized_categories_list || []).includes(category.id);
                  return (
                    <button
                      key={`prio-${category.id}`}
                      onClick={() => handleTogglePrioritizedCategory(category.id)}
                      className={classNames(
                        "rounded-lg border px-3 py-2 text-left text-sm",
                        active
                          ? "border-[#0055FE] bg-blue-50 text-[#0055FE]"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0055FE] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-lg font-semibold text-slate-900">Trigger Points</h3>
            <p className="text-sm text-slate-500 mt-1 mb-4">Choose where upsell suggestions appear in the customer journey.</p>
            <div className="space-y-2">
              {[
                {
                  key: "show_after_add_to_cart",
                  icon: ShoppingCart,
                  title: "After Add to Cart",
                  desc: "Show one smart suggestion immediately after a customer adds an item.",
                  value: settings.show_after_add_to_cart,
                },
                {
                  key: "show_in_cart",
                  icon: Tag,
                  title: "Inside Cart",
                  desc: "Show 1-2 suggestions between cart items and the place order button.",
                  value: settings.show_in_cart,
                },
                {
                  key: "show_before_payment",
                  icon: CreditCard,
                  title: "Before Payment",
                  desc: "One final subtle suggestion above the confirm order button.",
                  value: settings.show_before_payment,
                },
              ].map((trigger) => (
                <div key={trigger.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white">
                        <trigger.icon className="h-4 w-4 text-slate-500" strokeWidth={1.8} />
                      </span>
                      <p className="text-sm font-semibold text-slate-800">{trigger.title}</p>
                      <p className="text-xs text-slate-500 mt-1">{trigger.desc}</p>
                    </div>
                    <ToggleSwitch
                      checked={trigger.value}
                      onChange={(next) => patchSettings({ [trigger.key]: next } as Partial<UpsellSettings>)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 mt-5">
              <p className="text-xs text-slate-500">Category Role Mapping</p>
              {ROLE_KEYS.map((role) => (
                <div key={role}>
                  <p className="text-sm font-medium text-slate-700 capitalize mb-1">{role}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {categoryOptions.map((category) => {
                      const active = (settings.category_role_map?.[role] || []).includes(category.id);
                      return (
                        <button
                          key={`${role}-${category.id}`}
                          onClick={() => handleToggleRoleCategory(role, category.id)}
                          className={classNames(
                            "rounded-lg border px-3 py-1.5 text-left text-xs",
                            active
                              ? "border-[#0055FE] bg-blue-50 text-[#0055FE]"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                          )}
                        >
                          {category.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Manual Pairings & Blocks</h3>
                <p className="text-sm text-slate-500 mt-1">Define item combinations to always pair or never suggest together.</p>
              </div>
              <button
                onClick={() => setAddingRule((prev) => !prev)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#0055FE] bg-white px-3 py-2 text-sm font-semibold text-[#0055FE] hover:bg-blue-50"
              >
                <Plus size={14} />
                {addingRule ? "Close" : "Add Rule"}
              </button>
            </div>

            {addingRule ? (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select
                    value={newRule.type}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, type: e.target.value as "pair" | "block" }))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="pair">Pair Rule</option>
                    <option value="block">Block Rule</option>
                  </select>

                  <select
                    value={newRule.source_item || ""}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, source_item: Number(e.target.value) }))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">When customer adds...</option>
                    {items.slice(0, 40).map((item) => (
                      <option key={`src-${item.id}`} value={item.id}>{item.item_name}</option>
                    ))}
                  </select>

                  <select
                    value={newRule.target_item || ""}
                    onChange={(e) => setNewRule((prev) => ({ ...prev, target_item: Number(e.target.value) }))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Suggest / Block this item...</option>
                    {items.filter((item) => item.id !== newRule.source_item).slice(0, 40).map((item) => (
                      <option key={`tgt-${item.id}`} value={item.id}>{item.item_name}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => setAddingRule(false)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addRule}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <Plus size={14} />
                    Save Rule
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">When customer adds</th>
                    <th className="py-2 pr-3">Target</th>
                    <th className="py-2 pr-0">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-3 text-slate-500">No manual rules configured.</td>
                    </tr>
                  ) : (
                    rules.map((rule) => (
                      <tr key={rule.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3 capitalize font-medium text-slate-700">
                          <span
                            className={classNames(
                              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs",
                              rule.type === "pair" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                            )}
                          >
                            {rule.type === "pair" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {rule.type}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-slate-600">{rule.source_item_name || itemLookup.get(rule.source_item)?.item_name || rule.source_item}</td>
                        <td className="py-2 pr-3 text-slate-600">{rule.target_item_name || itemLookup.get(rule.target_item)?.item_name || rule.target_item}</td>
                        <td className="py-2 pr-0">
                          <button
                            onClick={() => deleteRule(rule.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={13} />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2">
              <Eye className="w-4 h-4 mt-0.5 text-slate-400" />
              <p>
                Pair rule = always prioritize item Y when item X is added. Block rule = suppress item Y when item X is added.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default ScreenRestaurantUpsell;
