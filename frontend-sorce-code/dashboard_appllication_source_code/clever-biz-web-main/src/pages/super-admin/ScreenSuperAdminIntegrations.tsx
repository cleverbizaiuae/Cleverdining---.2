import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, ExternalLink, Link2, Plus, Search, Trash2, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";

type IntegrationStatus = "active" | "inactive";
type IntegrationCategory = "Database" | "Messaging" | "Payments" | "Infrastructure" | "AI" | "Analytics" | "Other";
type IntegrationCurrency = "USD" | "AED" | "GBP" | "EUR";
type IntegrationConnectionStatus = "connected" | "configured" | "requires_configuration" | "disabled" | "error";
type IntegrationApiHealth = "healthy" | "unknown" | "error";

type Integration = {
  id: string;
  providerKey?: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  connectionStatus: IntegrationConnectionStatus;
  apiHealth: IntegrationApiHealth;
  environment?: string;
  documentationUrl?: string;
  logoUrl: string;
  monthlyCost: number;
  currency: IntegrationCurrency;
  notes: string;
  description?: string;
  createdAt?: string;
};

type IntegrationPayload = {
  name: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  logoUrl: string | null;
  monthlyCost: number;
  currency: IntegrationCurrency;
  notes: string;
};
type PaymentProviderMeta = {
  code: string;
  name: string;
  logoUrl?: string;
  description?: string;
  documentationUrl?: string;
  supportedCountries?: string[];
  supportedCurrencies?: string[];
  supportedPaymentMethods?: string[];
  statusLabel?: string;
  connectionStatus?: string;
  totalRestaurantsUsing?: number;
  monthlyProcessedPayments?: number;
  monthlyTransactionVolume?: string | number;
  successRate?: number;
  webhookStatus?: string;
  apiHealth?: string;
};
type RestaurantOption = {
  id: number | string;
  resturent_name?: string;
  name?: string;
  location?: string;
};

const QUERY_KEY = ["/api/integrations"] as const;
const CATEGORIES: IntegrationCategory[] = ["Database", "Messaging", "Payments", "Infrastructure", "AI", "Analytics", "Other"];
const CURRENCIES: IntegrationCurrency[] = ["USD", "AED", "GBP", "EUR"];
const DEFAULTS: IntegrationPayload[] = [
  { name: "Stripe", category: "Payments", status: "active", logoUrl: "https://stripe.com/favicon.ico", monthlyCost: 0, currency: "USD", notes: "Card, wallet, and hosted checkout payments." },
  { name: "Checkout.com", category: "Payments", status: "active", logoUrl: "https://www.checkout.com/favicon.ico", monthlyCost: 0, currency: "USD", notes: "Hosted Payments Page for card and wallet payments." },
  { name: "PostgreSQL", category: "Database", status: "active", logoUrl: "https://www.postgresql.org/favicon.ico", monthlyCost: 0, currency: "USD", notes: "Primary relational database for the Django backend." },
  { name: "360dialog WhatsApp Business", category: "Messaging", status: "active", logoUrl: "https://www.360dialog.com/favicon.ico", monthlyCost: 49, currency: "USD", notes: "WhatsApp Business API provider for reservation chatbot workflows." },
  { name: "Sentry", category: "Analytics", status: "active", logoUrl: "https://sentry.io/_assets/favicon.ico", monthlyCost: 0, currency: "USD", notes: "Error monitoring integration wired for backend and frontend DSNs." },
];

const emptyIntegration = (): IntegrationPayload => ({ name: "", category: "Messaging", status: "active", logoUrl: null, monthlyCost: 0, currency: "USD", notes: "" });
const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "IN";
const normalize = (raw: any): Integration => ({
  id: String(raw.id),
  providerKey: raw.providerKey ?? raw.provider_key ?? "",
  name: raw.name || "Untitled",
  category: (raw.category || "Other") as IntegrationCategory,
  status: (raw.status || "inactive") as IntegrationStatus,
  connectionStatus: (raw.connectionStatus ?? raw.connection_status ?? "requires_configuration") as IntegrationConnectionStatus,
  apiHealth: (raw.apiHealth ?? raw.api_health ?? "unknown") as IntegrationApiHealth,
  environment: raw.environment || "",
  documentationUrl: raw.documentationUrl ?? raw.documentation_url ?? "",
  logoUrl: raw.logoUrl ?? raw.logo_url ?? "",
  monthlyCost: Number(raw.monthlyCost ?? raw.monthly_cost ?? 0),
  currency: (raw.currency || "USD") as IntegrationCurrency,
  notes: raw.notes || "",
  description: raw.description || raw.notes || "",
  createdAt: raw.createdAt ?? raw.created_at,
});
const payload = (data: IntegrationPayload) => ({
  name: data.name.trim(),
  logoUrl: data.logoUrl || null,
  category: data.category,
  monthlyCost: Number(data.monthlyCost || 0).toFixed(2),
  currency: data.currency,
  notes: data.notes || "",
  status: data.status,
});
const mutationErrorMessage = (error: any, fallback: string) => {
  const data = error?.response?.data;
  if (typeof data === "string") return data;
  if (typeof data?.error === "string") return data.error;
  if (data?.error && typeof data.error === "object") return JSON.stringify(data.error);
  if (typeof data?.detail === "string") return data.detail;
  if (error?.message) return error.message;
  return fallback;
};

export default function ScreenSuperAdminIntegrations() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | IntegrationCategory>("All");
  const [editing, setEditing] = useState<Integration | null>(null);
  const [form, setForm] = useState<IntegrationPayload | null>(null);
  const [logoValue, setLogoValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Integration | null>(null);
  const [seeded, setSeeded] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await axiosInstance.get("/api/integrations");
      return Array.isArray(res.data) ? res.data.map(normalize) : [];
    },
    refetchInterval: 60_000,
  });

  const { data: paymentProviders = [] } = useQuery({
    queryKey: ["/api/payment-providers"],
    queryFn: async () => {
      const res = await axiosInstance.get("/api/payment-providers");
      return Array.isArray(res.data) ? (res.data as PaymentProviderMeta[]) : [];
    },
    refetchInterval: 60_000,
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ["/adminapi/restaurants", "payment-provider-assignment"],
    queryFn: async () => {
      const res = await axiosInstance.get("/adminapi/restaurants/", { params: { page_size: 200 } });
      const rows = Array.isArray(res.data) ? res.data : res.data?.results || [];
      return rows as RestaurantOption[];
    },
    refetchInterval: 120_000,
  });

  const assignProviderMutation = useMutation({
    mutationFn: ({ provider, restaurantId, isEnabled }: { provider: string; restaurantId: string | number; isEnabled: boolean }) =>
      axiosInstance.patch(`/api/payment-providers/${provider}/`, { restaurantId, isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-providers"] });
      toast.success("Restaurant provider access updated");
    },
    onError: () => toast.error("Could not update restaurant provider access"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (data: IntegrationPayload) => axiosInstance.post("/api/integrations", payload(data)),
    onSuccess: () => { invalidate(); toast.success("Integration saved"); closeModal(); },
    onError: (error) => toast.error(mutationErrorMessage(error, "Could not save integration")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: IntegrationPayload }) => axiosInstance.patch(`/api/integrations/${id}`, payload(data)),
    onSuccess: () => { invalidate(); toast.success("Integration updated"); closeModal(); },
    onError: (error) => toast.error(mutationErrorMessage(error, "Could not update integration")),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IntegrationPayload> }) => axiosInstance.patch(`/api/integrations/${id}`, data),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(mutationErrorMessage(error, "Could not update integration")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => axiosInstance.delete(`/api/integrations/${id}`),
    onSuccess: () => { invalidate(); toast.success("Integration removed"); setDeleteTarget(null); },
    onError: (error) => toast.error(mutationErrorMessage(error, "Could not remove integration")),
  });

  const loadDefaultsMutation = useMutation({
    mutationFn: async () => {
      setSeeded(true);
      for (const item of DEFAULTS) await axiosInstance.post("/api/integrations", payload(item));
    },
    onSuccess: () => { invalidate(); toast.success("Default integrations loaded"); },
    onError: (error) => { setSeeded(false); toast.error(mutationErrorMessage(error, "Could not load defaults")); },
  });

  const canLoadDefaults = items.length === 0 && !seeded;
  const availableCategories = useMemo(() => ["All", ...CATEGORIES.filter((cat) => items.some((item) => item.category === cat))] as ("All" | IntegrationCategory)[], [items]);
  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !lower || [
        item.name,
        item.category,
        item.notes,
        item.description,
        item.connectionStatus,
        item.apiHealth,
        item.environment,
      ].filter(Boolean).join(" ").toLowerCase().includes(lower);
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

  const openAdd = () => { setEditing(null); const next = emptyIntegration(); setForm(next); setLogoValue(""); };
  const openEdit = (item: Integration) => {
    setEditing(item);
    setForm({ name: item.name, logoUrl: item.logoUrl, category: item.category, status: item.status, monthlyCost: item.monthlyCost, currency: item.currency, notes: item.notes });
    setLogoValue(item.logoUrl || "");
  };
  const closeModal = () => { setEditing(null); setForm(null); setLogoValue(""); };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const next: IntegrationPayload = {
      name: String(fd.get("name") || "").trim(),
      logoUrl: logoValue || null,
      category: (fd.get("category") || "Other") as IntegrationCategory,
      monthlyCost: Number(fd.get("monthlyCost") || 0),
      currency: (fd.get("currency") || "USD") as IntegrationCurrency,
      notes: String(fd.get("notes") || ""),
      status: (fd.get("status") || "active") as IntegrationStatus,
    };
    if (!next.name) return toast.error("Integration name is required");
    if (editing) updateMutation.mutate({ id: editing.id, data: next });
    else createMutation.mutate(next);
  };

  const handleLogoFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoValue(String(reader.result || ""));
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return <div className="space-y-6 animate-fadeIn">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Integrations</h1>
        <p className="text-sm text-slate-500">Third-party services and API connections</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {canLoadDefaults && <button onClick={() => loadDefaultsMutation.mutate()} disabled={loadDefaultsMutation.isPending} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Load defaults</button>}
        <button onClick={openAdd} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0055FE] px-4 text-sm font-semibold text-white shadow-lg shadow-blue-500/20"><Plus className="h-4 w-4" />Add Integration</button>
      </div>
    </div>

    <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-4 md:divide-x md:divide-slate-100">
      <FlatStat label="Total" value={stats.total} />
      <FlatStat label="Active" value={stats.active} />
      <FlatStat label="Inactive" value={stats.inactive} />
      <FlatStat label="Est. Monthly Cost" value={`$${stats.monthlyCost.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`} />
    </div>

    {paymentProviders.length > 0 && (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Payment provider framework</h2>
            <p className="text-xs text-slate-500">Provider metadata, availability, connection health, and platform usage.</p>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Category: Payments</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {paymentProviders.map((provider) => <PaymentProviderCard key={provider.code} provider={provider} restaurants={restaurants} onAssign={(restaurantId, isEnabled) => assignProviderMutation.mutate({ provider: provider.code, restaurantId, isEnabled })} />)}
        </div>
      </div>
    )}

    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search integrations" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#0055FE]" />
        </div>
        <div className="flex flex-wrap gap-2">
          {availableCategories.map((cat) => <button key={cat} onClick={() => setCategory(cat)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${category === cat ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-500 hover:text-slate-900"}`}>{cat}</button>)}
        </div>
      </div>
    </div>

      {isLoading ? <SkeletonGrid /> : filtered.length === 0 ? <EmptyState isFiltered={items.length > 0} canLoadDefaults={canLoadDefaults} onLoadDefaults={() => loadDefaultsMutation.mutate()} onAdd={openAdd} isLoadingDefaults={loadDefaultsMutation.isPending} /> : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{filtered.map((item) => <IntegrationCard key={item.id} item={item} onEdit={() => openEdit(item)} onDelete={() => setDeleteTarget(item)} onToggle={() => patchMutation.mutate({ id: item.id, data: { status: item.status === "active" ? "inactive" : "active" } })} />)}</div>}

    {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="text-lg font-semibold text-slate-900">{editing ? "Edit Integration" : "Add Integration"}</h3><p className="text-xs text-slate-500">Use a URL or upload an image file for the logo.</p></div><button onClick={closeModal} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
        <form onSubmit={save}>
        <div className="grid grid-cols-2 gap-3 p-5">
          <label className="block col-span-2"><span className="mb-1 block text-sm font-medium text-slate-600">Name</span><input name="name" required data-testid="input-integration-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-8 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" /></label>
          <div className="col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-600">Logo <span className="font-normal text-slate-400">- upload or paste URL</span></span>
            <LogoUploadField value={logoValue} onChange={setLogoValue} onFile={handleLogoFile} />
          </div>
          <label><span className="mb-1 block text-sm font-medium text-slate-600">Category</span><select name="category" data-testid="select-integration-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as IntegrationCategory })} className="h-8 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]">{CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}</select></label>
          <label><span className="mb-1 block text-sm font-medium text-slate-600">Status</span><select name="status" data-testid="select-integration-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as IntegrationStatus })} className="h-8 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label><span className="mb-1 block text-sm font-medium text-slate-600">Monthly cost</span><input name="monthlyCost" data-testid="input-integration-cost" type="number" min="0" step="0.01" value={form.monthlyCost} onChange={(event) => setForm({ ...form, monthlyCost: Number(event.target.value) })} className="h-8 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" /></label>
          <label><span className="mb-1 block text-sm font-medium text-slate-600">Currency</span><select name="currency" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value as IntegrationCurrency })} className="h-8 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]">{CURRENCIES.map((cur) => <option key={cur}>{cur}</option>)}</select></label>
          <label className="block col-span-2"><span className="mb-1 block text-sm font-medium text-slate-600">Notes <span className="font-normal text-slate-400">(optional)</span></span><input name="notes" data-testid="input-integration-notes" value={form.notes} placeholder="Brief description or use case" onChange={(event) => setForm({ ...form, notes: event.target.value })} className="h-8 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" /></label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4"><button type="button" onClick={closeModal} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white">Cancel</button><button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="rounded-lg bg-[#0055FE] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0044CC] disabled:opacity-60">{editing ? "Save changes" : "Add integration"}</button></div>
        </form>
      </div>
    </div>}

    {deleteTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"><h3 className="text-lg font-semibold text-slate-900">Remove integration?</h3><p className="mt-2 text-sm text-slate-500"><strong>{deleteTarget.name}</strong></p><p className="mt-1 text-sm text-slate-500">This cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button><button onClick={() => deleteMutation.mutate(deleteTarget.id)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Remove</button></div></div></div>}
  </div>;
}

function FlatStat({ label, value }: { label: string; value: string | number }) {
  return <div className="p-4"><p className="text-xl font-bold text-slate-900 sm:text-2xl">{value}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p></div>;
}

function LogoAvatar({ name, logoUrl, large = false }: { name: string; logoUrl?: string; large?: boolean }) {
  const cls = large ? "h-10 w-10 rounded-lg text-xs" : "h-9 w-9 rounded-lg text-[11px]";
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) return <img src={logoUrl} alt="" onError={() => setFailed(true)} className={`${cls} shrink-0 border border-slate-200 bg-white object-contain p-[10%]`} />;
  return <div className={`${cls} flex shrink-0 items-center justify-center bg-slate-100 font-bold text-slate-500`}>{initials(name)}</div>;
}

function LogoUploadField({ value, onChange, onFile }: { value: string; onChange: (value: string) => void; onFile: (event: ChangeEvent<HTMLInputElement>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return <div className="flex items-start gap-3">
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100">
      {value ? <img src={value} alt="" onError={() => onChange("")} className="h-10 w-10 rounded-lg border border-slate-200 bg-white object-contain p-1" /> : <Upload className="h-3.5 w-3.5 text-slate-400" />}
      {value && <button type="button" onClick={() => onChange("")} className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-white shadow"><X className="h-2.5 w-2.5" /></button>}
    </div>
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex gap-2">
        <input data-testid="input-integration-logo-url" value={value.startsWith("data:") ? "" : value} onChange={(event) => onChange(event.target.value)} placeholder="Paste logo URL..." className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" />
        <button data-testid="button-upload-logo" type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Upload className="h-3 w-3" />Upload</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
      <p className="text-[11px] text-slate-400">URL or upload an image file (PNG, JPG, SVG)</p>
    </div>
  </div>;
}

function IntegrationCard({ item, onEdit, onDelete, onToggle }: { item: Integration; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  const hasCost = Number(item.monthlyCost || 0) > 0;
  return <div data-testid={`card-integration-${item.id}`} className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <LogoAvatar name={item.name} logoUrl={item.logoUrl} />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium leading-tight text-slate-900">{item.name}</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">{item.category}</p>
        </div>
      </div>
      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={onEdit} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-[#0055FE]" title="Edit integration"><Edit2 className="h-3 w-3" /></button>
        <button onClick={onDelete} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remove integration"><Trash2 className="h-3 w-3" /></button>
      </div>
    </div>
    {item.notes && <p className="my-3 line-clamp-2 text-[12px] leading-relaxed text-slate-500">{item.notes}</p>}
    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
      {hasCost ? <span className="text-sm font-semibold text-slate-900">${Number(item.monthlyCost).toLocaleString("en-US", { maximumFractionDigits: 0 })} <span className="text-slate-400">{item.currency}/mo</span></span> : <span className="text-sm font-semibold text-slate-400">Free</span>}
      <button onClick={onToggle} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${item.status === "active" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{item.status === "active" ? "Active" : "Inactive"}</button>
    </div>
  </div>;
}

function PaymentProviderCard({
  provider,
  restaurants,
  onAssign,
}: {
  provider: PaymentProviderMeta;
  restaurants: RestaurantOption[];
  onAssign: (restaurantId: string | number, isEnabled: boolean) => void;
}) {
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>("");
  const volume = Number(provider.monthlyTransactionVolume || 0);
  const health = provider.apiHealth === "healthy" || provider.connectionStatus === "connected";
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <LogoAvatar name={provider.name} logoUrl={provider.logoUrl || ""} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900">{provider.name}</h3>
            {provider.statusLabel && <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${provider.statusLabel === "recommended" ? "bg-blue-50 text-[#0055FE]" : provider.statusLabel === "deprecated" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{provider.statusLabel}</span>}
          </div>
          <p className="text-[11px] text-slate-400">Payments</p>
        </div>
      </div>
      {provider.documentationUrl && <a href={provider.documentationUrl} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-[#0055FE]" title="Open provider documentation"><ExternalLink className="h-4 w-4" /></a>}
    </div>
    <p className="mt-3 line-clamp-2 min-h-9 text-xs leading-5 text-slate-500">{provider.description || "Payment provider integration."}</p>
    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
      <MiniMetric label="Restaurants" value={provider.totalRestaurantsUsing ?? 0} />
      <MiniMetric label="Monthly payments" value={provider.monthlyProcessedPayments ?? 0} />
      <MiniMetric label="Volume" value={`$${volume.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`} />
      <MiniMetric label="Success" value={`${Number(provider.successRate || 0).toFixed(1)}%`} />
    </div>
    <div className="mt-3 flex flex-wrap gap-1.5">
      {(provider.supportedCountries || []).slice(0, 4).map((item) => <span key={item} className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-100">{item}</span>)}
      {(provider.supportedCurrencies || []).slice(0, 4).map((item) => <span key={item} className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-100">{item}</span>)}
    </div>
    <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${health ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>API {health ? "Healthy" : "Unknown"}</span>
      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${provider.webhookStatus === "healthy" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>Webhook {provider.webhookStatus || "unknown"}</span>
    </div>
    {restaurants.length > 0 && (
      <div className="mt-3 border-t border-slate-200 pt-3">
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Assign provider access</label>
        <div className="flex gap-2">
          <select value={selectedRestaurantId} onChange={(event) => setSelectedRestaurantId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 outline-none focus:border-[#0055FE]">
            <option value="">Choose restaurant</option>
            {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.resturent_name || restaurant.name || `Restaurant ${restaurant.id}`}</option>)}
          </select>
          <button disabled={!selectedRestaurantId} onClick={() => onAssign(selectedRestaurantId, true)} className="rounded-lg bg-[#0055FE] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Enable</button>
          <button disabled={!selectedRestaurantId} onClick={() => onAssign(selectedRestaurantId, false)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50">Disable</button>
        </div>
      </div>
    )}
  </div>;
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-white p-2 ring-1 ring-slate-100">
    <p className="font-semibold text-slate-900">{value}</p>
    <p className="mt-0.5 uppercase tracking-wide text-slate-400">{label}</p>
  </div>;
}

function SkeletonGrid() {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: 4 }).map((_, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 animate-pulse"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-xl bg-slate-100" /><div className="space-y-2"><div className="h-4 w-28 rounded bg-slate-100" /><div className="h-3 w-16 rounded bg-slate-100" /></div></div><div className="mt-5 h-10 rounded bg-slate-100" /><div className="mt-5 flex justify-between"><div className="h-4 w-20 rounded bg-slate-100" /><div className="h-6 w-16 rounded-full bg-slate-100" /></div></div>)}
  </div>;
}

function EmptyState({ isFiltered, canLoadDefaults, onLoadDefaults, onAdd, isLoadingDefaults }: { isFiltered: boolean; canLoadDefaults: boolean; onLoadDefaults: () => void; onAdd: () => void; isLoadingDefaults: boolean }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
    <Link2 className="mx-auto mb-3 h-8 w-8 text-slate-300" />
    <p className="text-sm font-semibold text-slate-700">{isFiltered ? "No integrations match this filter." : "No integrations yet"}</p>
    <p className="mt-1 text-xs text-slate-400">{isFiltered ? "Clear search or category filters to see more services." : "Load the default services or add a custom API connection."}</p>
    {!isFiltered && <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
      {canLoadDefaults && <button onClick={onLoadDefaults} disabled={isLoadingDefaults} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Load defaults</button>}
      <button onClick={onAdd} className="rounded-lg bg-[#0055FE] px-4 py-2 text-sm font-semibold text-white">Add Integration</button>
    </div>}
  </div>;
}
