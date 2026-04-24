import { useCallback, useEffect, useMemo, useState } from "react";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import {
  AlertCircle,
  Check,
  Eye,
  Loader2,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  WandSparkles,
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
  const [itemSearch, setItemSearch] = useState("");
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [newRule, setNewRule] = useState<NewRuleDraft>({ type: "pair" });

  const userRole = useMemo(() => resolveUpsellUserRole(), []);

  const currency = useMemo(() => {
    try {
      const raw = localStorage.getItem("userInfo");
      if (!raw) return "AED";
      const parsed = JSON.parse(raw);
      return parsed?.restaurants?.[0]?.currency || parsed?.user?.restaurants?.[0]?.currency || "AED";
    } catch {
      return "AED";
    }
  }, []);

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
    const groups = new Map<string, UpsellItemRow[]>();

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
        const existing = groups.get(groupKey) || [];
        existing.push(item);
        groups.set(groupKey, existing);
      });

    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
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

  const fetchUpsellData = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      else setRefreshing(true);

      const [settingsRes, rulesRes, analyticsRes, itemsRes] = await Promise.all([
        axiosInstance.get("/api/upsell/settings"),
        axiosInstance.get("/api/upsell/rules"),
        axiosInstance.get("/api/upsell/analytics"),
        axiosInstance.get("/api/upsell/items"),
      ]);

      setSettings(normalizeSettings(settingsRes.data || DEFAULT_SETTINGS));
      setRules(Array.isArray(rulesRes.data) ? rulesRes.data : []);
      setAnalytics({ ...DEFAULT_ANALYTICS, ...(analyticsRes.data || {}) });
      setItems(Array.isArray(itemsRes.data?.results) ? itemsRes.data.results : []);
    } catch {
      toast.error("Failed to load AI upsell data.");
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
    fetchUpsellData(true);
  }, [fetchUpsellData]);

  useEffect(() => {
    if (activeTab === "pairing" && !pairingLoaded) {
      fetchPairingIntelligence(false);
    }
  }, [activeTab, pairingLoaded, fetchPairingIntelligence]);

  const persistSettings = async (nextSettings: UpsellSettings, successMessage: string) => {
    const payload = {
      ...nextSettings,
      prioritized_categories: (nextSettings.prioritized_categories_list || []).join(","),
      category_role_map: nextSettings.category_role_map,
    };

    const response = await axiosInstance.put("/api/upsell/settings", payload);
    const normalized = normalizeSettings(response.data || payload);
    setSettings(normalized);
    toast.success(successMessage);
  };

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      await persistSettings(settings, "Upsell settings saved.");
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
    setSettings((prev) => {
      const active = new Set(prev.prioritized_categories_list || []);
      if (active.has(categoryId)) active.delete(categoryId);
      else active.add(categoryId);
      return { ...prev, prioritized_categories_list: Array.from(active) };
    });
  };

  const handleToggleRoleCategory = (role: (typeof ROLE_KEYS)[number], categoryId: number) => {
    setSettings((prev) => {
      const active = new Set(prev.category_role_map?.[role] || []);
      if (active.has(categoryId)) active.delete(categoryId);
      else active.add(categoryId);
      return {
        ...prev,
        category_role_map: {
          ...prev.category_role_map,
          [role]: Array.from(active),
        },
      };
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
    await fetchUpsellData(false);
    if (pairingLoaded) {
      await fetchPairingIntelligence(false);
    }
  };

  const formatCurrency = (value: string | number) => {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  };

  const getHourZoneClass = (hour: number) => {
    if (hour <= 5 || hour === 23) return "bg-slate-300";
    if (hour < 12) return "bg-blue-400";
    if (hour < 18) return "bg-amber-400";
    return "bg-violet-400";
  };

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
            <h2 className="text-2xl font-bold text-slate-900">AI Upsell Engine</h2>
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

        <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={classNames(
                "rounded-xl border px-4 py-3 text-left transition",
                activeTab === tab.key
                  ? "border-[#0055FE] bg-blue-50 text-[#0055FE]"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              <p className="text-sm font-semibold">{tab.label}</p>
              <p className="text-xs mt-1 opacity-90">{tab.description}</p>
            </button>
          ))}
        </div>
      </div>

      {activeTab === "performance" && (
        <div className="space-y-5">
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[
              { label: "Offers Shown", value: analytics.total_shown.toLocaleString() },
              { label: "Add to Cart", value: analytics.total_accepted.toLocaleString() },
              { label: "No Thanks", value: analytics.total_rejected.toLocaleString() },
              { label: "Acceptance Rate", value: `${analytics.acceptance_rate.toFixed(2)}%` },
              { label: "Upsell Revenue", value: formatCurrency(analytics.upsell_revenue) },
              { label: "Avg Upsell Value", value: formatCurrency(analytics.avg_upsell_value) },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{kpi.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-2">{kpi.value}</p>
              </div>
            ))}
          </section>

          {analytics.total_shown === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center">
              <Sparkles className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-lg font-semibold text-slate-700 mt-3">No upsell interaction data yet</p>
              <p className="text-sm text-slate-500 mt-1">Once customers start seeing suggestions, performance analytics will appear here.</p>
            </div>
          ) : (
            <>
              <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-base font-semibold text-slate-900 mb-4">Performance by Trigger Point</h3>
                  <div className="space-y-3">
                    {(analytics.by_trigger || []).map((row) => {
                      const pct = Math.max(0, Math.min(100, row.acceptance_rate));
                      return (
                        <div key={row.trigger_point}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-slate-700 font-medium">{TRIGGER_LABELS[row.trigger_point] || row.trigger_point}</span>
                            <span className="text-slate-500">{row.accepted}/{row.shown} ({pct.toFixed(1)}%)</span>
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
                  <h3 className="text-base font-semibold text-slate-900 mb-4">Performance by Category</h3>
                  <div className="space-y-3">
                    {(analytics.by_category || []).slice(0, 8).map((row) => {
                      const pct = Math.max(0, Math.min(100, row.acceptance_rate));
                      return (
                        <div key={row.category}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-slate-700 font-medium">{row.category}</span>
                            <span className="text-slate-500">{row.accepted}/{row.shown} ({pct.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
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
                    <div className="h-4 w-full rounded-full overflow-hidden bg-slate-200 flex">
                      <div className="h-full bg-emerald-500" style={{ width: `${acceptedVsRejected.acceptedPct}%` }} />
                      <div className="h-full bg-rose-500" style={{ width: `${acceptedVsRejected.rejectedPct}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                      <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                        <p className="text-slate-500 text-xs">Add to Cart</p>
                        <p className="font-bold text-emerald-600">{acceptedVsRejected.accepted.toLocaleString()} ({acceptedVsRejected.acceptedPct.toFixed(1)}%)</p>
                      </div>
                      <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                        <p className="text-slate-500 text-xs">No Thanks</p>
                        <p className="font-bold text-rose-600">{acceptedVsRejected.rejected.toLocaleString()} ({acceptedVsRejected.rejectedPct.toFixed(1)}%)</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h3 className="text-base font-semibold text-slate-900 mb-4">Performance by Time of Day</h3>
                  <div className="grid grid-cols-12 gap-1 items-end h-36">
                    {(analytics.by_hour || []).map((row) => {
                      const height = Math.max(8, (row.shown / maxHourShown) * 100);
                      return (
                        <div key={`hour-${row.hour}`} className="group flex justify-center">
                          <div
                            className={classNames("w-full rounded-t-sm transition-opacity", getHourZoneClass(row.hour))}
                            style={{ height: `${height}%` }}
                            title={`${String(row.hour).padStart(2, "0")}:00 • shown ${row.shown}, accepted ${row.accepted}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-300" /> Night</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-400" /> Morning</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400" /> Afternoon</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-violet-400" /> Evening</span>
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
                        <th className="py-2 pr-3">Shown</th>
                        <th className="py-2 pr-3">Accepted</th>
                        <th className="py-2 pr-3">Declined</th>
                        <th className="py-2 pr-3">Rate</th>
                        <th className="py-2 pr-3">Revenue</th>
                        <th className="py-2 pr-0">Win/Lose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.top_items.length === 0 ? (
                        <tr>
                          <td className="py-3 text-slate-500" colSpan={7}>No item-level data yet.</td>
                        </tr>
                      ) : (
                        analytics.top_items.slice(0, 20).map((row) => {
                          const isWin = (row.accepted || 0) >= (row.rejected || 0);
                          return (
                            <tr key={`${row.item_id}-${row.item_name}`} className="border-b border-slate-100">
                              <td className="py-2 pr-3 text-slate-800 font-medium">{row.item_name || "Unknown"}</td>
                              <td className="py-2 pr-3 text-slate-600">{row.shown}</td>
                              <td className="py-2 pr-3 text-slate-600">{row.accepted}</td>
                              <td className="py-2 pr-3 text-slate-600">{row.rejected || 0}</td>
                              <td className="py-2 pr-3 text-slate-600">{(row.acceptance_rate || 0).toFixed(1)}%</td>
                              <td className="py-2 pr-3 text-slate-600">{formatCurrency(row.revenue)}</td>
                              <td className="py-2 pr-0">
                                <span
                                  className={classNames(
                                    "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
                                    isWin ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                                  )}
                                >
                                  {isWin ? "Win" : "Lose"}
                                </span>
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
                <h3 className="text-base font-semibold text-slate-900 mb-4">Revenue Trend (Last 14 Days)</h3>
                <div className="grid grid-cols-14 gap-2 items-end h-44">
                  {revenueSeries14Days.map((row) => {
                    const height = Math.max(10, (row.value / maxRevenue) * 100);
                    return (
                      <div key={row.iso} className="flex flex-col items-center gap-2">
                        <div className="w-full rounded-t-md bg-[#0055FE]/85" style={{ height: `${height}%` }} title={`${row.label}: ${formatCurrency(row.value)}`} />
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
          <section className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Pairing Intelligence</h3>
              <p className="text-sm text-slate-500 mt-1">Learns from completed orders to discover high-converting pairings.</p>
            </div>
            <button
              onClick={() => fetchPairingIntelligence(true)}
              disabled={runningIntelligence}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0055FE] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {runningIntelligence ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
              Run Intelligence
            </button>
          </section>

          <section className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-900 flex gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">How it works</p>
              <p className="text-blue-800/90 mt-1">
                Association strength is derived from co-order frequency in delivered/completed/served orders. Pairs with fewer than 2 co-orders are ignored.
              </p>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3">When customer adds</th>
                    <th className="py-2 pr-3">Suggest</th>
                    <th className="py-2 pr-3">Co-order frequency</th>
                    <th className="py-2 pr-3">Association strength</th>
                    <th className="py-2 pr-3">Shown</th>
                    <th className="py-2 pr-3">Accepted</th>
                    <th className="py-2 pr-0">Accept rate</th>
                  </tr>
                </thead>
                <tbody>
                  {pairingRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-slate-500">
                        No pairing intelligence yet. Click "Run Intelligence" to compute pairings.
                      </td>
                    </tr>
                  ) : (
                    pairingRows.map((row, idx) => (
                      <tr key={`${row.source_item_id}-${row.target_item_id}-${idx}`} className="border-b border-slate-100">
                        <td className="py-2 pr-3 text-slate-800 font-medium">{row.source_item_name}</td>
                        <td className="py-2 pr-3 text-slate-800 font-medium">{row.target_item_name}</td>
                        <td className="py-2 pr-3 text-slate-600">{row.frequency}</td>
                        <td className="py-2 pr-3 text-slate-600">{Number(row.association_strength || 0).toFixed(6)}</td>
                        <td className="py-2 pr-3 text-slate-600">{row.shown_count || 0}</td>
                        <td className="py-2 pr-3 text-slate-600">{row.accepted_count || 0}</td>
                        <td className="py-2 pr-0 text-slate-600">{(row.accept_rate || 0).toFixed(1)}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === "items" && (
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">All Items</h3>
              <p className="text-sm text-slate-500 mt-1">Disable items that should never appear in AI suggestions.</p>
            </div>
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search item..."
              className="w-full md:w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </section>

          {groupedItems.map(([categoryName, rows]) => (
            <section key={categoryName} className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-base font-semibold text-slate-800">{categoryName}</h4>
                <span className="text-xs text-slate-500">{rows.length} items</span>
              </div>
              <div className="space-y-2">
                {rows.map((item) => (
                  <div key={item.id} className="border border-slate-100 rounded-xl px-3 py-2 bg-slate-50/60">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.item_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 text-[10px]">No image</div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.item_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{formatCurrency(item.price)}</p>
                      </div>

                      <div className="hidden md:flex items-center gap-3 text-xs text-slate-600">
                        <span>Shown: {item.shown_count || 0}</span>
                        <span>Accepted: {item.accepted_count || 0}</span>
                        <span>Accept %: {(item.acceptance_rate || 0).toFixed(1)}%</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={classNames("text-xs font-semibold", item.enabled ? "text-emerald-600" : "text-slate-500")}>
                          {item.enabled ? "Enabled" : "Disabled"}
                        </span>
                        {updatingItemId === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-[#0055FE]" />
                        ) : (
                          <ToggleSwitch
                            checked={item.enabled}
                            onChange={(next) => toggleItemEnabled(item.id, next)}
                          />
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Upsell Strategy</h3>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0055FE] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Strategy</p>
                <select
                  value={settings.strategy}
                  onChange={(e) => setSettings((prev) => ({ ...prev, strategy: e.target.value as UpsellSettings["strategy"] }))}
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
                  onChange={(e) => setSettings((prev) => ({ ...prev, aggressiveness: e.target.value as UpsellSettings["aggressiveness"] }))}
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
                  onChange={(e) => setSettings((prev) => ({ ...prev, tone: e.target.value as UpsellSettings["tone"] }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {TONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs text-slate-500 mb-2">Prioritized Categories</p>
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
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Trigger Points</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  key: "show_after_add_to_cart",
                  title: "After Add to Cart",
                  desc: "Bottom-sheet popup after item add",
                  value: settings.show_after_add_to_cart,
                },
                {
                  key: "show_in_cart",
                  title: "Inside Cart",
                  desc: "Inline cards between cart and pay button",
                  value: settings.show_in_cart,
                },
                {
                  key: "show_before_payment",
                  title: "Before Payment",
                  desc: "Final suggestion above confirm button",
                  value: settings.show_before_payment,
                },
              ].map((trigger) => (
                <div key={trigger.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{trigger.title}</p>
                      <p className="text-xs text-slate-500 mt-1">{trigger.desc}</p>
                    </div>
                    <ToggleSwitch
                      checked={trigger.value}
                      onChange={(next) => setSettings((prev) => ({ ...prev, [trigger.key]: next }))}
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
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
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
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Manual Pairings & Blocks</h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                <option value="">When customer adds</option>
                {items.map((item) => (
                  <option key={`src-${item.id}`} value={item.id}>{item.item_name}</option>
                ))}
              </select>

              <select
                value={newRule.target_item || ""}
                onChange={(e) => setNewRule((prev) => ({ ...prev, target_item: Number(e.target.value) }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Suggest / Block this item</option>
                {items.map((item) => (
                  <option key={`tgt-${item.id}`} value={item.id}>{item.item_name}</option>
                ))}
              </select>

              <button
                onClick={addRule}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={14} />
                Add Rule
              </button>
            </div>

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
                        <td className="py-2 pr-3 capitalize font-medium text-slate-700">{rule.type}</td>
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
