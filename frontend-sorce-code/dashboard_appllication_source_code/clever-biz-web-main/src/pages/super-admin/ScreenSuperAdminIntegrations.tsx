import { ChangeEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Link2, Plus, Search, Trash2, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";

type IntegrationStatus = "active" | "inactive";
type IntegrationCategory = "Database" | "Messaging" | "Payments" | "Infrastructure" | "AI" | "Analytics" | "Other";
type IntegrationCurrency = "USD" | "AED" | "GBP" | "EUR";

type Integration = {
  id: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  logoUrl: string;
  monthlyCost: number;
  currency: IntegrationCurrency;
  notes: string;
  createdAt?: string;
};

type IntegrationPayload = Omit<Integration, "id" | "createdAt">;

const CATEGORIES: IntegrationCategory[] = ["Database", "Messaging", "Payments", "Infrastructure", "AI", "Analytics", "Other"];
const CURRENCIES: IntegrationCurrency[] = ["USD", "AED", "GBP", "EUR"];
const DEFAULTS: IntegrationPayload[] = [
  { name: "Supabase", category: "Database", status: "active", logoUrl: "https://supabase.com/favicon/favicon-32x32.png", monthlyCost: 0, currency: "USD", notes: "Auth, Postgres, storage, and realtime services." },
  { name: "360dialog", category: "Messaging", status: "active", logoUrl: "", monthlyCost: 49, currency: "USD", notes: "WhatsApp Business API provider for reservation chatbot workflows." },
  { name: "Stripe", category: "Payments", status: "active", logoUrl: "https://stripe.com/favicon.ico", monthlyCost: 0, currency: "USD", notes: "Card payments and payout reconciliation." },
  { name: "Replit", category: "Infrastructure", status: "active", logoUrl: "https://replit.com/public/icons/favicon-196.png", monthlyCost: 25, currency: "USD", notes: "Prototype hosting and internal testing environments." },
];

const emptyIntegration = (): IntegrationPayload => ({ name: "", category: "Messaging", status: "active", logoUrl: "", monthlyCost: 0, currency: "USD", notes: "" });
const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "IN";
const normalize = (raw: any): Integration => ({
  id: String(raw.id),
  name: raw.name || "Untitled",
  category: (raw.category || "Other") as IntegrationCategory,
  status: (raw.status || "inactive") as IntegrationStatus,
  logoUrl: raw.logoUrl ?? raw.logo_url ?? "",
  monthlyCost: Number(raw.monthlyCost ?? raw.monthly_cost ?? 0),
  currency: (raw.currency || "USD") as IntegrationCurrency,
  notes: raw.notes || "",
  createdAt: raw.createdAt ?? raw.created_at,
});
const payload = (data: IntegrationPayload) => ({
  name: data.name.trim(),
  logoUrl: data.logoUrl || "",
  category: data.category,
  monthlyCost: Number(data.monthlyCost || 0).toFixed(2),
  currency: data.currency,
  notes: data.notes || "",
  status: data.status,
});

export default function ScreenSuperAdminIntegrations() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | IntegrationCategory>("All");
  const [editing, setEditing] = useState<Integration | null>(null);
  const [form, setForm] = useState<IntegrationPayload | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Integration | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["superadmin-integrations"],
    queryFn: async () => {
      const res = await axiosInstance.get("/api/integrations");
      return Array.isArray(res.data) ? res.data.map(normalize) : [];
    },
    refetchInterval: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: IntegrationPayload) => axiosInstance.post("/api/integrations", payload(data)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["superadmin-integrations"] }); toast.success("Integration saved"); closeModal(); },
    onError: () => toast.error("Could not save integration"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IntegrationPayload> }) => axiosInstance.patch(`/api/integrations/${id}`, payload({ ...emptyIntegration(), ...data } as IntegrationPayload)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["superadmin-integrations"] }); toast.success("Integration updated"); closeModal(); },
    onError: () => toast.error("Could not update integration"),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IntegrationPayload> }) => axiosInstance.patch(`/api/integrations/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["superadmin-integrations"] }),
    onError: () => toast.error("Could not update integration"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => axiosInstance.delete(`/api/integrations/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["superadmin-integrations"] }); toast.success("Integration removed"); setDeleteTarget(null); },
    onError: () => toast.error("Could not remove integration"),
  });

  const loadDefaultsMutation = useMutation({
    mutationFn: async () => {
      for (const item of DEFAULTS) await axiosInstance.post("/api/integrations", payload(item));
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["superadmin-integrations"] }); toast.success("Default integrations loaded"); },
    onError: () => toast.error("Could not load defaults"),
  });

  const availableCategories = useMemo(() => ["All", ...CATEGORIES.filter((cat) => items.some((item) => item.category === cat))] as ("All" | IntegrationCategory)[], [items]);
  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !lower || `${item.name} ${item.notes}`.toLowerCase().includes(lower);
      const matchesCategory = category === "All" || item.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [items, query, category]);

  const stats = useMemo(() => {
    const activeItems = items.filter((item) => item.status === "active");
    return {
      total: items.length,
      active: activeItems.length,
      inactive: items.length - activeItems.length,
      monthlyCost: activeItems.reduce((sum, item) => sum + Number(item.monthlyCost || 0), 0),
    };
  }, [items]);

  const openAdd = () => { setEditing(null); setForm(emptyIntegration()); };
  const openEdit = (item: Integration) => { setEditing(item); setForm({ name: item.name, logoUrl: item.logoUrl, category: item.category, status: item.status, monthlyCost: item.monthlyCost, currency: item.currency, notes: item.notes }); };
  const closeModal = () => { setEditing(null); setForm(null); };
  const save = () => {
    if (!form?.name.trim()) return toast.error("Integration name is required");
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  };

  const handleLogoFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !form) return;
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => prev ? { ...prev, logoUrl: String(reader.result || "") } : prev);
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return <div className="space-y-6 animate-fadeIn">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0055FE]">Platform Operations</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">Integrations</h1>
        <p className="text-sm text-slate-500">Track third-party services, status, cost, logos, and operating notes.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search integrations" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#0055FE] sm:w-72" />
        </div>
        {items.length === 0 && <button onClick={() => loadDefaultsMutation.mutate()} disabled={loadDefaultsMutation.isPending} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Load Defaults</button>}
        <button onClick={openAdd} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0055FE] px-4 text-sm font-semibold text-white shadow-lg shadow-blue-500/20"><Plus className="h-4 w-4" />Add Integration</button>
      </div>
    </div>

    <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-4 divide-x divide-slate-100">
      <FlatStat label="Total" value={stats.total} />
      <FlatStat label="Active" value={stats.active} />
      <FlatStat label="Inactive" value={stats.inactive} />
      <FlatStat label="Est. Monthly Cost" value={`$${stats.monthlyCost.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`} />
    </div>

    <div className="flex flex-wrap gap-2">
      {availableCategories.map((cat) => <button key={cat} onClick={() => setCategory(cat)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${category === cat ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500 hover:text-slate-900"}`}>{cat}</button>)}
    </div>

    {isLoading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading integrations...</div> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center"><Link2 className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p className="text-sm font-medium text-slate-500">No integrations found.</p>{items.length === 0 && <button onClick={() => loadDefaultsMutation.mutate()} className="mt-4 rounded-lg bg-[#0055FE] px-4 py-2 text-sm font-semibold text-white">Load Defaults</button>}</div> : <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => <IntegrationCard key={item.id} item={item} onEdit={() => openEdit(item)} onDelete={() => setDeleteTarget(item)} onToggle={() => patchMutation.mutate({ id: item.id, data: { status: item.status === "active" ? "inactive" : "active" } })} />)}</div>}

    {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4"><div><h3 className="text-lg font-semibold text-slate-900">{editing ? "Edit Integration" : "Add Integration"}</h3><p className="text-xs text-slate-500">Use a URL or upload an image file for the logo.</p></div><button onClick={closeModal} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-600">Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" /></label>
          <div className="sm:col-span-2 flex items-start gap-4"><LogoAvatar name={form.name} logoUrl={form.logoUrl} large /><div className="flex-1 space-y-2"><div className="flex gap-2"><input value={form.logoUrl || ""} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} placeholder="https://example.com/logo.png" className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" /><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Upload className="h-4 w-4" />Upload<input type="file" accept="image/*" className="hidden" onChange={handleLogoFile} /></label>{form.logoUrl && <button onClick={() => setForm({ ...form, logoUrl: "" })} className="h-10 rounded-lg border border-slate-200 px-3 text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>}</div><p className="text-[10px] text-slate-400">URL or upload an image file (PNG, JPG, SVG)</p></div></div>
          <label><span className="mb-1 block text-sm font-medium text-slate-600">Category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as IntegrationCategory })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]">{CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}</select></label>
          <label><span className="mb-1 block text-sm font-medium text-slate-600">Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as IntegrationStatus })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label><span className="mb-1 block text-sm font-medium text-slate-600">Monthly cost</span><input type="number" min="0" step="0.01" value={form.monthlyCost} onChange={(event) => setForm({ ...form, monthlyCost: Number(event.target.value) })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" /></label>
          <label><span className="mb-1 block text-sm font-medium text-slate-600">Currency</span><select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value as IntegrationCurrency })} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]">{CURRENCIES.map((cur) => <option key={cur}>{cur}</option>)}</select></label>
          <label className="block sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-600">Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0055FE]" /></label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4"><button onClick={closeModal} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">Cancel</button><button onClick={save} disabled={createMutation.isPending || updateMutation.isPending} className="rounded-lg bg-[#0055FE] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save Integration</button></div>
      </div>
    </div>}

    {deleteTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"><h3 className="text-lg font-semibold text-slate-900">Remove integration?</h3><p className="mt-2 text-sm text-slate-500">This will remove <strong>{deleteTarget.name}</strong> from the Super Admin integrations list.</p><div className="mt-6 flex justify-end gap-3"><button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button><button onClick={() => deleteMutation.mutate(deleteTarget.id)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Remove</button></div></div></div>}
  </div>;
}

function FlatStat({ label, value }: { label: string; value: string | number }) {
  return <div className="p-4"><p className="text-xl font-bold text-slate-900 sm:text-2xl">{value}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p></div>;
}

function LogoAvatar({ name, logoUrl, large = false }: { name: string; logoUrl?: string; large?: boolean }) {
  const cls = large ? "h-12 w-12 rounded-xl text-sm" : "h-11 w-11 rounded-xl text-sm";
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) return <img src={logoUrl} alt="" onError={() => setFailed(true)} className={`${cls} shrink-0 object-contain p-1 ring-1 ring-slate-200 bg-white`} />;
  return <div className={`${cls} flex shrink-0 items-center justify-center bg-slate-100 font-bold text-slate-500`}>{initials(name)}</div>;
}

function IntegrationCard({ item, onEdit, onDelete, onToggle }: { item: Integration; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  const cost = Number(item.monthlyCost || 0) > 0 ? `$${Number(item.monthlyCost).toLocaleString("en-GB", { maximumFractionDigits: 0 })} ${item.currency}/mo` : "Free";
  return <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
    <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><LogoAvatar name={item.name} logoUrl={item.logoUrl} /><div><h2 className="font-medium text-slate-900">{item.name}</h2><p className="text-xs text-slate-400">{item.category}</p></div></div><div className="flex gap-1 opacity-0 transition group-hover:opacity-100"><button onClick={onEdit} className="rounded-lg p-2 text-[#0055FE] hover:bg-blue-50"><Edit2 className="h-4 w-4" /></button><button onClick={onDelete} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div></div>
    <p className="mt-4 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500">{item.notes || "No notes added."}</p>
    <div className="mt-4 flex items-center justify-between"><span className="text-sm font-semibold text-slate-900">{cost}</span><button onClick={onToggle} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.status === "active" ? "Active" : "Inactive"}</button></div>
  </div>;
}
