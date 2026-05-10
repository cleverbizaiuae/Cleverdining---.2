import { useMemo, useState } from "react";
import { MessageCircle, Phone, Search, Tag, UserCheck, UserRoundCheck, UsersRound } from "lucide-react";

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
};

const INITIAL_LEADS: Lead[] = [
  { id: "l-1001", name: "Farah Al Nuaimi", phone: "+971 50 442 1009", source: "whatsapp", status: "new", firstSeen: "2026-05-10", lastSeen: "2026-05-10", notes: "Asked for Friday dinner availability for six guests.", tags: ["family", "dinner"] },
  { id: "l-1002", name: "Daniel Cooper", phone: "+44 7700 900245", source: "reservation", status: "qualified", firstSeen: "2026-05-06", lastSeen: "2026-05-09", notes: "Interested in private dining package.", tags: ["private dining", "high intent"] },
  { id: "l-1003", name: "Sara Mendez", phone: "+971 55 220 1844", source: "walk-in", status: "converted", firstSeen: "2026-04-28", lastSeen: "2026-05-04", notes: "Converted after tasting menu follow-up.", tags: ["tasting menu"] },
  { id: "l-1004", name: "Ahmed Saleh", phone: "+971 52 880 4411", source: "whatsapp", status: "contacted", firstSeen: "2026-05-08", lastSeen: "2026-05-09", notes: "Needs callback about birthday setup.", tags: ["birthday", "callback"] },
];

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

export default function ScreenRestaurantLeads() {
  const [leads, setLeads] = useState(INITIAL_LEADS);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [selectedId, setSelectedId] = useState(INITIAL_LEADS[0]?.id || "");

  const filtered = useMemo(() => leads.filter((lead) => {
    const matchesSearch = `${lead.name} ${lead.phone}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || lead.status === status;
    return matchesSearch && matchesStatus;
  }), [leads, query, status]);

  const selected = leads.find((lead) => lead.id === selectedId) || filtered[0] || leads[0];
  const newToday = leads.filter((lead) => lead.status === "new" && lead.firstSeen === "2026-05-10").length;
  const converted = leads.filter((lead) => lead.status === "converted").length;
  const conversionRate = Math.round((converted / Math.max(leads.length, 1)) * 100);

  const updateStatus = (leadId: string, nextStatus: LeadStatus) => {
    setLeads((prev) => prev.map((lead) => lead.id === leadId ? { ...lead, status: nextStatus, lastSeen: "2026-05-10" } : lead));
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
                    onChange={(event) => {
                      event.stopPropagation();
                      updateStatus(lead.id, event.target.value as LeadStatus);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="h-9 rounded-xl border border-slate-200 px-3 text-xs"
                  >
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {lead.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">#{tag}</span>)}
                </div>
              </button>
            ))}
          </div>
        </section>

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
            <p className="text-sm leading-relaxed text-slate-700">{selected.notes}</p>
          </div>

          <div className="mt-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Tag className="h-4 w-4 text-slate-400" strokeWidth={1.8} /> Tags</h3>
            <div className="flex flex-wrap gap-2">
              {selected.tags.map((tag) => <span key={tag} className="rounded-full bg-[#0055FE]/10 px-3 py-1 text-xs font-semibold text-[#0055FE]">{tag}</span>)}
            </div>
          </div>
        </aside>
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
