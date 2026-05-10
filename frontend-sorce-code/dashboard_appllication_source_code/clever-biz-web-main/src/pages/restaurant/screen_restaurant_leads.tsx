import { useEffect, useMemo, useState } from "react";
import axiosInstance from "@/lib/axios";
import { useRestaurantContext } from "@/lib/useRestaurantContext";
import { AlertCircle, Loader2, MessageCircle, Phone, Search, Tag, UserCheck, UserRoundCheck, UsersRound } from "lucide-react";

type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";
type LeadSource = "whatsapp" | "walk-in" | "reservation" | "other";

type Lead = {
  id: string;
  name: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  firstSeen: string;
  lastSeen: string;
  notes: string;
  tags: string[];
  totalReservationAttempts: number;
  totalConfirmedReservations: number;
};

const statusLabels: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  lost: "Lost",
};

const statusStyles: Record<LeadStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  contacted: "bg-slate-100 text-slate-700 border-slate-200",
  qualified: "bg-amber-50 text-amber-700 border-amber-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  lost: "bg-red-50 text-red-700 border-red-200",
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

const asString = (value: unknown, fallback = "") => String(value || fallback);
const asNumber = (value: unknown) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const formatDate = (value: unknown) => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
};

const normalizeStatus = (value: unknown): LeadStatus => {
  const status = asString(value, "new").toLowerCase();
  if (["new", "contacted", "qualified", "converted", "lost"].includes(status)) return status as LeadStatus;
  return "new";
};

const normalizeSource = (value: unknown): LeadSource => {
  const source = asString(value, "other").toLowerCase().replace("_", "-");
  if (["whatsapp", "walk-in", "reservation", "other"].includes(source)) return source as LeadSource;
  return "other";
};

const normalizeTags = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((tag) => String(tag)).filter(Boolean);
  if (typeof value === "string") {
    return value.split(/[\n,]/).map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
};

const normalizeLead = (raw: Record<string, unknown>): Lead => ({
  id: asString(raw.id || raw.leadId || raw.lead_id || raw.phone),
  name: asString(raw.name || raw.fullName || raw.full_name || raw.customerName || raw.customer_name, "Guest"),
  phone: asString(raw.phone || raw.phoneNumber || raw.phone_number, "-"),
  source: normalizeSource(raw.source),
  status: normalizeStatus(raw.status),
  firstSeen: formatDate(raw.firstSeen || raw.first_seen || raw.firstSeenAt || raw.first_seen_at || raw.createdAt || raw.created_at),
  lastSeen: formatDate(raw.lastSeen || raw.last_seen || raw.lastSeenAt || raw.last_seen_at || raw.updatedAt || raw.updated_at),
  notes: asString(raw.notes || raw.lastMessagePreview || raw.last_message_preview, ""),
  tags: normalizeTags(raw.tags),
  totalReservationAttempts: asNumber(raw.totalReservationAttempts || raw.total_reservation_attempts),
  totalConfirmedReservations: asNumber(raw.totalConfirmedReservations || raw.total_confirmed_reservations),
});

const today = () => new Date().toISOString().slice(0, 10);

export default function ScreenRestaurantLeads() {
  const { restaurantId } = useRestaurantContext();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadLeads = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await axiosInstance.get(`/api/leads/${restaurantId || "default"}`);
        const rows = toArray<Record<string, unknown>>(response.data, ["leads"])
          .map(normalizeLead)
          .filter((lead) => lead.id);
        if (cancelled) return;
        setLeads(rows);
        setSelectedId((current) => current || rows[0]?.id || "");
      } catch {
        if (!cancelled) setError("Could not load leads from the existing leads endpoint.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadLeads();
    return () => { cancelled = true; };
  }, [restaurantId]);

  const filtered = useMemo(() => leads.filter((lead) => {
    const matchesSearch = `${lead.name} ${lead.phone}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || lead.status === status;
    return matchesSearch && matchesStatus;
  }), [leads, query, status]);

  const selected = leads.find((lead) => lead.id === selectedId) || filtered[0] || leads[0];
  const newToday = leads.filter((lead) => lead.status === "new" && lead.firstSeen === today()).length;
  const converted = leads.filter((lead) => lead.status === "converted").length;
  const totalAttempts = leads.reduce((sum, lead) => sum + lead.totalReservationAttempts, 0);
  const totalConfirmed = leads.reduce((sum, lead) => sum + lead.totalConfirmedReservations, 0);
  const conversionRate = totalAttempts > 0
    ? Math.round((totalConfirmed / totalAttempts) * 100)
    : Math.round((converted / Math.max(leads.length, 1)) * 100);

  const updateStatus = async (leadId: string, nextStatus: LeadStatus) => {
    const previous = leads;
    setUpdatingId(leadId);
    setLeads((prev) => prev.map((lead) => lead.id === leadId ? { ...lead, status: nextStatus, lastSeen: today() } : lead));
    try {
      const response = await axiosInstance.patch(`/api/leads/${leadId}`, { status: nextStatus });
      const updated = normalizeLead((response.data?.lead || response.data?.data || response.data) as Record<string, unknown>);
      if (updated.id) {
        setLeads((prev) => prev.map((lead) => lead.id === leadId ? { ...lead, ...updated } : lead));
      }
    } catch {
      setLeads(previous);
      setError("Could not update lead status. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0055FE]">Lead pipeline</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">Manage WhatsApp, reservation, walk-in, and other captured contacts.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Total" value={leads.length.toString()} icon={UsersRound} />
          <Stat label="New today" value={newToday.toString()} icon={MessageCircle} />
          <Stat label="Conversion" value={`${conversionRate}%`} icon={UserRoundCheck} />
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
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px]">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or phone"
                className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-[#0055FE]"
              />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value as LeadStatus | "all")} className="h-10 rounded-xl border border-slate-200 px-3 text-sm">
              <option value="all">All statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="flex min-h-60 items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.8} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No leads match this filter.</div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className={`rounded-2xl border p-4 text-left transition-colors hover:border-[#0055FE]/40 hover:bg-[#0055FE]/5 ${selected?.id === lead.id ? "border-[#0055FE]/40 bg-[#0055FE]/5" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{lead.name}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusStyles[lead.status]}`}>{statusLabels[lead.status]}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{lead.phone} · {lead.source} · Last seen {lead.lastSeen}</p>
                    </div>
                    <select
                      value={lead.status}
                      disabled={updatingId === lead.id}
                      onChange={(event) => {
                        event.stopPropagation();
                        updateStatus(lead.id, event.target.value as LeadStatus);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="h-9 rounded-xl border border-slate-200 px-3 text-xs disabled:opacity-60"
                    >
                      {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  {lead.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {lead.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">#{tag}</span>)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">{selected.name}</h2>
                <p className="text-xs text-slate-500">Lead detail</p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusStyles[selected.status]}`}>{statusLabels[selected.status]}</span>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <Detail icon={Phone} label="Phone" value={selected.phone} />
              <Detail icon={MessageCircle} label="Source" value={selected.source} />
              <Detail icon={UserCheck} label="First seen" value={selected.firstSeen} />
              <Detail icon={UserCheck} label="Last seen" value={selected.lastSeen} />
            </div>

            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
              <p className="text-sm leading-relaxed text-slate-700">{selected.notes || "No notes captured yet."}</p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <MiniMetric label="Attempts" value={selected.totalReservationAttempts.toString()} />
              <MiniMetric label="Confirmed" value={selected.totalConfirmedReservations.toString()} />
            </div>

            {selected.tags.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Tag className="h-4 w-4 text-slate-400" strokeWidth={1.8} /> Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {selected.tags.map((tag) => <span key={tag} className="rounded-full bg-[#0055FE]/10 px-3 py-1 text-xs font-semibold text-[#0055FE]">{tag}</span>)}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof UsersRound }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <Icon className="mb-2 h-4 w-4 text-[#0055FE]" strokeWidth={1.8} />
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
      <Icon className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="font-semibold capitalize text-slate-800">{value}</p>
      </div>
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
