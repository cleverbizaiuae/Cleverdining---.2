import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Filter, MapPin, Network, Search, type LucideIcon } from "lucide-react";
import { cachedGet } from "@/lib/requestCache";

type Restaurant = {
  id: number | string;
  resturent_name?: string;
  name?: string;
  location?: string;
  city?: string;
  country?: string;
  region?: string;
  package?: string | null;
  plan?: string | null;
  status?: string;
  qr_codes?: number;
  table_count?: number;
};

const restaurantName = (restaurant: Restaurant) => restaurant.resturent_name || restaurant.name || "Unnamed Restaurant";

export default function ScreenSuperAdminMultiLocation() {
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");

  const { data: restaurants = [], isLoading, error } = useQuery<Restaurant[]>({
    queryKey: ["superadmin-multilocation-restaurants"],
    queryFn: async () => {
      const response = await cachedGet("/owners/registered-restaurants/", {}, { ttlMs: 60_000 });
      const payload = response.data;
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.results)) return payload.results;
      if (Array.isArray(payload?.data)) return payload.data;
      return [];
    },
    refetchInterval: 60_000,
  });

  const regions = useMemo(() => {
    const values = new Set(restaurants.map((restaurant) => restaurant.region || restaurant.country || "Unknown"));
    return ["all", ...Array.from(values).filter(Boolean)];
  }, [restaurants]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return restaurants.filter((restaurant) => {
      const matchesSearch = !query || `${restaurantName(restaurant)} ${restaurant.location || ""} ${restaurant.city || ""}`.toLowerCase().includes(query);
      const matchesRegion = region === "all" || restaurant.region === region || restaurant.country === region;
      return matchesSearch && matchesRegion;
    });
  }, [restaurants, region, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Restaurant[]>();
    filtered.forEach((restaurant) => {
      const key = restaurant.region || restaurant.country || "Unknown";
      map.set(key, [...(map.get(key) || []), restaurant]);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const activeCount = restaurants.filter((restaurant) => String(restaurant.status || "").toLowerCase() === "active").length;
  const totalTables = restaurants.reduce((sum, restaurant) => sum + Number(restaurant.table_count || restaurant.qr_codes || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0055FE]">Platform Groups</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Multi-Location Control</h1>
          <p className="text-sm text-slate-500">Review restaurant groups and locations across all regions.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search locations"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#0055FE] sm:w-72"
            />
          </label>
          <label className="relative w-full sm:w-56">
            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
            <select
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm outline-none focus:border-[#0055FE]"
            >
              {regions.map((item) => <option key={item} value={item}>{item === "all" ? "All regions" : item}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load registered restaurants.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Registered Restaurants" value={restaurants.length.toString()} icon={Building2} />
        <Stat label="Active Locations" value={activeCount.toString()} icon={MapPin} />
        <Stat label="QR / Table Capacity" value={totalTables.toString()} icon={Network} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Location Groups</h2>
            <p className="text-xs text-slate-500">Grouped by region for super admin review.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{filtered.length} shown</span>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-sm text-slate-400">Loading locations...</div>
        ) : grouped.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">No locations found.</div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([group, locations]) => (
              <div key={group} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">{group}</h3>
                  <span className="text-xs font-semibold text-slate-500">{locations.length} locations</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {locations.map((restaurant) => (
                    <div key={restaurant.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-900">{restaurantName(restaurant)}</p>
                          <p className="mt-1 text-xs text-slate-500">{restaurant.location || restaurant.city || "Location not set"}</p>
                        </div>
                        <span className="rounded-full bg-[#0055FE]/10 px-2.5 py-1 text-[10px] font-bold uppercase text-[#0055FE]">
                          {restaurant.status || "active"}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                        <Metric label="Plan" value={restaurant.plan || restaurant.package || "standard"} />
                        <Metric label="Tables" value={String(restaurant.table_count || restaurant.qr_codes || 0)} />
                        <Metric label="Region" value={restaurant.region || restaurant.country || group} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="mb-4 h-5 w-5 text-[#0055FE]" strokeWidth={1.8} />
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 truncate font-semibold capitalize text-slate-700">{value}</p>
    </div>
  );
}
