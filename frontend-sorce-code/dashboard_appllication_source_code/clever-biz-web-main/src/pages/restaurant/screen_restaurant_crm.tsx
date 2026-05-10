import { useMemo, useState } from "react";
import { Award, Crown, History, Search, ShoppingBag, SlidersHorizontal, Sparkles, Trophy, UserRound, WalletCards } from "lucide-react";
import { useRestaurantContext } from "@/lib/useRestaurantContext";

type Tier = "Bronze" | "Silver" | "Gold" | "Platinum";

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
  transactions: Array<{ type: "earn" | "redeem" | "bonus" | "expire"; label: string; points: number; date: string }>;
  visits: Array<{ restaurant: string; date: string; total: number }>;
  gameScore?: number;
};

const CUSTOMERS: CustomerRecord[] = [
  {
    id: "c-1001",
    name: "Aisha Khan",
    phone: "+971 50 123 4591",
    tier: "Platinum",
    points: 8420,
    lifetimePoints: 18420,
    totalSpent: 7240,
    totalOrders: 46,
    lastVisit: "2026-05-08",
    gameScore: 9810,
    transactions: [
      { type: "earn", label: "Dinner order", points: 420, date: "2026-05-08" },
      { type: "bonus", label: "Birthday bonus", points: 1000, date: "2026-04-21" },
      { type: "redeem", label: "Dessert reward", points: -750, date: "2026-04-11" },
    ],
    visits: [
      { restaurant: "Downtown", date: "2026-05-08", total: 420 },
      { restaurant: "Dubai Marina", date: "2026-04-27", total: 380 },
    ],
  },
  {
    id: "c-1002",
    name: "Omar Haddad",
    phone: "+971 55 884 2201",
    tier: "Gold",
    points: 3920,
    lifetimePoints: 9920,
    totalSpent: 4130,
    totalOrders: 29,
    lastVisit: "2026-05-07",
    gameScore: 6420,
    transactions: [
      { type: "earn", label: "Lunch order", points: 260, date: "2026-05-07" },
      { type: "redeem", label: "Loyalty discount", points: -500, date: "2026-04-30" },
    ],
    visits: [
      { restaurant: "Downtown", date: "2026-05-07", total: 260 },
      { restaurant: "Palm", date: "2026-04-30", total: 310 },
    ],
  },
  {
    id: "c-1003",
    name: "Maya Singh",
    phone: "+971 52 331 8800",
    tier: "Silver",
    points: 1540,
    lifetimePoints: 3540,
    totalSpent: 1760,
    totalOrders: 13,
    lastVisit: "2026-05-03",
    transactions: [
      { type: "earn", label: "Family table", points: 180, date: "2026-05-03" },
      { type: "expire", label: "Expired points", points: -120, date: "2026-04-01" },
    ],
    visits: [{ restaurant: "Downtown", date: "2026-05-03", total: 180 }],
  },
  {
    id: "c-1004",
    name: "Noah Williams",
    phone: "+44 7700 900111",
    tier: "Bronze",
    points: 620,
    lifetimePoints: 620,
    totalSpent: 420,
    totalOrders: 4,
    lastVisit: "2026-04-28",
    transactions: [{ type: "earn", label: "First QR order", points: 120, date: "2026-04-28" }],
    visits: [{ restaurant: "London Trial", date: "2026-04-28", total: 120 }],
  },
];

const tierStyles: Record<Tier, string> = {
  Bronze: "bg-amber-50 text-amber-700 border-amber-200",
  Silver: "bg-slate-100 text-slate-700 border-slate-200",
  Gold: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Platinum: "bg-purple-50 text-purple-700 border-purple-200",
};

export default function ScreenRestaurantCrm() {
  const { fmt, fmt0 } = useRestaurantContext();
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [sortBy, setSortBy] = useState<"points" | "spent" | "orders" | "tier">("points");
  const [selectedId, setSelectedId] = useState(CUSTOMERS[0]?.id || "");

  const filtered = useMemo(() => {
    const tierRank: Record<Tier, number> = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
    return CUSTOMERS.filter((customer) => {
      const matchesSearch = `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase());
      const matchesTier = tier === "all" || customer.tier === tier;
      return matchesSearch && matchesTier;
    }).sort((a, b) => {
      if (sortBy === "spent") return b.totalSpent - a.totalSpent;
      if (sortBy === "orders") return b.totalOrders - a.totalOrders;
      if (sortBy === "tier") return tierRank[b.tier] - tierRank[a.tier];
      return b.points - a.points;
    });
  }, [query, sortBy, tier]);

  const selected = CUSTOMERS.find((customer) => customer.id === selectedId) || filtered[0] || CUSTOMERS[0];
  const totalCustomers = CUSTOMERS.length;
  const totalPoints = CUSTOMERS.reduce((sum, customer) => sum + customer.points, 0);
  const totalSpent = CUSTOMERS.reduce((sum, customer) => sum + customer.totalSpent, 0);

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
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">{selected.name}</h2>
              <p className="text-xs text-slate-500">{selected.phone}</p>
            </div>
            <span className={`rounded-full border px-2 py-1 text-xs font-bold ${tierStyles[selected.tier]}`}>{selected.tier}</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <MiniMetric label="Balance" value={selected.points.toLocaleString()} />
            <MiniMetric label="Lifetime" value={selected.lifetimePoints.toLocaleString()} />
          </div>

          <div className="mt-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="h-4 w-4 text-slate-400" strokeWidth={1.8} /> Loyalty log</h3>
            <div className="space-y-2">
              {selected.transactions.map((entry) => (
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
              {selected.visits.map((visit) => (
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
