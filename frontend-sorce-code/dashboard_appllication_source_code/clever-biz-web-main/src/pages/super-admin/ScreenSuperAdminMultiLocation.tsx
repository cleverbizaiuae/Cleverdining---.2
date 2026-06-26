import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Edit2, Filter, MapPin, Network, Plus, Search, X, type LucideIcon } from "lucide-react";
import { cachedGet } from "@/lib/requestCache";
import toast from "react-hot-toast";

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
  logo?: string;
  logoUrl?: string;
};

type Group = {
  id: string;
  name: string;
  region: string;
  logoUrl?: string;
  brandColor: string;
  note: string;
};

const STORAGE_KEY = "superadmin_multilocation_groups";
const DEFAULT_GROUPS: Group[] = [
  { id: "uae-premium", name: "UAE Premium Dining", region: "UAE", brandColor: "#0055FE", note: "High-performing premium accounts" },
  { id: "uk-growth", name: "UK Growth Portfolio", region: "UK", brandColor: "#111827", note: "Expansion locations across UK cities" },
];

const restaurantName = (restaurant: Restaurant) => restaurant.resturent_name || restaurant.name || "Unnamed Restaurant";
const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "ML";
const readGroups = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return Array.isArray(parsed) ? parsed : DEFAULT_GROUPS;
  } catch {
    return DEFAULT_GROUPS;
  }
};

export default function ScreenSuperAdminMultiLocation() {
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [groups, setGroups] = useState<Group[]>(readGroups);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [form, setForm] = useState<Group>({ id: "", name: "", region: "UAE", logoUrl: "", brandColor: "#0055FE", note: "" });

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

  const filteredRestaurants = useMemo(() => {
    const query = search.trim().toLowerCase();
    return restaurants.filter((restaurant) => {
      const matchesSearch = !query || `${restaurantName(restaurant)} ${restaurant.location || ""} ${restaurant.city || ""}`.toLowerCase().includes(query);
      const matchesRegion = region === "all" || restaurant.region === region || restaurant.country === region;
      return matchesSearch && matchesRegion;
    });
  }, [restaurants, region, search]);

  const grouped = useMemo(() => groups.map((group) => ({
    group,
    locations: filteredRestaurants.filter((restaurant) => (restaurant.region || restaurant.country || "Unknown") === group.region),
  })).filter((entry) => region === "all" || entry.group.region === region), [filteredRestaurants, groups, region]);

  const activeCount = restaurants.filter((restaurant) => String(restaurant.status || "").toLowerCase() === "active").length;
  const totalTables = restaurants.reduce((sum, restaurant) => sum + Number(restaurant.table_count || restaurant.qr_codes || 0), 0);

  const persistGroups = (next: Group[]) => {
    setGroups(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const openAdd = () => {
    setEditingGroup(null);
    setForm({ id: `group-${Date.now()}`, name: "", region: "UAE", logoUrl: "", brandColor: "#0055FE", note: "" });
  };

  const openEdit = (group: Group) => {
    setEditingGroup(group);
    setForm(group);
  };

  const saveGroup = () => {
    if (!form.name.trim()) return toast.error("Group name is required");
    const next = editingGroup ? groups.map((group) => group.id === editingGroup.id ? form : group) : [form, ...groups];
    persistGroups(next);
    setEditingGroup(null);
    setForm({ id: "", name: "", region: "UAE", logoUrl: "", brandColor: "#0055FE", note: "" });
    toast.success("Group saved");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0055FE]">Platform Groups</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Multi-Location Control</h1>
          <p className="text-sm text-slate-500">Manage restaurant groups and regional performance across all clients.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search locations" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#0055FE] sm:w-72" /></label>
          <label className="relative w-full sm:w-56"><Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} /><select value={region} onChange={(event) => setRegion(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm outline-none focus:border-[#0055FE]">{regions.map((item) => <option key={item} value={item}>{item === "all" ? "All regions" : item}</option>)}</select></label>
          <button onClick={openAdd} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0055FE] px-4 text-sm font-semibold text-white shadow-lg shadow-blue-500/20"><Plus className="h-4 w-4" />Add Group</button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Could not load registered restaurants.</div>}

      <div className="grid gap-4 md:grid-cols-3"><Stat label="Registered Restaurants" value={restaurants.length.toString()} icon={Network} /><Stat label="Active Locations" value={activeCount.toString()} icon={MapPin} /><Stat label="QR / Table Capacity" value={totalTables.toString()} icon={Network} /></div>

      <div className="text-sm text-slate-500">Performance uses live registered restaurant data, grouped by region and brand portfolio.</div>

      {isLoading ? <div className="p-10 text-center text-sm text-slate-400">Loading locations...</div> : grouped.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">No groups found.</div> : (
        <div className="grid gap-5 xl:grid-cols-2">
          {grouped.map(({ group, locations }, index) => <GroupCard key={group.id} group={group} locations={locations} trend={index % 2 === 0 ? "up" : "down"} onEdit={() => openEdit(group)} />)}
        </div>
      )}

      {(form.id || editingGroup) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"><div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 px-6 py-4"><div><h3 className="text-lg font-semibold text-slate-900">{editingGroup ? "Edit Group" : "Add Group"}</h3><p className="text-xs text-slate-500">Set logo, brand colour, and region.</p></div><button onClick={() => { setEditingGroup(null); setForm({ id: "", name: "", region: "UAE", logoUrl: "", brandColor: "#0055FE", note: "" }); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="space-y-4 p-6"><label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Group Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" /></label><label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Logo URL</span><input value={form.logoUrl || ""} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} placeholder="https://..." className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-medium text-slate-600">Region</span><select value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]"><option value="UAE">UAE</option><option value="UK">UK</option></select></label><label><span className="mb-1 block text-xs font-medium text-slate-600">Brand Colour</span><input type="color" value={form.brandColor} onChange={(event) => setForm({ ...form, brandColor: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2" /></label></div><label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Performance Note</span><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0055FE]" /></label></div><div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4"><button onClick={() => { setEditingGroup(null); setForm({ id: "", name: "", region: "UAE", logoUrl: "", brandColor: "#0055FE", note: "" }); }} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">Cancel</button><button onClick={saveGroup} className="rounded-lg bg-[#0055FE] px-4 py-2 text-sm font-semibold text-white">Save Group</button></div></div></div>}
    </div>
  );
}

function GroupCard({ group, locations, trend, onEdit }: { group: Group; locations: Restaurant[]; trend: "up" | "down"; onEdit: () => void }) {
  const totalTables = locations.reduce((sum, restaurant) => sum + Number(restaurant.table_count || restaurant.qr_codes || 0), 0);
  const active = locations.filter((restaurant) => String(restaurant.status || "active") === "active").length;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="bg-slate-900 p-5 text-white"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><BrandMark name={group.name} logoUrl={group.logoUrl} color={group.brandColor} size="lg" /><div><h2 className="text-lg font-bold">{group.name}</h2><p className="text-xs text-white/60">{group.region} · {locations.length} locations</p></div></div><button onClick={onEdit} className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/15 hover:text-white"><Edit2 className="h-4 w-4" /></button></div><p className="mt-4 text-sm text-white/70">{group.note || "No performance note set."}</p></div><div className="grid grid-cols-3 border-b border-slate-100"><Mini label="Locations" value={locations.length} /><Mini label="Active" value={active} /><Mini label="Tables" value={totalTables} /></div><div className="divide-y divide-slate-100">{locations.slice(0, 5).map((restaurant) => <div key={restaurant.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3"><div className="col-span-6 flex items-center gap-3"><BrandMark name={restaurantName(restaurant)} logoUrl={restaurant.logoUrl || restaurant.logo} color={group.brandColor} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{restaurantName(restaurant)}</p><p className="truncate text-xs text-slate-500">{restaurant.location || restaurant.city || "Location not set"}</p></div></div><div className="col-span-3 text-xs font-medium capitalize text-slate-500">{restaurant.plan || restaurant.package || "standard"}</div><div className="col-span-3 flex items-center justify-end gap-2"><span className="text-xs font-semibold text-slate-600">{restaurant.status || "active"}</span>{trend === "up" ? <span title="Revenue and activity trending up versus previous period"><ArrowUpRight className="h-4 w-4 text-emerald-500" /></span> : <span title="Revenue or activity trending down versus previous period"><ArrowDownRight className="h-4 w-4 text-rose-500" /></span>}</div></div>)}{locations.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No locations assigned to this group.</div>}</div></section>;
}

function BrandMark({ name, logoUrl, color, size = "md" }: { name: string; logoUrl?: string; color: string; size?: "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-14 w-14 rounded-2xl text-base" : "h-10 w-10 rounded-xl text-xs";
  return logoUrl ? <img src={logoUrl} alt="" className={`${sizeClass} object-cover ring-1 ring-white/20`} /> : <div className={`${sizeClass} flex shrink-0 items-center justify-center font-black text-white`} style={{ backgroundColor: color }}>{initials(name)}</div>;
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Icon className="mb-4 h-5 w-5 text-[#0055FE]" strokeWidth={1.8} /><p className="text-2xl font-black text-slate-900">{value}</p><p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p></div>; }
function Mini({ label, value }: { label: string; value: number }) { return <div className="p-4 text-center"><p className="text-xl font-bold text-slate-900">{value.toLocaleString()}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p></div>; }
