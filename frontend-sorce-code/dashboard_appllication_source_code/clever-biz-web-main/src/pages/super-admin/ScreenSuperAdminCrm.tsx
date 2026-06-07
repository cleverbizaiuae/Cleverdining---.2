import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Star, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { cachedGet } from "@/lib/requestCache";

type Customer = {
  id: string;
  name: string;
  phone: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  loyaltyPoints?: number;
  lifetimePoints?: number;
  totalSpent?: string;
  totalOrders?: number;
  updatedAt?: string;
};

const tierStyles: Record<Customer["tier"], string> = {
  bronze: "bg-amber-50 text-amber-700 border-amber-200",
  silver: "bg-slate-50 text-slate-600 border-slate-200",
  gold: "bg-yellow-50 text-yellow-700 border-yellow-200",
  platinum: "bg-purple-50 text-purple-700 border-purple-200",
};

const fmt = (value: number) => `AED ${value.toFixed(0)}`;

const timeAgo = (value?: string) => {
  if (!value) return "-";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return "-";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export default function ScreenSuperAdminCrm() {
  const [search, setSearch] = useState("");

  const { data: customers = [], isLoading, error } = useQuery<Customer[]>({
    queryKey: ["superadmin-crm-customers"],
    queryFn: async () => {
      const response = await cachedGet("/api/crm/customers", {}, { ttlMs: 55_000 });
      return Array.isArray(response.data) ? response.data : response.data?.customers || response.data?.data || [];
    },
    refetchInterval: 60_000,
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) =>
      `${customer.name} ${customer.phone} ${customer.tier}`.toLowerCase().includes(query)
    );
  }, [customers, search]);

  const stats = useMemo(() => {
    const totalSpent = customers.reduce((sum, customer) => sum + Number(customer.totalSpent || 0), 0);
    const lifetimePoints = customers.reduce((sum, customer) => sum + Number(customer.lifetimePoints || 0), 0);
    const totalOrders = customers.reduce((sum, customer) => sum + Number(customer.totalOrders || 0), 0);
    const topTier = customers.filter((customer) => ["gold", "platinum"].includes(customer.tier)).length;
    return { totalSpent, lifetimePoints, totalOrders, topTier };
  }, [customers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0055FE]">Platform CRM</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Customer Intelligence</h1>
          <p className="text-sm text-slate-500">Platform-wide customer, loyalty, and game activity overview.</p>
        </div>
        <label className="relative w-full lg:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customers"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#0055FE]"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load platform CRM customers.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Customers" value={customers.length.toString()} helper={`${stats.topTier} Gold/Platinum`} icon={Users} />
        <Stat label="Total Orders" value={stats.totalOrders.toString()} helper="Across all customer profiles" icon={TrendingUp} />
        <Stat label="Lifetime Spend" value={fmt(stats.totalSpent)} helper="Recorded CRM spend" icon={TrendingUp} />
        <Stat label="Points Issued" value={stats.lifetimePoints.toString()} helper="Lifetime loyalty balance" icon={Star} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">Customers</h2>
          <p className="text-xs text-slate-500">Showing {filtered.length} of {customers.length}</p>
        </div>
        {isLoading ? (
          <div className="p-10 text-center text-sm text-slate-400">Loading customers...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">No customers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Tier</th>
                  <th className="px-5 py-3 text-right">Orders</th>
                  <th className="px-5 py-3 text-right">Spend</th>
                  <th className="px-5 py-3 text-right">Points</th>
                  <th className="px-5 py-3 text-right">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{customer.name || "Guest"}</p>
                      <p className="text-xs text-slate-400">{customer.phone}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full border px-2 py-1 text-xs font-bold capitalize ${tierStyles[customer.tier] || tierStyles.bronze}`}>
                        {customer.tier || "bronze"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-slate-700">{customer.totalOrders || 0}</td>
                    <td className="px-5 py-4 text-right font-bold text-slate-900">{fmt(Number(customer.totalSpent || 0))}</td>
                    <td className="px-5 py-4 text-right font-bold text-yellow-600">{customer.loyaltyPoints || 0}</td>
                    <td className="px-5 py-4 text-right text-slate-500">{timeAgo(customer.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="mb-4 h-5 w-5 text-[#0055FE]" strokeWidth={1.8} />
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-3 text-xs text-slate-500">{helper}</p>
    </div>
  );
}
