import { useEffect, useMemo, useState } from "react";
import axiosInstance from "@/lib/axios";
import { useRestaurantContext } from "@/lib/useRestaurantContext";
import {
  AlertCircle,
  Award,
  History,
  Loader2,
  Search,
  ShoppingBag,
  Sparkles,
  Trophy,
  UserRound,
  WalletCards,
} from "lucide-react";

type Tier = "Bronze" | "Silver" | "Gold" | "Platinum";

type LoyaltyTransaction = {
  type: "earn" | "redeem" | "bonus" | "expire";
  label: string;
  points: number;
  date: string;
};

type CustomerVisit = {
  restaurant: string;
  date: string;
  total: number;
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
  notes?: string;
  transactions: LoyaltyTransaction[];
  visits: CustomerVisit[];
  gameScore?: number;
};

const tierStyles: Record<Tier, string> = {
  Bronze: "bg-amber-50 text-amber-700 border-amber-200",
  Silver: "bg-slate-100 text-slate-700 border-slate-200",
  Gold: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Platinum: "bg-purple-50 text-purple-700 border-purple-200",
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

const asString = (value: unknown, fallback = "") => String(value || fallback);

const normalizeTier = (value: unknown): Tier => {
  const tier = asString(value, "Bronze").toLowerCase();
  if (tier === "platinum") return "Platinum";
  if (tier === "gold") return "Gold";
  if (tier === "silver") return "Silver";
  return "Bronze";
};

const formatDate = (value: unknown) => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
};

const normalizeTransaction = (raw: Record<string, unknown>): LoyaltyTransaction => {
  const type = asString(raw.type || raw.transactionType || raw.transaction_type, "earn") as LoyaltyTransaction["type"];
  return {
    type: ["earn", "redeem", "bonus", "expire"].includes(type) ? type : "earn",
    label: asString(raw.label || raw.reason || raw.description, "Loyalty activity"),
    points: asNumber(raw.points || raw.amount),
    date: formatDate(raw.date || raw.createdAt || raw.created_at),
  };
};

const normalizeVisit = (raw: Record<string, unknown>): CustomerVisit => ({
  restaurant: asString(raw.restaurantName || raw.restaurant_name || raw.restaurant || raw.locationName || raw.location_name, "Restaurant"),
  date: formatDate(raw.date || raw.lastVisitAt || raw.last_visit_at || raw.createdAt || raw.created_at),
  total: asNumber(raw.total || raw.totalSpent || raw.total_spent || raw.amount),
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

  return {
    id: asString(raw.id || raw.customerId || raw.customer_id || raw.phone),
    name: asString(raw.name || raw.fullName || raw.full_name || raw.customerName || raw.customer_name, "Guest"),
    phone: asString(raw.phone || raw.phoneNumber || raw.phone_number, "-"),
    tier: normalizeTier(raw.tier),
    points: asNumber(raw.points || raw.loyaltyPoints || raw.loyalty_points || raw.currentPoints || raw.current_points),
    lifetimePoints: asNumber(raw.lifetimePoints || raw.lifetime_points || raw.totalPoints || raw.total_points),
    totalSpent: asNumber(raw.totalSpent || raw.total_spent || raw.lifetimeSpend || raw.lifetime_spend),
    totalOrders: asNumber(raw.totalOrders || raw.total_orders || raw.orderCount || raw.order_count),
    lastVisit: formatDate(raw.lastVisit || raw.last_visit || raw.lastVisitAt || raw.last_visit_at || raw.updatedAt || raw.updated_at),
    notes: asString(raw.notes, ""),
    transactions,
    visits,
    gameScore: raw.gameScore || raw.game_score ? asNumber(raw.gameScore || raw.game_score) : undefined,
  };
};

export default function ScreenRestaurantCrm() {
  const { fmt, fmt0 } = useRestaurantContext();
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [sortBy, setSortBy] = useState<"points" | "spent" | "orders" | "tier">("points");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadCustomers = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await axiosInstance.get("/api/crm/customers");
        const rows = toArray<Record<string, unknown>>(response.data, ["customers"])
          .map(normalizeCustomer)
          .filter((customer) => customer.id);
        if (cancelled) return;
        setCustomers(rows);
        setSelectedId((current) => current || rows[0]?.id || "");
      } catch (err) {
        if (!cancelled) setError("Could not load CRM customers from /api/crm/customers.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadCustomers();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const loadCustomerDetail = async () => {
      setDetailLoading(true);
      try {
        const response = await axiosInstance.get(`/api/crm/customers/${selectedId}`);
        const detail = normalizeCustomer((response.data?.customer || response.data?.data || response.data) as Record<string, unknown>);
        if (cancelled) return;
        setCustomers((prev) => prev.map((customer) => customer.id === selectedId ? { ...customer, ...detail } : customer));
      } catch {
        // Keep the list row visible if the detail endpoint fails; the page-level list already loaded.
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };
    loadCustomerDetail();
    return () => { cancelled = true; };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const tierRank: Record<Tier, number> = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
    return customers.filter((customer) => {
      const matchesSearch = `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase());
      const matchesTier = tier === "all" || customer.tier === tier;
      return matchesSearch && matchesTier;
    }).sort((a, b) => {
      if (sortBy === "spent") return b.totalSpent - a.totalSpent;
      if (sortBy === "orders") return b.totalOrders - a.totalOrders;
      if (sortBy === "tier") return tierRank[b.tier] - tierRank[a.tier];
      return b.points - a.points;
    });
  }, [customers, query, sortBy, tier]);

  const selected = customers.find((customer) => customer.id === selectedId) || filtered[0] || customers[0];
  const totalCustomers = customers.length;
  const totalPoints = customers.reduce((sum, customer) => sum + customer.points, 0);
  const totalSpent = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0055FE]">Customer loyalty</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">Track loyalty tiers, points, visits, spend, and game engagement.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Customers" value={totalCustomers.toString()} icon={UserRound} />
          <Stat label="Points Live" value={totalPoints.toLocaleString()} icon={Sparkles} />
          <Stat label="Lifetime Spend" value={fmt0(totalSpent)} icon={WalletCards} />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" strokeWidth={1.8} />
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
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
              {Object.keys(tierStyles).map((item) => <option key={item} value={item}>{item}</option>)}
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
                  className={`grid w-full grid-cols-[1fr_auto] gap-4 border-b border-slate-100 p-4 text-left transition-colors last:border-b-0 hover:bg-slate-50 ${selected?.id === customer.id ? "bg-[#0055FE]/5" : "bg-white"}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{customer.name}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tierStyles[customer.tier]}`}>{customer.tier}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{customer.phone} · Last visit {customer.lastVisit}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                      <span><strong className="text-slate-800">{customer.points.toLocaleString()}</strong> points</span>
                      <span><strong className="text-slate-800">{fmt0(customer.totalSpent)}</strong> spent</span>
                      <span><strong className="text-slate-800">{customer.totalOrders}</strong> orders</span>
                    </div>
                  </div>
                  <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
                    <Trophy className="h-4 w-4 text-amber-500" strokeWidth={1.8} />
                    {customer.gameScore ? customer.gameScore.toLocaleString() : "No score"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">{selected.name}</h2>
                <p className="text-xs text-slate-500">{selected.phone}</p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs font-bold ${tierStyles[selected.tier]}`}>{selected.tier}</span>
            </div>

            {detailLoading && <p className="mt-3 text-xs text-slate-400">Refreshing customer detail...</p>}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <MiniMetric label="Balance" value={selected.points.toLocaleString()} />
              <MiniMetric label="Lifetime" value={selected.lifetimePoints.toLocaleString()} />
            </div>

            <div className="mt-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="h-4 w-4 text-slate-400" strokeWidth={1.8} /> Loyalty log</h3>
              <div className="space-y-2">
                {selected.transactions.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-400">No loyalty activity yet.</p>
                ) : selected.transactions.map((entry) => (
                  <div key={`${entry.date}-${entry.label}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
                    <div>
                      <p className="font-semibold text-slate-700">{entry.label}</p>
                      <p className="text-slate-400">{entry.type} · {entry.date}</p>
                    </div>
                    <span className={entry.points >= 0 ? "font-bold text-emerald-600" : "font-bold text-red-500"}>{entry.points > 0 ? "+" : ""}{entry.points}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><ShoppingBag className="h-4 w-4 text-slate-400" strokeWidth={1.8} /> Visit history</h3>
              <div className="space-y-2">
                {selected.visits.length === 0 ? (
                  <p className="rounded-xl border border-slate-100 px-3 py-2 text-xs text-slate-400">No visit history yet.</p>
                ) : selected.visits.map((visit) => (
                  <div key={`${visit.restaurant}-${visit.date}`} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-xs">
                    <div>
                      <p className="font-semibold text-slate-700">{visit.restaurant}</p>
                      <p className="text-slate-400">{visit.date}</p>
                    </div>
                    <span className="font-bold text-slate-800">{fmt(visit.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Award }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <Icon className="mb-2 h-4 w-4 text-[#0055FE]" strokeWidth={1.8} />
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
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
