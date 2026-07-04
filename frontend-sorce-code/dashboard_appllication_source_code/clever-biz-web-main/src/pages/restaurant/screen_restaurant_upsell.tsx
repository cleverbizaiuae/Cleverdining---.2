import { useCallback, useEffect, useMemo, useState } from "react";
import axiosInstance from "@/lib/axios";
import { cachedGet, invalidateApiCache } from "@/lib/requestCache";
import { useRestaurantContext } from "@/lib/useRestaurantContext";
import { OptimizedImage } from "@/components/OptimizedImage";
import toast from "react-hot-toast";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Database,
  Eye,
  GitFork,
  Loader2,
  Plus,
  RefreshCw,
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
    | "max_revenue"
    | "move_stock";
  aggressiveness: "subtle" | "moderate" | "aggressive";
  show_after_add_to_cart: boolean;
  show_in_cart: boolean;
  show_before_payment: boolean;
  tone: "friendly" | "premium" | "minimal";
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
    image_url?: string;
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

const STRATEGY_OPTIONS: Array<{
  value: UpsellSettings["strategy"];
  label: string;
  description: string;
  badge?: string;
}> = [
  {
    value: "balanced",
    label: "Balanced",
    badge: "Recommended",
    description: "Suggests the item most likely to be accepted based on past orders. Safe and smart choice for most restaurants.",
  },
  {
    value: "max_revenue",
    label: "Maximise Revenue",
    description: "Prioritises the highest-priced items in the suggested category. Best for increasing order value.",
  },
  {
    value: "move_stock",
    label: "Move Stock",
    description: "Pushes items that have not been selling well. Use this when you want to clear specific items.",
  },
];

const AGGRESSIVENESS_OPTIONS: Array<{
  value: UpsellSettings["aggressiveness"];
  label: string;
  cap: string;
  description: string;
}> = [
  {
    value: "subtle",
    label: "Subtle",
    cap: "Max 2 per session",
    description: "One gentle suggestion shown occasionally. Customers barely notice it. Best for fine dining or relaxed venues.",
  },
  {
    value: "moderate",
    label: "Moderate",
    cap: "Max 4 per session",
    description: "A few suggestions at the right moments. Balanced and effective for most restaurants.",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    cap: "Max 6 per session",
    description: "Suggestions at every opportunity. Best for maximising revenue in high-volume venues.",
  },
];

const TONE_OPTIONS: Array<{
  value: UpsellSettings["tone"];
  label: string;
  description: string;
  example: string;
}> = [
  {
    value: "friendly",
    label: "Friendly",
    description: "Warm and casual. Works for cafes, casual restaurants, shisha lounges.",
    example: "Pairs perfectly with your Burger - add a Chocolate Shake?",
  },
  {
    value: "premium",
    label: "Premium",
    description: "Refined and understated. Works for fine dining, upmarket venues.",
    example: "Your meal would be complemented beautifully by our Vanilla Ice-Cream.",
  },
  {
    value: "minimal",
    label: "Minimal",
    description: "Short and direct. No fluff. Works anywhere.",
    example: "Add a Drink? +AED 50",
  },
];

const TRIGGER_LABELS: Record<string, string> = {
  add_to_cart: "After Add To Cart",
  cart: "Inside Cart",
  before_payment: "Before Payment",
};

const TRIGGER_OPTIONS: Array<{
  key: keyof Pick<UpsellSettings, "show_after_add_to_cart" | "show_in_cart" | "show_before_payment">;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    key: "show_after_add_to_cart",
    label: "After Add to Cart",
    description: "One smart suggestion fires the moment a customer adds any item. This is the highest-converting moment - customer is in buying mode.",
    icon: ShoppingCart,
  },
  {
    key: "show_in_cart",
    label: "Inside Cart",
    description: "Shows 1-2 suggestions when the customer opens the cart to review their order before placing it.",
    icon: Tag,
  },
  {
    key: "show_before_payment",
    label: "Before Payment",
    description: "One last gentle suggestion just above the confirm button. Best for small items - a drink, dessert, or add-on.",
    icon: CreditCard,
  },
];

const SMART_SUGGESTION_ROWS = [
  ["Has a main dish only", "Suggests a drink next"],
  ["Has a main + drink", "Suggests a dessert or starter next"],
  ["Has a main + dessert", "Suggests a drink next"],
  ["Has a main + drink + dessert", "Suggests a starter or premium add-on"],
  ["Has a drink only", "Suggests a main dish first"],
  ["Has a dessert only", "Suggests a hot drink or juice"],
  ["Has a starter only", "Suggests a main dish"],
];

const DEMO_PAIRING_ROWS: PairingRow[] = [
  { source_item_id: 1, source_item_name: "Classic Cheeseburger", target_item_id: 2, target_item_name: "Cola", frequency: 24, association_strength: 0.92, shown_count: 58, accepted_count: 38, dismissed_count: 20, accept_rate: 66 },
  { source_item_id: 3, source_item_name: "Double Apple Shisha", target_item_id: 4, target_item_name: "Classic Mojito", frequency: 22, association_strength: 0.89, shown_count: 51, accepted_count: 35, dismissed_count: 16, accept_rate: 69 },
  { source_item_id: 5, source_item_name: "Truffle Burger", target_item_id: 4, target_item_name: "Classic Mojito", frequency: 18, association_strength: 0.87, shown_count: 42, accepted_count: 26, dismissed_count: 16, accept_rate: 62 },
  { source_item_id: 6, source_item_name: "Sirloin Steak", target_item_id: 2, target_item_name: "Cola", frequency: 16, association_strength: 0.8, shown_count: 40, accepted_count: 24, dismissed_count: 16, accept_rate: 60 },
  { source_item_id: 5, source_item_name: "Truffle Burger", target_item_id: 7, target_item_name: "Fries", frequency: 15, association_strength: 0.76, shown_count: 37, accepted_count: 22, dismissed_count: 15, accept_rate: 59 },
  { source_item_id: 8, source_item_name: "Premium Sushi Platter", target_item_id: 4, target_item_name: "Classic Mojito", frequency: 14, association_strength: 0.74, shown_count: 33, accepted_count: 18, dismissed_count: 15, accept_rate: 55 },
  { source_item_id: 9, source_item_name: "Carbonara", target_item_id: 4, target_item_name: "Classic Mojito", frequency: 12, association_strength: 0.68, shown_count: 29, accepted_count: 14, dismissed_count: 15, accept_rate: 48 },
  { source_item_id: 10, source_item_name: "Salmon Sashimi", target_item_id: 11, target_item_name: "Dragon Roll", frequency: 11, association_strength: 0.72, shown_count: 24, accepted_count: 13, dismissed_count: 11, accept_rate: 54 },
  { source_item_id: 11, source_item_name: "Dragon Roll", target_item_id: 8, target_item_name: "Premium Sushi Platter", frequency: 9, association_strength: 0.65, shown_count: 20, accepted_count: 9, dismissed_count: 11, accept_rate: 45 },
  { source_item_id: 12, source_item_name: "Spicy Chicken Burger", target_item_id: 13, target_item_name: "Lemonade", frequency: 8, association_strength: 0.56, shown_count: 19, accepted_count: 7, dismissed_count: 12, accept_rate: 37 },
  { source_item_id: 14, source_item_name: "Wagyu Slider", target_item_id: 15, target_item_name: "Chocolate Lava Cake", frequency: 7, association_strength: 0.48, shown_count: 15, accepted_count: 4, dismissed_count: 11, accept_rate: 27 },
];

const classNames = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const normalizeStrategyValue = (value: unknown): UpsellSettings["strategy"] => {
  const raw = String(value || "balanced");
  if (["highest_margin", "premium_experience", "margin"].includes(raw)) return "max_revenue";
  if (["inventory_movement", "volume"].includes(raw)) return "move_stock";
  if (raw === "max_revenue" || raw === "move_stock" || raw === "balanced") return raw;
  return "balanced";
};

const normalizeToneValue = (value: unknown): UpsellSettings["tone"] => {
  const raw = String(value || "friendly");
  if (raw === "professional") return "premium";
  if (raw === "minimal" || raw === "premium" || raw === "friendly") return raw;
  return "friendly";
};

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
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        checked ? "bg-[#0055FE]" : "bg-slate-200",
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <span
        className={classNames(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
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
      if (Number.isInteger(item.id)) map.set(item.id, item);
      if (Number.isInteger(item.item)) map.set(item.item, item);
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

  const performanceItems = useMemo(() => {
    const aggregated = new Map<string, UpsellAnalytics["top_items"][number]>();

    (analytics.top_items || []).forEach((row) => {
      const key = row.item_id ? `id:${row.item_id}` : `name:${String(row.item_name || "").toLowerCase()}`;
      const lookupImage = row.item_id ? itemLookup.get(row.item_id)?.image_url : "";
      const existing = aggregated.get(key);

      if (!existing) {
        aggregated.set(key, {
          ...row,
          image_url: row.image_url || lookupImage || "",
          shown: Number(row.shown || 0),
          accepted: Number(row.accepted || 0),
          rejected: Number(row.rejected || 0),
          revenue: String(Number(row.revenue || 0)),
          acceptance_rate: Number(row.acceptance_rate || 0),
        });
        return;
      }

      const shown = Number(existing.shown || 0) + Number(row.shown || 0);
      const accepted = Number(existing.accepted || 0) + Number(row.accepted || 0);
      const rejected = Number(existing.rejected || 0) + Number(row.rejected || 0);
      aggregated.set(key, {
        ...existing,
        image_url: existing.image_url || row.image_url || lookupImage || "",
        shown,
        accepted,
        rejected,
        revenue: String(Number(existing.revenue || 0) + Number(row.revenue || 0)),
        acceptance_rate: shown ? (accepted / shown) * 100 : 0,
      });
    });

    return Array.from(aggregated.values()).sort((a, b) => Number(b.shown || 0) - Number(a.shown || 0));
  }, [analytics.top_items, itemLookup]);

  const triggerRows = useMemo(() => {
    const analyticsMap = new Map((analytics.by_trigger || []).map((row) => [row.trigger_point, row]));
    return [
      { key: "add_to_cart", label: "After Add To Cart", data: analyticsMap.get("add_to_cart") },
      { key: "cart", label: "Inside Cart", data: analyticsMap.get("cart") },
      { key: "before_payment", label: "Before Payment", data: analyticsMap.get("before_payment") },
    ].map((row) => ({
      ...row,
      shown: Number(row.data?.shown || 0),
      accepted: Number(row.data?.accepted || 0),
      acceptance_rate: Number(row.data?.acceptance_rate || 0),
    }));
  }, [analytics.by_trigger]);

  const categoryRows = useMemo(() => {
    return (analytics.by_category || []).slice(0, 8).map((row) => ({
      category: row.category || "Uncategorized",
      shown: Number(row.shown || 0),
      accepted: Number(row.accepted || 0),
      acceptance_rate: Number(row.acceptance_rate || 0),
    }));
  }, [analytics.by_category]);

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
      strategy: normalizeStrategyValue(incoming?.strategy),
      tone: normalizeToneValue(incoming?.tone),
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
      const shouldFetchItems = scope === "base" || scope === "items" || scope === "settings" || scope === "all";

      const [settingsRes, analyticsRes, rulesRes, itemsRes] = await Promise.allSettled([
        cachedGet("/api/upsell/settings", {}, { ttlMs: 20_000 }),
        cachedGet("/api/upsell/analytics", {}, { ttlMs: 20_000 }),
        shouldFetchRules ? cachedGet("/api/upsell/rules", {}, { ttlMs: 20_000 }) : Promise.resolve(null),
        shouldFetchItems ? cachedGet("/api/upsell/items", {}, { ttlMs: 20_000 }) : Promise.resolve(null),
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
        const ownerItemsFallback = await cachedGet("/owners/items/", {}, { ttlMs: 20_000 })
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
      if (scope === "base" || scope === "items" || scope === "settings" || scope === "all") setItems([]);
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
        : await cachedGet("/api/upsell/association-analytics?restaurantId=default", {}, { ttlMs: 30_000 });
      const rows = Array.isArray(response.data?.results) ? response.data.results : [];
      setPairingRows(rows);
      setPairingLoaded(true);
      if (run) {
        invalidateApiCache("association-analytics");
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
    invalidateApiCache("upsell");
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
      invalidateApiCache("upsell");
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
      invalidateApiCache("upsell");
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
      invalidateApiCache("upsell");
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
      invalidateApiCache("upsell");
      setItems((prev) => prev.map((item) => (item.id === itemId || item.item === itemId ? { ...item, enabled } : item)));
    } catch {
      toast.error("Failed to update item suggestion status.");
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleLoadDemoPairingData = () => {
    setPairingRows(DEMO_PAIRING_ROWS);
    setPairingLoaded(true);
    toast.success("Demo pairing data loaded.");
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
    <div className="space-y-6" style={{ fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif' }}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Activity className="mt-1 h-5 w-5 text-slate-400" strokeWidth={1.8} />
          <div>
            <h2 className="text-base font-bold text-slate-900">AI Upsell Engine</h2>
            <p className="mt-1 text-sm text-slate-500">Increase order value with smart, timely suggestions</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
          <span className="text-sm font-semibold text-slate-700">AI Upsell {settings.enabled ? "On" : "Off"}</span>
          {masterToggleSaving ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#0055FE]" strokeWidth={1.8} />
          ) : (
            <ToggleSwitch checked={settings.enabled} onChange={handleMasterToggle} />
          )}
        </div>
      </div>

      <div className="overflow-x-auto hide-scrollbar">
        <div className="flex w-max gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={classNames(
                "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                activeTab === tab.key
                  ? "bg-[#0055FE] text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "performance" && (
        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { label: "OFFERS SHOWN", value: analytics.total_shown.toLocaleString(), icon: Activity, iconClass: "text-slate-500", sub: "" },
              { label: "ADD TO CART", value: analytics.total_accepted.toLocaleString(), icon: ShoppingCart, iconClass: "text-[#0055FE]", sub: "" },
              { label: "NO THANKS", value: analytics.total_rejected.toLocaleString(), icon: XCircle, iconClass: "text-red-500", sub: "" },
              { label: "ACCEPTANCE RATE", value: `${Number(analytics.acceptance_rate || 0).toFixed(analytics.acceptance_rate % 1 ? 2 : 0)}%`, icon: TrendingUp, iconClass: "text-emerald-500", sub: "Of upsells shown" },
              { label: "UPSELL REVENUE", value: formatCurrency(analytics.upsell_revenue), icon: BarChart3, iconClass: "text-[#0055FE]", sub: "From accepted upsells" },
              { label: "AVG UPSELL VALUE", value: formatCurrency(analytics.avg_upsell_value), icon: Target, iconClass: "text-slate-600", sub: "Per accepted upsell" },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{kpi.label}</p>
                    <Icon className={classNames("h-4 w-4 shrink-0", kpi.iconClass)} strokeWidth={1.8} />
                  </div>
                  <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{kpi.value}</p>
                  {kpi.sub ? <p className="mt-1 text-xs font-medium text-slate-400">{kpi.sub}</p> : null}
                </div>
              );
            })}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-bold text-slate-900">Performance by Trigger Point</h3>
            <p className="mt-1 text-sm text-slate-500">Where in the ordering journey upsells convert best</p>
            <div className="mt-6 space-y-4">
              {triggerRows.map((row) => {
                const pct = Math.max(0, Math.min(100, row.acceptance_rate));
                return (
                  <div key={row.key} className="grid grid-cols-[150px_minmax(0,1fr)_56px_54px] items-center gap-5 text-sm">
                    <span className="truncate font-medium text-slate-700">{row.label}</span>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#0055FE]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-right font-bold text-slate-600">{pct.toFixed(0)}%</span>
                    <span className="text-right text-slate-400">{row.accepted}/{row.shown}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-bold text-slate-900">Performance by Category</h3>
            <p className="mt-1 text-sm text-slate-500">Which types of items convert best as upsells</p>
            <div className="mt-6 space-y-4">
              {(categoryRows.length ? categoryRows : [{ category: "No category data yet", shown: 0, accepted: 0, acceptance_rate: 0 }]).map((row) => {
                const pct = Math.max(0, Math.min(100, row.acceptance_rate));
                return (
                  <div key={row.category} className="grid grid-cols-[150px_minmax(0,1fr)_56px_54px] items-center gap-5 text-sm">
                    <span className="truncate font-medium text-slate-700">{row.category}</span>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#0055FE]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-right font-bold text-slate-600">{pct.toFixed(0)}%</span>
                    <span className="text-right text-slate-400">{row.accepted}/{row.shown}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-bold text-slate-900">No Thanks vs Add to Cart</h3>
            <p className="mt-1 text-sm text-slate-500">Head-to-head comparison - which response wins overall</p>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center">
                <ShoppingCart className="mx-auto h-4 w-4 text-slate-400" strokeWidth={1.8} />
                <p className="mt-2 text-3xl font-bold text-[#0055FE]">{acceptedVsRejected.accepted}</p>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Add to Cart</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center">
                <XCircle className="mx-auto h-4 w-4 text-slate-400" strokeWidth={1.8} />
                <p className="mt-2 text-3xl font-bold text-slate-700">{acceptedVsRejected.rejected}</p>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">No Thanks</p>
              </div>
            </div>
            <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-[#0055FE]" style={{ width: `${acceptedVsRejected.acceptedPct}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-bold">
              <span className="text-[#0055FE]">Add to Cart {acceptedVsRejected.acceptedPct.toFixed(0)}%</span>
              <span className="text-red-400">No Thanks {acceptedVsRejected.rejectedPct.toFixed(0)}%</span>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-bold text-slate-900">Item Performance</h3>
            <p className="mt-1 text-sm text-slate-500">Add to Cart vs No Thanks per upsell item</p>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-right">Shown</th>
                    <th className="px-4 py-3 text-right text-[#0055FE]">Add To Cart</th>
                    <th className="px-4 py-3 text-right text-red-500">No Thanks</th>
                    <th className="px-4 py-3 text-right">Accept %</th>
                  </tr>
                </thead>
                <tbody>
                  {(performanceItems.length ? performanceItems : []).map((row) => {
                    const acceptRate = Number(row.acceptance_rate || 0);
                    const shown = Number(row.shown || 0);
                    const accepted = Number(row.accepted || 0);
                    const imageUrl = row.image_url || (row.item_id ? itemLookup.get(row.item_id)?.image_url : "") || "";
                    const isWin = acceptRate > 15;
                    const isLose = shown > 10 && accepted === 0;
                    const badgeLabel = isWin ? "Win" : isLose ? "Lose" : "New";
                    const badgeClass = isWin
                      ? "bg-blue-50 text-[#0055FE]"
                      : isLose
                        ? "bg-red-50 text-red-500"
                        : "bg-slate-100 text-slate-500";
                    return (
                      <tr key={`${row.item_id}-${row.item_name}`} className="border-b border-slate-50 last:border-none">
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                              {imageUrl ? (
                                <OptimizedImage src={imageUrl} alt={row.item_name} width={40} height={40} className="h-full w-full object-cover" />
                              ) : (
                                <UtensilsCrossed className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                              )}
                            </div>
                            <span className={classNames("rounded-full px-2 py-0.5 text-[10px] font-bold", badgeClass)}>{badgeLabel}</span>
                            <span className="truncate font-semibold text-slate-700">{row.item_name || "Unknown"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">{row.shown}</td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums text-[#0055FE]">{row.accepted}</td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums text-red-500">{row.rejected || 0}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <span className="block h-full rounded-full bg-[#0055FE]" style={{ width: `${Math.max(0, Math.min(100, acceptRate))}%` }} />
                            </span>
                            <span className="w-10 text-right text-xs font-bold text-[#0055FE]">{acceptRate.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!performanceItems.length ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">No item-level upsell data yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-bold text-slate-900">Performance by Time of Day</h3>
            <p className="mt-1 text-sm text-slate-500">Which hours produce the best upsell conversions - hover a point to see exact rate</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                <Clock3 className="h-4 w-4 text-[#0055FE]" strokeWidth={1.8} /> Peak hour <b className="text-slate-800">{peakHour.shown ? `${formatHour(peakHour.hour)} · ${peakHour.acceptance_rate.toFixed(0)}% accept rate` : "--"}</b>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                <Zap className="h-4 w-4" strokeWidth={1.8} /> Active hours <b className="text-slate-800">{activeHours} of 24</b>
              </span>
            </div>
            <div className="mt-8 flex h-36 items-end gap-1 border-b border-slate-100">
              {byHourRows.map((row) => {
                const height = row.shown ? Math.max(4, (row.shown / maxHourShown) * 100) : 2;
                return (
                  <div
                    key={row.hour}
                    className="flex flex-1 items-end"
                    onMouseEnter={() => setHoverHour(row.hour)}
                    onMouseLeave={() => setHoverHour(null)}
                    title={`${formatHour(row.hour)} - ${row.acceptance_rate.toFixed(1)}% - ${row.accepted}/${row.shown}`}
                  >
                    <div
                      className={classNames("w-full rounded-t-full transition-colors", row.shown ? "bg-[#0055FE]" : "bg-slate-100", hoverHour === row.hour && "bg-blue-400")}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-4 text-center text-[11px] text-slate-300">
              <span>Night<br />12am-5am</span>
              <span>Morning<br />6am-11am</span>
              <span>Afternoon<br />12pm-5pm</span>
              <span>Evening<br />6pm-11pm</span>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-bold text-slate-900">Revenue Trend</h3>
            <p className="mt-1 text-sm text-slate-500">Daily upsell revenue over the last 14 days - hover to see exact values</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                <TrendingUp className="h-4 w-4 text-[#0055FE]" strokeWidth={1.8} /> Best day <b className="text-slate-800">{bestRevenueDay.label} · {formatCurrency(bestRevenueDay.value)}</b>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                <BarChart3 className="h-4 w-4" strokeWidth={1.8} /> 14-day total <b className="text-slate-800">{formatCurrency(trendTotalRevenue)}</b>
              </span>
            </div>
            <div className="mt-8 flex h-44 items-end gap-1 border-b border-slate-100">
              {revenueSeries14Days.map((row) => {
                const height = row.value ? Math.max(3, (row.value / maxRevenue) * 100) : 2;
                return (
                  <div key={row.iso} className="flex flex-1 items-end" title={`${row.label}: ${formatCurrency(row.value)}`}>
                    <div className={classNames("w-full rounded-t-full", row.value ? "bg-[#0055FE]" : "bg-slate-100")} style={{ height: `${height}%` }} />
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {activeTab === "pairing" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <GitFork className="h-4 w-4 text-slate-400" strokeWidth={1.8} /> Top Pairing Intelligence
                </h3>
                <p className="mt-2 max-w-5xl text-sm leading-6 text-slate-500">
                  Learned from real completed orders - which items customers actually buy together. Stronger associations rise to the top and directly influence upsell rankings.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleLoadDemoPairingData}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
                >
                  <Database className="h-4 w-4" strokeWidth={1.8} /> Load Demo Data
                </button>
                <button
                  type="button"
                  onClick={() => fetchPairingIntelligence(true)}
                  disabled={runningIntelligence}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#0055FE] bg-white px-4 text-sm font-semibold text-[#0055FE] hover:bg-blue-50 disabled:opacity-60"
                >
                  {runningIntelligence ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} /> : <RefreshCw className="h-4 w-4" strokeWidth={1.8} />}
                  Run Intelligence
                </button>
              </div>
            </div>
            <div className="mt-6 flex gap-3 rounded-2xl bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-500">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.8} />
              <p><b className="text-slate-700">Scans the last 60 days of delivered orders.</b> The engine calculates which items customers actually order together, using a lift score to surface genuine patterns over coincidence. Pairs seen fewer than 2 times are ignored. Click <b>Run Intelligence</b> after new orders come in to refresh.</p>
            </div>
          </section>

          {pairingRows.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
              <GitFork className="mx-auto h-9 w-9 text-slate-300" strokeWidth={1.8} />
              <h3 className="mt-4 text-base font-bold text-slate-800">No pairing intelligence yet</h3>
              <p className="mt-2 text-sm text-slate-500">Load demo data or run the intelligence scanner after completed orders exist.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button onClick={handleLoadDemoPairingData} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">Load Demo Data</button>
                <button onClick={() => fetchPairingIntelligence(true)} className="rounded-xl bg-[#0055FE] px-4 py-2 text-sm font-semibold text-white">Run Intelligence Now</button>
              </div>
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">When Customer Adds</th>
                      <th className="px-4 py-3">Suggest</th>
                      <th className="px-4 py-3 text-right">Co-orders</th>
                      <th className="px-4 py-3 text-right">Strength</th>
                      <th className="px-4 py-3 text-right text-[#0055FE]">Accepted</th>
                      <th className="px-4 py-3 text-right">Shown</th>
                      <th className="px-4 py-3 text-right">Accept %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairingRows.map((row, idx) => {
                      const strengthPct = Math.max(0, Math.min(100, Number(row.association_strength || 0) * 100));
                      const acceptRate = Number(row.accept_rate || 0);
                      return (
                        <tr key={`${row.source_item_id}-${row.target_item_id}-${idx}`} className="border-b border-slate-50 last:border-none">
                          <td className="px-4 py-3 font-semibold text-slate-700">{row.source_item_name}</td>
                          <td className="px-4 py-3 text-slate-700"><span className="text-slate-300">→</span> {row.target_item_name}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-500">{row.frequency}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#0055FE]" style={{ width: `${strengthPct}%` }} /></span>
                              <span className="w-9 text-xs font-bold text-slate-600">{strengthPct.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-[#0055FE]">{row.accepted_count || 0}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-500">{row.shown_count || 0}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-[#0055FE]">{acceptRate.toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {activeTab === "items" && (
        <div className="space-y-6">
          <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">All Menu Items</h3>
              <p className="mt-1 text-sm text-slate-500">Toggle items on or off for upsell suggestions. Off = never shown.</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#0055FE]" /> Enabled</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Disabled</span>
            </div>
          </section>

          {groupedItems.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">No menu items found.</section>
          ) : (
            groupedItems.map((group) => (
              <section key={group.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">{group.name}</div>
                <div className="divide-y divide-slate-100">
                  {group.rows.map((item) => {
                    const toggleId = item.item || item.id;
                    const hasStats = Number(item.shown_count || 0) > 0;
                    return (
                      <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                          {item.image_url ? (
                            <OptimizedImage src={item.image_url} alt={item.item_name} width={40} height={40} className="h-full w-full object-cover" />
                          ) : (
                            <UtensilsCrossed className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-800">{item.item_name}</p>
                          <p className="text-xs font-medium text-slate-400">{formatCurrency(item.price)}</p>
                        </div>
                        <div className="hidden items-center gap-7 text-center sm:flex">
                          {hasStats ? (
                            <>
                              <span className="min-w-[44px]"><b className="block text-sm text-[#0055FE]">{item.accepted_count || 0}</b><small className="text-[10px] text-slate-400">Add to Cart</small></span>
                              <span className="min-w-[44px]"><b className="block text-sm text-red-500">{item.rejected_count || 0}</b><small className="text-[10px] text-slate-400">No Thanks</small></span>
                              <span className="min-w-[44px]"><b className="block text-sm text-[#0055FE]">{Number(item.acceptance_rate || 0).toFixed(0)}%</b><small className="text-[10px] text-slate-400">Accept</small></span>
                            </>
                          ) : (
                            <span className="text-xs text-slate-300">No data yet</span>
                          )}
                        </div>
                        {updatingItemId === toggleId ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[#0055FE]" strokeWidth={1.8} />
                        ) : (
                          <ToggleSwitch checked={item.enabled} onChange={(next) => toggleItemEnabled(toggleId, next)} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0055FE] px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} /> : <Check className="h-4 w-4" strokeWidth={1.8} />}
              Save Changes
            </button>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-bold text-slate-900">Upsell Strategy</h3>
            <p className="mt-1 text-sm text-slate-500">Choose how the engine decides which item to recommend next</p>
            <div className="mt-6 space-y-3">
              {STRATEGY_OPTIONS.map((option) => {
                const selected = settings.strategy === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => patchSettings({ strategy: option.value })}
                    className={classNames(
                      "flex w-full items-start gap-4 rounded-2xl border px-5 py-4 text-left transition-colors",
                      selected ? "border-[#0055FE] bg-blue-50/60" : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <span className={classNames("mt-1 h-4 w-4 rounded-full border-2", selected ? "border-[#0055FE] bg-[#0055FE] ring-2 ring-blue-100" : "border-slate-300")} />
                    <span>
                      <span className={classNames("font-bold", selected ? "text-[#0055FE]" : "text-slate-800")}>{option.label}</span>
                      {option.badge ? <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-[#0055FE]">{option.badge}</span> : null}
                      <span className="mt-1 block text-sm text-slate-500">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-bold text-slate-900">Aggressiveness</h3>
            <p className="mt-1 text-sm text-slate-500">Controls the maximum number of suggestions shown to a customer in one session</p>
            <div className="mt-6 space-y-3">
              {AGGRESSIVENESS_OPTIONS.map((option) => {
                const selected = settings.aggressiveness === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => patchSettings({ aggressiveness: option.value })}
                    className={classNames("flex w-full items-start gap-4 rounded-2xl border px-5 py-4 text-left transition-colors", selected ? "border-[#0055FE] bg-blue-50/60" : "border-slate-200 bg-white hover:bg-slate-50")}
                  >
                    <span className={classNames("mt-1 h-4 w-4 rounded-full border-2", selected ? "border-[#0055FE] bg-[#0055FE] ring-2 ring-blue-100" : "border-slate-300")} />
                    <span>
                      <span className={classNames("font-bold", selected ? "text-[#0055FE]" : "text-slate-800")}>{option.label}</span>
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{option.cap}</span>
                      <span className="mt-1 block text-sm text-slate-500">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-bold text-slate-900">Suggestion Tone</h3>
            <p className="mt-1 text-sm text-slate-500">How the upsell copy sounds to your customers</p>
            <div className="mt-6 space-y-3">
              {TONE_OPTIONS.map((option) => {
                const selected = settings.tone === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => patchSettings({ tone: option.value })}
                    className={classNames("flex w-full items-start gap-4 rounded-2xl border px-5 py-4 text-left transition-colors", selected ? "border-[#0055FE] bg-blue-50/60" : "border-slate-200 bg-white hover:bg-slate-50")}
                  >
                    <span className={classNames("mt-1 h-4 w-4 rounded-full border-2", selected ? "border-[#0055FE] bg-[#0055FE] ring-2 ring-blue-100" : "border-slate-300")} />
                    <span>
                      <span className={classNames("font-bold", selected ? "text-[#0055FE]" : "text-slate-800")}>{option.label}</span>
                      <span className="mt-1 block text-sm text-slate-500">{option.description}</span>
                      <span className="mt-2 block border-l-2 border-slate-200 pl-3 text-sm italic text-slate-400">"{option.example}"</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-bold text-slate-900">Trigger Points</h3>
            <p className="mt-1 text-sm text-slate-500">Choose where in the ordering journey suggestions appear</p>
            <div className="mt-6 divide-y divide-slate-100">
              {TRIGGER_OPTIONS.map((trigger) => {
                const Icon = trigger.icon;
                return (
                  <div key={trigger.key} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500">
                      <Icon className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800">{trigger.label}</p>
                      <p className="mt-0.5 text-sm text-slate-400">{trigger.description}</p>
                    </div>
                    <ToggleSwitch checked={Boolean(settings[trigger.key])} onChange={(next) => patchSettings({ [trigger.key]: next } as Partial<UpsellSettings>)} />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0055FE]"><Activity className="h-5 w-5" strokeWidth={1.8} /></span>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">How Smart Suggestions Work</h3>
                <p className="mt-1 text-sm text-slate-500">The engine automatically knows what to suggest based on what the customer already has in their cart. It never suggests a category the customer already has.</p>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {SMART_SUGGESTION_ROWS.map(([source, target]) => (
                    <div key={source} className="grid grid-cols-[minmax(0,1fr)_22px_minmax(0,1fr)] items-center gap-3 text-sm">
                      <span className="font-semibold text-slate-600">{source}</span>
                      <span className="text-center text-slate-300">→</span>
                      <span className="text-slate-600">{target}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-xs text-slate-400">You can override this with custom rules in Smart Rules below.</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Smart Rules</h3>
                <p className="mt-1 text-sm text-slate-500">Override the automatic logic - force or block specific item combinations</p>
              </div>
              <button
                type="button"
                onClick={() => setAddingRule((prev) => !prev)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#0055FE] bg-white px-4 text-sm font-semibold text-[#0055FE] hover:bg-blue-50"
              >
                <Plus className="h-4 w-4" strokeWidth={1.8} /> Add Rule
              </button>
            </div>

            {addingRule ? (
              <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
                <select value={newRule.type} onChange={(e) => setNewRule((prev) => ({ ...prev, type: e.target.value as "pair" | "block" }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="pair">Always Suggest</option>
                  <option value="block">Never Suggest</option>
                </select>
                <select value={newRule.source_item || ""} onChange={(e) => setNewRule((prev) => ({ ...prev, source_item: Number(e.target.value) || undefined }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="">When customer adds...</option>
                  {items.map((item) => <option key={`source-${item.id}`} value={item.item || item.id}>{item.item_name}</option>)}
                </select>
                <select value={newRule.target_item || ""} onChange={(e) => setNewRule((prev) => ({ ...prev, target_item: Number(e.target.value) || undefined }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="">Suggest item...</option>
                  {items.map((item) => <option key={`target-${item.id}`} value={item.item || item.id}>{item.item_name}</option>)}
                </select>
                <button onClick={addRule} className="rounded-xl bg-[#0055FE] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Add Rule</button>
              </div>
            ) : null}

            <div className="mt-6">
              {rules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
                  <p className="text-sm font-bold text-slate-500">No custom rules yet</p>
                  <p className="mt-1 text-xs text-slate-400">The engine uses smart suggestions automatically.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-4 px-4 py-3">
                      <span className={classNames("rounded-full px-2.5 py-1 text-xs font-bold", rule.type === "pair" ? "bg-blue-50 text-[#0055FE]" : "bg-red-50 text-red-600")}>{rule.type === "pair" ? "Always Suggest" : "Never Suggest"}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{rule.source_item_name || itemLookup.get(rule.source_item)?.item_name || "Source item"} → {rule.target_item_name || itemLookup.get(rule.target_item)?.item_name || "Target item"}</span>
                      <button type="button" onClick={() => deleteRule(rule.id)} className="text-red-500 hover:text-red-600"><Trash2 className="h-4 w-4" strokeWidth={1.8} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default ScreenRestaurantUpsell;
