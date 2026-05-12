import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import axiosInstance from "@/lib/axios";
import { useRestaurantContext } from "@/lib/useRestaurantContext";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Gamepad2,
  History,
  Loader2,
  PencilLine,
  Save,
  Search,
  ShoppingBag,
  Sparkles,
  Trophy,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

type Tier = "Bronze" | "Silver" | "Gold" | "Platinum";
type Tab = "customers" | "leaderboard";

type LoyaltyTransaction = {
  id: string;
  type: "earn" | "redeem" | "bonus" | "expire";
  label: string;
  points: number;
  date: string;
};

type CustomerVisit = {
  id: string;
  restaurant: string;
  date: string;
  visits: number;
  total: number;
};

type GameScore = {
  id: string;
  playerName: string;
  phone: string;
  gameType: string;
  score: number;
  createdAt: string;
};

type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
  tier: Tier;
  points: number;
  lifetimePoints: number;
  totalSpent: number;
  totalOrders: number;
  lastVisit: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  transactions: LoyaltyTransaction[];
  visits: CustomerVisit[];
  gameScore?: number;
};

const tierStyles: Record<Tier, { badge: string; text: string; fill: string }> = {
  Bronze: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    text: "text-amber-700",
    fill: "bg-amber-500",
  },
  Silver: {
    badge: "border-slate-200 bg-slate-100 text-slate-700",
    text: "text-slate-700",
    fill: "bg-slate-400",
  },
  Gold: {
    badge: "border-yellow-200 bg-yellow-50 text-yellow-700",
    text: "text-yellow-700",
    fill: "bg-yellow-500",
  },
  Platinum: {
    badge: "border-purple-200 bg-purple-50 text-purple-700",
    text: "text-purple-700",
    fill: "bg-purple-500",
  },
};

const toArray = <T,>(payload: unknown, keys: string[] = []): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
    if (Array.isArray(record.results)) return record.results as T[];
    if (Array.isArray(record.data)) return record.data as T[];
  }
  return [];
};

const asNumber = (value: unknown) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const asString = (value: unknown, fallback = "") => String(value ?? fallback).trim() || fallback;

const normalizeTier = (value: unknown): Tier => {
  const tier = asString(value, "bronze").toLowerCase();
  if (tier === "platinum") return "Platinum";
  if (tier === "gold") return "Gold";
  if (tier === "silver") return "Silver";
  return "Bronze";
};

const normalizeIso = (value: unknown) => {
  const raw = asString(value);
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
};

const formatShortDate = (value: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const timeAgo = (value: string) => {
  if (!value) return "-";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return formatShortDate(value);
  const diff = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

const normalizeTransactionType = (value: unknown): LoyaltyTransaction["type"] => {
  const type = asString(value, "earn").toLowerCase();
  if (type.includes("redeem")) return "redeem";
  if (type.includes("expire")) return "expire";
  if (type.includes("bonus") || type.includes("game")) return "bonus";
  return "earn";
};

const normalizeTransaction = (raw: Record<string, unknown>): LoyaltyTransaction => ({
  id: asString(raw.id || raw.transactionId || raw.transaction_id || `${raw.createdAt || raw.created_at}-${raw.points}`),
  type: normalizeTransactionType(raw.type || raw.transactionType || raw.transaction_type),
  label: asString(raw.label || raw.reason || raw.description, "Loyalty activity"),
  points: asNumber(raw.points || raw.amount),
  date: normalizeIso(raw.date || raw.createdAt || raw.created_at),
});

const normalizeVisit = (raw: Record<string, unknown>): CustomerVisit => ({
  id: asString(raw.id || raw.linkId || raw.link_id || `${raw.restaurantId || raw.restaurant_id}-${raw.lastVisit || raw.last_visit}`),
  restaurant: asString(raw.restaurantName || raw.restaurant_name || raw.restaurant || raw.locationName || raw.location_name, "Restaurant"),
  date: normalizeIso(raw.date || raw.lastVisit || raw.last_visit || raw.lastVisitAt || raw.last_visit_at || raw.createdAt || raw.created_at),
  visits: asNumber(raw.visitCount || raw.visit_count || raw.visits || 1),
  total: asNumber(raw.total || raw.totalSpent || raw.total_spent || raw.amount),
});

const normalizeGameScore = (raw: Record<string, unknown>): GameScore => ({
  id: asString(raw.id || raw.scoreId || raw.score_id || `${raw.playerName || raw.player_name}-${raw.createdAt || raw.created_at}`),
  playerName: asString(raw.playerName || raw.player_name || raw.name, "Guest"),
  phone: asString(raw.phone || raw.phoneNumber || raw.phone_number),
  gameType: asString(raw.gameType || raw.game_type || raw.game, "game"),
  score: asNumber(raw.score || raw.points),
  createdAt: normalizeIso(raw.createdAt || raw.created_at || raw.date),
});

const normalizeCustomer = (raw: Record<string, unknown>): CustomerRecord => {
  const transactions = toArray<Record<string, unknown>>(raw.loyaltyTransactions || raw.loyalty_transactions || raw.transactions, [
    "loyaltyTransactions",
    "loyalty_transactions",
    "transactions",
  ]).map(normalizeTransaction);
  const visits = toArray<Record<string, unknown>>(raw.restaurantLinks || raw.restaurant_links || raw.visits, [
    "restaurantLinks",
    "restaurant_links",
    "visits",
  ]).map(normalizeVisit);

  const updatedAt = normalizeIso(raw.updatedAt || raw.updated_at || raw.lastVisit || raw.last_visit);
  const createdAt = normalizeIso(raw.createdAt || raw.created_at);

  return {
    id: asString(raw.id || raw.customerId || raw.customer_id || raw.phone),
    name: asString(raw.name || raw.fullName || raw.full_name || raw.customerName || raw.customer_name, "Guest"),
    phone: asString(raw.phone || raw.phoneNumber || raw.phone_number, "-"),
    tier: normalizeTier(raw.tier),
    points: asNumber(raw.points || raw.loyaltyPoints || raw.loyalty_points || raw.currentPoints || raw.current_points),
    lifetimePoints: asNumber(raw.lifetimePoints || raw.lifetime_points || raw.totalPoints || raw.total_points),
    totalSpent: asNumber(raw.totalSpent || raw.total_spent || raw.lifetimeSpend || raw.lifetime_spend),
    totalOrders: asNumber(raw.totalOrders || raw.total_orders || raw.orderCount || raw.order_count),
    lastVisit: updatedAt || createdAt,
    createdAt,
    updatedAt,
    notes: asString(raw.notes),
    transactions,
    visits,
    gameScore: raw.gameScore || raw.game_score ? asNumber(raw.gameScore || raw.game_score) : undefined,
  };
};

const gameLabel = (value: string) => value
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function ScreenRestaurantCrm() {
  const { fmt, fmt0, restaurantId } = useRestaurantContext();
  const [activeTab, setActiveTab] = useState<Tab>("customers");
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [sortBy, setSortBy] = useState<"points" | "spent" | "orders" | "tier">("points");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [detailScores, setDetailScores] = useState<GameScore[]>([]);
  const [leaderboard, setLeaderboard] = useState<GameScore[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [gameFilter, setGameFilter] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadCustomers = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      setError("");
      try {
        const response = await axiosInstance.get("/api/crm/customers", {
          params: restaurantId ? { restaurantId } : undefined,
        });
        const rows = toArray<Record<string, unknown>>(response.data, ["customers"])
          .map(normalizeCustomer)
          .filter((customer) => customer.id);
        if (!cancelled) setCustomers(rows);
      } catch {
        if (!cancelled) setError("Could not load CRM customers from /api/crm/customers.");
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    };

    void loadCustomers(true);
    const interval = window.setInterval(() => void loadCustomers(false), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    const loadCustomerDetail = async () => {
      setDetailLoading(true);
      try {
        const [detailResponse, scoreResponse] = await Promise.all([
          axiosInstance.get(`/api/crm/customers/${selectedId}`),
          axiosInstance.get("/api/game/leaderboard", { params: { limit: 50 } }),
        ]);
        const detail = normalizeCustomer((detailResponse.data?.customer || detailResponse.data?.data || detailResponse.data) as Record<string, unknown>);
        const scores = toArray<Record<string, unknown>>(scoreResponse.data, ["scores", "leaderboard"])
          .map(normalizeGameScore)
          .filter((score) => detail.phone && detail.phone !== "-" && score.phone === detail.phone);
        if (cancelled) return;
        setCustomers((prev) => prev.map((customer) => customer.id === selectedId ? { ...customer, ...detail } : customer));
        setDetailScores(scores);
        setNotesDraft(detail.notes);
      } catch {
        if (!cancelled) {
          setDetailScores([]);
          setNotesDraft("");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };

    void loadCustomerDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (activeTab !== "leaderboard") return;
    let cancelled = false;

    const loadLeaderboard = async (showLoading: boolean) => {
      if (showLoading) setLeaderboardLoading(true);
      try {
        const response = await axiosInstance.get("/api/game/leaderboard", {
          params: {
            limit: 50,
            ...(gameFilter ? { gameType: gameFilter } : {}),
          },
        });
        const rows = toArray<Record<string, unknown>>(response.data, ["scores", "leaderboard"])
          .map(normalizeGameScore);
        if (!cancelled) setLeaderboard(rows);
      } catch {
        if (!cancelled) setLeaderboard([]);
      } finally {
        if (!cancelled && showLoading) setLeaderboardLoading(false);
      }
    };

    void loadLeaderboard(true);
    const interval = window.setInterval(() => void loadLeaderboard(false), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTab, gameFilter]);

  const stats = useMemo(() => {
    const now = Date.now();
    const recentWindow = 30 * 24 * 60 * 60 * 1000;
    const active = customers.filter((customer) => {
      const updated = new Date(customer.updatedAt || customer.lastVisit).getTime();
      return Number.isFinite(updated) && now - updated < recentWindow;
    }).length;
    const totalSpend = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);
    const avgSpend = customers.length ? totalSpend / customers.length : 0;
    const totalPoints = customers.reduce((sum, customer) => sum + customer.lifetimePoints, 0);
    const platinum = customers.filter((customer) => customer.tier === "Platinum").length;
    const gold = customers.filter((customer) => customer.tier === "Gold").length;
    return {
      total: customers.length,
      active,
      avgSpend,
      totalPoints,
      platinum,
      gold,
    };
  }, [customers]);

  const filtered = useMemo(() => {
    const tierRank: Record<Tier, number> = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
    return customers.filter((customer) => {
      const matchesSearch = !query
        || customer.name.toLowerCase().includes(query.toLowerCase())
        || customer.phone.includes(query);
      const matchesTier = tier === "all" || customer.tier === tier;
      return matchesSearch && matchesTier;
    }).sort((a, b) => {
      if (sortBy === "spent") return b.totalSpent - a.totalSpent;
      if (sortBy === "orders") return b.totalOrders - a.totalOrders;
      if (sortBy === "tier") return tierRank[b.tier] - tierRank[a.tier];
      return b.points - a.points;
    });
  }, [customers, query, sortBy, tier]);

  const selected = customers.find((customer) => customer.id === selectedId);
  const gameTypes = useMemo(
    () => Array.from(new Set(leaderboard.map((score) => score.gameType).filter(Boolean))).sort(),
    [leaderboard],
  );

  const handleSaveNotes = async () => {
    if (!selected) return;
    setSavingNotes(true);
    try {
      await axiosInstance.patch(`/api/crm/customers/${selected.id}`, { notes: notesDraft });
      setCustomers((prev) => prev.map((customer) => customer.id === selected.id ? { ...customer, notes: notesDraft } : customer));
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0055FE]">Customer intelligence</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">Track customer profiles, loyalty activity, restaurant visits, and game engagement.</p>
        </div>
        <div className="flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => setActiveTab("customers")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === "customers" ? "bg-[#0055FE] text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Customers
          </button>
          <button
            onClick={() => setActiveTab("leaderboard")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === "leaderboard" ? "bg-[#0055FE] text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Leaderboard
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" strokeWidth={1.8} />
          {error}
        </div>
      )}

      {activeTab === "customers" ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Total customers"
              value={stats.total.toString()}
              detail={`${stats.platinum} Platinum · ${stats.gold} Gold`}
              icon={UserRound}
            />
            <Stat
              label="Active this month"
              value={stats.active.toString()}
              detail={stats.total ? `${Math.round((stats.active / stats.total) * 100)}% of customer base` : "No active customers yet"}
              icon={CalendarDays}
            />
            <Stat
              label="Avg lifetime spend"
              value={fmt(stats.avgSpend)}
              detail="Across every loaded profile"
              icon={WalletCards}
            />
            <Stat
              label="Lifetime points issued"
              value={stats.totalPoints.toLocaleString()}
              detail="Derived from customer lifetime balances"
              icon={Sparkles}
            />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">Tier distribution</h2>
                <p className="text-xs text-slate-500">Customer mix by current loyalty tier.</p>
              </div>
              <Trophy className="h-5 w-5 text-[#0055FE]" strokeWidth={1.8} />
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              {(Object.keys(tierStyles) as Tier[]).map((item) => {
                const count = customers.filter((customer) => customer.tier === item).length;
                const percentage = stats.total ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={item}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className={`text-xs font-bold ${tierStyles[item].text}`}>{item}</span>
                      <span className="text-xs font-medium text-slate-500">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${tierStyles[item].fill}`} style={{ width: `${percentage}%`, opacity: 0.85 }} />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">{percentage}%</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_180px]">
              <label className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name or phone"
                  className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-[#0055FE]"
                />
              </label>
              <select value={tier} onChange={(event) => setTier(event.target.value as Tier | "all")} className="h-10 rounded-xl border border-slate-200 px-3 text-sm">
                <option value="all">All tiers</option>
                {(Object.keys(tierStyles) as Tier[]).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm">
                <option value="points">Sort by points</option>
                <option value="spent">Sort by spent</option>
                <option value="orders">Sort by orders</option>
                <option value="tier">Sort by tier</option>
              </select>
            </div>

            {loading ? (
              <div className="flex min-h-60 items-center justify-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.8} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No customers match this filter.</div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-100">
                {filtered.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => setSelectedId(customer.id)}
                    className="grid w-full grid-cols-[1fr_auto] gap-4 border-b border-slate-100 bg-white p-4 text-left transition-colors last:border-b-0 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{customer.name}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tierStyles[customer.tier].badge}`}>{customer.tier}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{customer.phone} · Updated {timeAgo(customer.updatedAt || customer.lastVisit)}</p>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                        <span><strong className="text-slate-800">{customer.points.toLocaleString()}</strong> points</span>
                        <span><strong className="text-slate-800">{fmt0(customer.totalSpent)}</strong> spent</span>
                        <span><strong className="text-slate-800">{customer.totalOrders}</strong> orders</span>
                      </div>
                    </div>
                    <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
                      <Trophy className="h-4 w-4 text-amber-500" strokeWidth={1.8} />
                      {customer.gameScore ? customer.gameScore.toLocaleString() : "Open detail"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Game leaderboard</h2>
              <p className="text-xs text-slate-500">Refreshes every 30 seconds from `/api/game/leaderboard`.</p>
            </div>
            <select value={gameFilter} onChange={(event) => setGameFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm">
              <option value="">All games</option>
              {gameTypes.map((item) => <option key={item} value={item}>{gameLabel(item)}</option>)}
            </select>
          </div>

          {leaderboardLoading ? (
            <div className="flex min-h-60 items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.8} />
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No leaderboard scores are available yet.</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              {leaderboard.map((score, index) => (
                <div key={score.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${index === 0 ? "bg-yellow-100 text-yellow-700" : index === 1 ? "bg-slate-100 text-slate-700" : index === 2 ? "bg-amber-100 text-amber-700" : "bg-slate-50 text-slate-500"}`}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{score.playerName}</p>
                    <p className="text-xs text-slate-500">
                      {gameLabel(score.gameType)}
                      {score.phone ? ` · ${score.phone}` : ""}
                      {score.createdAt ? ` · ${timeAgo(score.createdAt)}` : ""}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-[#0055FE]">{score.score.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <AnimatePresence>
        {selected && (
          <>
            <motion.button
              type="button"
              aria-label="Close customer details"
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId("")}
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-bold text-slate-900">{selected.name}</h2>
                    <span className={`rounded-full border px-2 py-1 text-xs font-bold ${tierStyles[selected.tier].badge}`}>{selected.tier}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{selected.phone}</p>
                  <p className="mt-1 text-xs text-slate-400">Member since {formatShortDate(selected.createdAt)}</p>
                </div>
                <button onClick={() => setSelectedId("")} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                  <X className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>

              {detailLoading && <p className="mt-4 text-xs text-slate-400">Refreshing customer detail...</p>}

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <MiniMetric label="Orders" value={selected.totalOrders.toLocaleString()} />
                <MiniMetric label="Spent" value={fmt0(selected.totalSpent)} />
                <MiniMetric label="Lifetime pts" value={selected.lifetimePoints.toLocaleString()} />
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <PencilLine className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
                    Staff notes
                  </h3>
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0055FE] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-3.5 w-3.5" strokeWidth={1.8} />
                    {savingNotes ? "Saving..." : "Save"}
                  </button>
                </div>
                <textarea
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  placeholder="Private notes for staff."
                  className="min-h-24 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#0055FE]"
                />
              </div>

              {detailScores.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Gamepad2 className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
                    Game scores
                  </h3>
                  <div className="space-y-2">
                    {detailScores.slice(0, 5).map((score) => (
                      <div key={score.id} className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-3 text-xs text-white">
                        <div>
                          <p className="font-semibold">{gameLabel(score.gameType)}</p>
                          <p className="text-white/60">{timeAgo(score.createdAt)}</p>
                        </div>
                        <span className="text-sm font-bold text-amber-300">{score.score.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <History className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
                  Loyalty history
                </h3>
                <div className="space-y-2">
                  {selected.transactions.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-400">No loyalty activity yet.</p>
                  ) : selected.transactions.map((entry) => {
                    const positive = entry.type === "earn" || entry.type === "bonus" || entry.points >= 0;
                    return (
                      <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3 text-xs">
                        <div className="flex items-start gap-2">
                          {positive ? (
                            <ArrowUpRight className="mt-0.5 h-4 w-4 text-emerald-600" strokeWidth={1.8} />
                          ) : (
                            <ArrowDownRight className="mt-0.5 h-4 w-4 text-red-500" strokeWidth={1.8} />
                          )}
                          <div>
                            <p className="font-semibold text-slate-700">{entry.label}</p>
                            <p className="text-slate-400">{entry.type} · {timeAgo(entry.date)}</p>
                          </div>
                        </div>
                        <span className={positive ? "font-bold text-emerald-600" : "font-bold text-red-500"}>
                          {positive ? "+" : "-"}{Math.abs(entry.points)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selected.visits.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <ShoppingBag className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
                    Restaurant visits
                  </h3>
                  <div className="space-y-2">
                    {selected.visits.map((visit) => (
                      <div key={visit.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-3 text-xs">
                        <div>
                          <p className="font-semibold text-slate-700">{visit.restaurant}</p>
                          <p className="text-slate-400">{visit.visits} visit{visit.visits === 1 ? "" : "s"} · Last {timeAgo(visit.date)}</p>
                        </div>
                        <span className="font-bold text-slate-800">{fmt(visit.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof UserRound;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <Icon className="mb-3 h-4 w-4 text-[#0055FE]" strokeWidth={1.8} />
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
