import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import axiosInstance from "@/lib/axios";
import { useRestaurantContext } from "@/lib/useRestaurantContext";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Loader2,
  Search,
  Star,
  Trophy,
  Users,
  X,
} from "lucide-react";

type Tier = "bronze" | "silver" | "gold" | "platinum";
type Tab = "customers" | "leaderboard";

type Customer = {
  id: string;
  name: string;
  phone: string;
  tier: Tier;
  loyaltyPoints: number;
  lifetimePoints: number;
  totalSpent: string;
  totalOrders: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  restaurantLinks?: RestaurantLink[];
  loyaltyTransactions?: LoyaltyTransaction[];
};

type RestaurantLink = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  visitCount: number;
  totalSpent: string;
  firstVisit: string;
  lastVisit: string;
};

type LoyaltyTransaction = {
  id: string;
  points: number;
  type: string;
  description?: string | null;
  createdAt: string;
};

type GameScore = {
  id: string;
  playerName: string;
  phone?: string | null;
  gameType: string;
  score: number;
  createdAt: string;
};

const TIER_CONFIG: Record<Tier, { label: string; text: string; bg: string; border: string; bar: string; dot: string }> = {
  bronze: {
    label: "Bronze",
    text: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
  },
  silver: {
    label: "Silver",
    text: "text-slate-500",
    bg: "bg-slate-50",
    border: "border-slate-200",
    bar: "bg-slate-400",
    dot: "bg-slate-400",
  },
  gold: {
    label: "Gold",
    text: "text-yellow-600",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    bar: "bg-yellow-500",
    dot: "bg-yellow-500",
  },
  platinum: {
    label: "Platinum",
    text: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
    bar: "bg-purple-500",
    dot: "bg-purple-500",
  },
};

const GAME_FILTERS = [
  { value: "", label: "All Games" },
  { value: "snake", label: "Snake Xenzia" },
  { value: "connect4", label: "Connect 4" },
] as const;

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

const asString = (value: unknown, fallback = "") => String(value ?? fallback).trim() || fallback;
const asNumber = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizeTier = (value: unknown): Tier => {
  const tier = asString(value, "bronze").toLowerCase();
  if (tier === "platinum" || tier === "gold" || tier === "silver") return tier;
  return "bronze";
};

const normalizeDate = (value: unknown) => {
  const raw = asString(value);
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
};

const normalizeCustomer = (raw: Record<string, unknown>): Customer => ({
  id: asString(raw.id || raw.customerId || raw.customer_id || raw.phone),
  name: asString(raw.name || raw.fullName || raw.full_name || raw.customerName || raw.customer_name, "Guest"),
  phone: asString(raw.phone || raw.phoneNumber || raw.phone_number, "-"),
  tier: normalizeTier(raw.tier),
  loyaltyPoints: asNumber(raw.loyaltyPoints || raw.loyalty_points || raw.points || raw.currentPoints || raw.current_points),
  lifetimePoints: asNumber(raw.lifetimePoints || raw.lifetime_points || raw.totalPoints || raw.total_points),
  totalSpent: String(raw.totalSpent || raw.total_spent || raw.lifetimeSpend || raw.lifetime_spend || "0"),
  totalOrders: asNumber(raw.totalOrders || raw.total_orders || raw.orderCount || raw.order_count),
  notes: raw.notes === undefined || raw.notes === null ? null : String(raw.notes),
  createdAt: normalizeDate(raw.createdAt || raw.created_at),
  updatedAt: normalizeDate(raw.updatedAt || raw.updated_at || raw.lastVisit || raw.last_visit),
  restaurantLinks: toArray<Record<string, unknown>>(raw.restaurantLinks || raw.restaurant_links || raw.visits, [
    "restaurantLinks",
    "restaurant_links",
    "visits",
  ]).map(normalizeRestaurantLink),
  loyaltyTransactions: toArray<Record<string, unknown>>(raw.loyaltyTransactions || raw.loyalty_transactions || raw.transactions, [
    "loyaltyTransactions",
    "loyalty_transactions",
    "transactions",
  ]).map(normalizeTransaction),
});

const normalizeRestaurantLink = (raw: Record<string, unknown>): RestaurantLink => ({
  id: asString(raw.id || `${raw.restaurantId || raw.restaurant_id}-${raw.lastVisit || raw.last_visit}`),
  restaurantId: asString(raw.restaurantId || raw.restaurant_id),
  restaurantName: asString(raw.restaurantName || raw.restaurant_name || raw.restaurant || raw.locationName || raw.location_name, "Restaurant"),
  visitCount: asNumber(raw.visitCount || raw.visit_count || raw.visits || 1),
  totalSpent: String(raw.totalSpent || raw.total_spent || raw.total || "0"),
  firstVisit: normalizeDate(raw.firstVisit || raw.first_visit || raw.createdAt || raw.created_at),
  lastVisit: normalizeDate(raw.lastVisit || raw.last_visit || raw.updatedAt || raw.updated_at),
});

const normalizeTransaction = (raw: Record<string, unknown>): LoyaltyTransaction => ({
  id: asString(raw.id || `${raw.createdAt || raw.created_at}-${raw.points}`),
  points: asNumber(raw.points || raw.amount),
  type: asString(raw.type || raw.transactionType || raw.transaction_type, "earn"),
  description: asString(raw.description || raw.label || raw.reason, "Loyalty activity"),
  createdAt: normalizeDate(raw.createdAt || raw.created_at || raw.date),
});

const normalizeGameScore = (raw: Record<string, unknown>): GameScore => ({
  id: asString(raw.id || `${raw.playerName || raw.player_name}-${raw.createdAt || raw.created_at}`),
  playerName: asString(raw.playerName || raw.player_name || raw.name, "Guest"),
  phone: asString(raw.phone || raw.phoneNumber || raw.phone_number),
  gameType: asString(raw.gameType || raw.game_type || raw.game, "game"),
  score: asNumber(raw.score || raw.points),
  createdAt: normalizeDate(raw.createdAt || raw.created_at || raw.date),
});

const timeAgo = (value: string) => {
  if (!value) return "-";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  const diff = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const formatMemberSince = (value: string) => {
  if (!value) return "Member since -";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `Member since ${value}`;
  return `Member since ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
};

const gameLabel = (value: string) => {
  if (value === "snake") return "Snake Xenzia";
  if (value === "connect4") return "Connect 4";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const rankSuffix = (rank: number) => {
  const lastTwo = rank % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return "th";
  const last = rank % 10;
  if (last === 1) return "st";
  if (last === 2) return "nd";
  if (last === 3) return "rd";
  return "th";
};

export default function ScreenRestaurantCrm() {
  const { fmt0 } = useRestaurantContext();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"" | Tier>("");
  const [tab, setTab] = useState<Tab>("customers");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const {
    data: customers = [],
    isLoading,
  } = useQuery<Customer[]>({
    queryKey: ["crm-customers"],
    queryFn: async () => {
      const res = await axiosInstance.get("/api/crm/customers");
      return toArray<Record<string, unknown>>(res.data, ["customers"]).map(normalizeCustomer);
    },
    refetchInterval: 60_000,
  });

  const stats = useMemo(() => {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const active = customers.filter((customer) => {
      const updated = new Date(customer.updatedAt).getTime();
      return Number.isFinite(updated) && now - updated < thirtyDays;
    }).length;
    const totalSpend = customers.reduce((sum, customer) => sum + Number(customer.totalSpent || 0), 0);
    const avgSpend = customers.length ? totalSpend / customers.length : 0;
    const totalPoints = customers.reduce((sum, customer) => sum + (customer.lifetimePoints ?? 0), 0);
    const platinum = customers.filter((customer) => customer.tier === "platinum").length;
    const gold = customers.filter((customer) => customer.tier === "gold").length;
    return { total: customers.length, active, avgSpend, totalPoints, platinum, gold };
  }, [customers]);

  const filtered = useMemo(() => {
    return customers.filter((customer) => {
      const matchesSearch = !search
        || customer.name.toLowerCase().includes(search.toLowerCase())
        || customer.phone.includes(search);
      const matchesTier = !tierFilter || customer.tier === tierFilter;
      return matchesSearch && matchesTier;
    });
  }, [customers, search, tierFilter]);

  const kpis = [
    {
      label: "Total customers",
      value: stats.total.toLocaleString(),
      subline: `${stats.platinum} Platinum · ${stats.gold} Gold`,
    },
    {
      label: "Active this month",
      value: stats.active.toLocaleString(),
      subline: stats.total ? `${Math.round((stats.active / stats.total) * 100)}% of customer base` : "No active customers yet",
    },
    {
      label: "Avg. lifetime spend",
      value: fmt0(stats.avgSpend),
      subline: "Average per customer",
    },
    {
      label: "Lifetime points issued",
      value: stats.totalPoints.toLocaleString(),
      subline: "All-time earned points",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0055FE]">Customer Intelligence</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Live data
            </span>
          </div>
          <h1 className="mt-2 text-base font-semibold tracking-tight text-slate-900">Customers</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Loyalty, games, and visit behaviour across your customer base.</p>
        </div>

        <div className="inline-flex rounded-2xl bg-slate-100 p-1">
          <TabButton active={tab === "customers"} onClick={() => setTab("customers")} icon={Users} label="Customers" />
          <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")} icon={Trophy} label="Leaderboard" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{item.value}</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">{item.subline}</p>
          </div>
        ))}
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Tier distribution</h2>
            <p className="text-xs font-medium text-slate-500">Customer mix by current loyalty tier.</p>
          </div>
          <Trophy className="h-5 w-5 text-[#0055FE]" strokeWidth={1.8} />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {(Object.keys(TIER_CONFIG) as Tier[]).map((tierKey) => {
            const count = customers.filter((customer) => customer.tier === tierKey).length;
            const percentage = stats.total ? Math.round((count / stats.total) * 100) : 0;
            const config = TIER_CONFIG[tierKey];
            return (
              <div key={tierKey}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={`text-xs font-semibold ${config.text}`}>{config.label}</span>
                  <span className="text-xs font-bold text-slate-500">{count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${config.bar}`} style={{ width: `${percentage}%` }} />
                </div>
                <p className="mt-1.5 text-[10px] font-bold text-slate-400">{percentage}%</p>
              </div>
            );
          })}
        </div>
      </section>

      {tab === "customers" ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <label className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or phone"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-900"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <TierFilterPill active={!tierFilter} onClick={() => setTierFilter("")}>All</TierFilterPill>
              {(Object.keys(TIER_CONFIG) as Tier[]).map((tierKey) => (
                <TierFilterPill key={tierKey} active={tierFilter === tierKey} onClick={() => setTierFilter(tierKey)}>
                  {tierKey}
                </TierFilterPill>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin" strokeWidth={1.8} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 px-6 py-14 text-center">
              <p className="font-bold text-slate-500">
                {customers.length === 0
                  ? "No customers yet. They'll appear here after playing a game or placing an order with their phone number."
                  : "No customers match your search."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <th className="pb-3 pr-4">Customer</th>
                      <th className="pb-3 pr-4">Tier</th>
                      <th className="pb-3 pr-4 text-right">Orders</th>
                      <th className="pb-3 pr-4 text-right">Total Spend</th>
                      <th className="pb-3 pr-4 text-right">Points</th>
                      <th className="pb-3 pr-4">Last Seen</th>
                      <th className="pb-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((customer) => (
                      <tr
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        className="group cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50/80"
                      >
                        <td className="py-4 pr-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={customer.name} />
                            <div>
                              <p className="font-semibold text-slate-900">{customer.name}</p>
                              <p className="text-xs font-semibold text-slate-400">{customer.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 pr-4"><TierBadge tier={customer.tier} /></td>
                        <td className="py-4 pr-4 text-right font-semibold text-slate-700">{customer.totalOrders.toLocaleString()}</td>
                        <td className="py-4 pr-4 text-right font-semibold text-slate-900">{fmt0(customer.totalSpent)}</td>
                        <td className="py-4 pr-4 text-right">
                          <span className="inline-flex items-center justify-end gap-1.5 font-semibold text-yellow-600">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" strokeWidth={1.8} />
                            {customer.loyaltyPoints.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-4 pr-4 text-sm font-semibold text-slate-500">{timeAgo(customer.updatedAt)}</td>
                        <td className="py-4">
                          <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:text-slate-900" strokeWidth={1.8} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs font-bold text-slate-400">Showing {filtered.length} of {customers.length} customers</p>
            </>
          )}
        </section>
      ) : (
        <LeaderboardTab />
      )}

      <AnimatePresence>
        {selectedCustomer && (
          <CustomerDrawer
            customer={selectedCustomer}
            fmt={fmt0}
            onClose={() => setSelectedCustomer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LeaderboardTab() {
  const [gameFilter, setGameFilter] = useState("");
  const { data: scores = [], isLoading } = useQuery<GameScore[]>({
    queryKey: ["game-leaderboard", gameFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (gameFilter) params.set("gameType", gameFilter);
      const res = await axiosInstance.get(`/api/game/leaderboard?${params.toString()}`);
      return toArray<Record<string, unknown>>(res.data, ["scores", "leaderboard"]).map(normalizeGameScore);
    },
    refetchInterval: 30_000,
  });

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Game leaderboard</h2>
          <p className="text-xs font-medium text-slate-500">Top customer scores, refreshed every 30 seconds.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {GAME_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setGameFilter(filter.value)}
              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${gameFilter === filter.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-72 items-center justify-center text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin" strokeWidth={1.8} />
        </div>
      ) : scores.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 px-6 py-14 text-center">
          <p className="font-bold text-slate-500">No game scores yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="pb-3 pr-4">Rank</th>
                <th className="pb-3 pr-4">Player</th>
                <th className="pb-3 pr-4">Game</th>
                <th className="pb-3 pr-4 text-right">Score</th>
                <th className="pb-3">When</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((score, index) => (
                <tr key={score.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="py-4 pr-4">
                    <RankBadge rank={index + 1} />
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={score.playerName} size="sm" />
                      <div>
                        <p className="font-semibold text-slate-900">{score.playerName}</p>
                        {score.phone && <p className="text-xs font-semibold text-slate-400">{score.phone}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 pr-4 text-sm font-bold text-slate-600">{gameLabel(score.gameType)}</td>
                  <td className="py-4 pr-4 text-right text-xl font-semibold text-slate-900">{score.score.toLocaleString()}</td>
                  <td className="py-4 text-sm font-semibold text-slate-500">{timeAgo(score.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CustomerDrawer({ customer, fmt, onClose }: { customer: Customer; fmt: (value: string | number | null | undefined) => string; onClose: () => void }) {
  const { data: detail = customer, isLoading: detailLoading } = useQuery<Customer>({
    queryKey: ["crm-customer-detail", customer.id],
    queryFn: async () => {
      const res = await axiosInstance.get(`/api/crm/customers/${customer.id}`);
      return normalizeCustomer(res.data?.customer || res.data?.data || res.data);
    },
  });

  const { data: scores = [] } = useQuery<GameScore[]>({
    queryKey: ["crm-customer-scores", customer.phone],
    queryFn: async () => {
      const res = await axiosInstance.get("/api/game/leaderboard?limit=50");
      return toArray<Record<string, unknown>>(res.data, ["scores", "leaderboard"])
        .map(normalizeGameScore)
        .filter((score) => score.phone && score.phone === customer.phone);
    },
    enabled: !!customer.phone && customer.phone !== "-",
  });

  return (
    <>
      <motion.button
        type="button"
        aria-label="Close customer details"
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-white shadow-2xl sm:max-w-md"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 px-6 py-7 text-white">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white/70 hover:text-white">
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <div className="flex items-center gap-4 pr-10">
            <Avatar name={detail.name} size="lg" dark />
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{detail.name}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-400">{detail.phone}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <TierBadge tier={detail.tier} />
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">{detail.loyaltyPoints.toLocaleString()} pts</span>
            <span className="text-xs font-semibold text-slate-400">{formatMemberSince(detail.createdAt)}</span>
          </div>
        </div>

        {detailLoading && <p className="px-6 pt-4 text-xs font-semibold text-slate-400">Refreshing customer detail...</p>}

        <div className="grid grid-cols-3 gap-px bg-slate-200">
          <DrawerMetric label="Orders" value={detail.totalOrders.toLocaleString()} />
          <DrawerMetric label="Total Spend" value={fmt(detail.totalSpent)} />
          <DrawerMetric label="Lifetime Points" value={detail.lifetimePoints.toLocaleString()} />
        </div>

        <div className="space-y-7 px-6 py-6">
          {scores.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Game Scores</h3>
              <div className="space-y-2">
                {scores.slice(0, 5).map((score) => (
                  <div key={score.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-amber-300">
                        <Trophy className="h-4 w-4" strokeWidth={1.8} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{gameLabel(score.gameType)}</p>
                        <p className="text-xs font-semibold text-slate-400">{timeAgo(score.createdAt)}</p>
                      </div>
                    </div>
                    <span className="text-lg font-semibold text-slate-900">{score.score.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Loyalty History</h3>
            {!detail.loyaltyTransactions?.length ? (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No loyalty activity yet.</p>
            ) : (
              <div className="space-y-2">
                {detail.loyaltyTransactions.map((tx) => {
                  const positive = tx.points >= 0 || tx.type === "earn" || tx.type === "bonus" || tx.type.startsWith("earn_");
                  return (
                    <div key={tx.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                      <div className="flex items-start gap-3">
                        {positive ? (
                          <ArrowUpRight className="mt-0.5 h-4 w-4 text-emerald-600" strokeWidth={1.8} />
                        ) : (
                          <ArrowDownRight className="mt-0.5 h-4 w-4 text-red-500" strokeWidth={1.8} />
                        )}
                        <div>
                          <p className="text-sm font-bold text-slate-800">{tx.description || "Loyalty activity"}</p>
                          <p className="text-xs font-semibold text-slate-400">{timeAgo(tx.createdAt)}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 text-sm font-semibold ${positive ? "text-emerald-600" : "text-red-500"}`}>
                        {positive ? "+" : "-"}{Math.abs(tx.points)} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {!!detail.restaurantLinks?.length && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Restaurant Visits</h3>
              <div className="space-y-2">
                {detail.restaurantLinks.map((link) => (
                  <div key={link.id} className="rounded-2xl border border-slate-100 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{link.restaurantName}</p>
                      <p className="text-xs font-semibold text-slate-500">{link.visitCount} visit{link.visitCount === 1 ? "" : "s"}</p>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-400">Last visit {timeAgo(link.lastVisit)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </motion.div>
    </>
  );
}

function Avatar({ name, size = "md", dark = false }: { name: string; size?: "sm" | "md" | "lg"; dark?: boolean }) {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "G";
  const sizeClass = size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full font-semibold ${dark ? "bg-white text-slate-900" : "bg-slate-900 text-white"}`}>
      {initials}
    </div>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  const config = TIER_CONFIG[tier];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.text} ${config.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Users; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} />
      {label}
    </button>
  );
}

function TierFilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-xs font-semibold capitalize transition ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
    >
      {children}
    </button>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-700">🥇 1st</span>;
  if (rank === 2) return <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">🥈 2nd</span>;
  if (rank === 3) return <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">🥉 3rd</span>;
  return <span className="inline-flex rounded-full bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-400">{rank}{rankSuffix(rank)}</span>;
}

function DrawerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 px-3 py-4 text-center">
      <p className="text-base font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
