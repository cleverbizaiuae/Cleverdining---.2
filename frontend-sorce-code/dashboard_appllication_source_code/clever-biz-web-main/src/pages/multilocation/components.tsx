import { Eye } from "lucide-react";
import type { ReactNode } from "react";
import type { LocationAggregate, MultiLocationRole, MultiLocationStatus } from "./store";

export function formatCurrency(value: number): string {
  return `AED ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function IconContainer({ children }: { children: ReactNode }) {
  return (
    <span className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 text-slate-400 flex items-center justify-center">
      {children}
    </span>
  );
}

export function EyeTooltip({ text }: { text: string }) {
  return (
    <span className="inline-flex relative group align-middle">
      <button
        type="button"
        className="w-6 h-6 rounded-md bg-slate-50 border border-slate-100 text-slate-400 inline-flex items-center justify-center"
      >
        <Eye size={14} />
      </button>
      <span className="absolute right-0 top-[110%] w-64 hidden group-hover:block bg-slate-900 text-white text-xs rounded-lg p-2 z-20 shadow-lg">
        {text}
      </span>
    </span>
  );
}

export function StatusBadge({ status }: { status: MultiLocationStatus }) {
  const label = status === "active" ? "Active" : status === "inactive" ? "Inactive" : "Needs Attention";
  return <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">{label}</span>;
}

export function RoleBadge({ role }: { role: MultiLocationRole }) {
  return <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold capitalize">{role}</span>;
}

export function SummaryCard({
  title,
  value,
  featured,
}: {
  title: string;
  value: string;
  featured?: boolean;
}) {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl ${featured ? "p-8 md:p-10 min-h-[156px]" : "p-5"}`}>
      <p className="text-xs text-slate-500 uppercase tracking-wider">{title}</p>
      <p className={`${featured ? "text-4xl md:text-5xl mt-4" : "text-3xl mt-3"} font-bold text-slate-900`}>{value}</p>
    </div>
  );
}

export function VerticalRevenueChart({ rows }: { rows: LocationAggregate[] }) {
  const peak = Math.max(...rows.map((row) => row.revenue), 1);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Revenue by Location</h3>
      <div className="h-72 flex items-end gap-4">
        {rows.map((row) => {
          const height = Math.max(12, Math.round((row.revenue / peak) * 220));
          return (
            <div key={row.location_id} className="flex-1 min-w-0 text-center" title={`${row.location_name}: ${formatCurrency(row.revenue)}`}>
              <div className="relative h-60 flex items-end justify-center">
                <div className="w-full rounded-t-xl bg-slate-900/90 hover:bg-slate-900 transition-colors" style={{ height }} />
              </div>
              <p className="text-xs text-slate-600 mt-2 truncate">{row.location_name}</p>
              <p className="text-[11px] text-slate-400">{formatCurrency(row.revenue)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HorizontalRevenueChart({ rows }: { rows: LocationAggregate[] }) {
  const peak = Math.max(...rows.map((row) => row.revenue), 1);
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.location_id}>
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
            <span>{row.location_name}</span>
            <span>{formatCurrency(row.revenue)} · {row.orders} orders</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-slate-900 rounded-full" style={{ width: `${Math.max(6, (row.revenue / peak) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GroupedBars({ rows }: { rows: LocationAggregate[] }) {
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);
  const maxOrders = Math.max(...rows.map((row) => row.orders), 1);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Orders vs Revenue</h3>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.location_id} className="grid grid-cols-[120px_1fr] gap-3 items-center">
            <p className="text-xs text-slate-600 truncate">{row.location_name}</p>
            <div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-1">
                <div className="h-full bg-blue-600" style={{ width: `${Math.max(4, (row.revenue / maxRevenue) * 100)}%` }} />
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-blue-300" style={{ width: `${Math.max(4, (row.orders / maxOrders) * 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs text-slate-500 flex gap-4">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-600" />Revenue</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-300" />Orders</span>
      </div>
    </div>
  );
}

export function RevenueShareDonut({ rows }: { rows: LocationAggregate[] }) {
  const total = rows.reduce((sum, row) => sum + row.revenue, 0) || 1;
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const colors = ["#0f172a", "#1e293b", "#334155", "#475569", "#64748b", "#94a3b8"];

  let acc = 0;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Revenue Share</h3>
        <EyeTooltip text="Share shows each location contribution to the total selected revenue." />
      </div>
      <div className="flex flex-col md:flex-row items-center gap-6">
        <svg width="220" height="220" viewBox="0 0 220 220">
          <g transform="translate(110,110)">
            <circle r={radius} fill="transparent" stroke="#e2e8f0" strokeWidth="24" />
            {rows.map((row, idx) => {
              const share = row.revenue / total;
              const segment = share * circumference;
              const dasharray = `${segment} ${circumference - segment}`;
              const dashoffset = -acc;
              acc += segment;
              return (
                <circle
                  key={row.location_id}
                  r={radius}
                  fill="transparent"
                  stroke={colors[idx % colors.length]}
                  strokeWidth="24"
                  strokeDasharray={dasharray}
                  strokeDashoffset={dashoffset}
                  transform="rotate(-90)"
                />
              );
            })}
            <circle r={48} fill="white" />
            <text textAnchor="middle" y="4" className="fill-slate-900 text-sm font-semibold">100%</text>
          </g>
        </svg>

        <div className="space-y-2 w-full">
          {rows.map((row, idx) => (
            <div key={row.location_id} className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: colors[idx % colors.length] }} />
                {row.location_name}
              </span>
              <span className="text-slate-600">{formatPercent(row.revenue_share_pct)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
