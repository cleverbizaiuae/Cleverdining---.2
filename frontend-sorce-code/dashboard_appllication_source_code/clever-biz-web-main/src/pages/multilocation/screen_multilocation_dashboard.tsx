import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { useNavigate } from "react-router";
import {
  buildDashboardSummary,
  getDefaultDateRange,
  normalizeDateRange,
  type DashboardSummary,
} from "./store";
import {
  EyeTooltip,
  RevenueShareDonut,
  SummaryCard,
  VerticalRevenueChart,
  formatCurrency,
  formatPercent,
} from "./components";

export default function ScreenMultiLocationDashboard() {
  const navigate = useNavigate();
  const defaultRange = getDefaultDateRange();

  const [range] = useState(defaultRange);
  const [summary, setSummary] = useState<DashboardSummary>(() =>
    buildDashboardSummary(normalizeDateRange(range.startDate, range.endDate))
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const load = () => {
      setSummary(buildDashboardSummary(normalizeDateRange(range.startDate, range.endDate)));
    };
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, [range.startDate, range.endDate]);

  const rankingRows = useMemo(() => {
    const rows = [...summary.locations];
    rows.sort((a, b) => (sortDir === "desc" ? b.revenue - a.revenue : a.revenue - b.revenue));
    return rows;
  }, [summary.locations, sortDir]);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard title="Total Revenue" value={formatCurrency(summary.total_revenue)} featured />
        <SummaryCard title="Total Orders" value={summary.total_orders.toLocaleString("en-US")} />
        <SummaryCard title="Active Locations" value={`${summary.active_locations}`} />
        <SummaryCard title="Total Staff" value={`${summary.total_staff}`} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3">
          <VerticalRevenueChart rows={summary.locations} />
        </div>
        <div className="xl:col-span-2">
          <RevenueShareDonut rows={summary.locations} />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Best Performing</p>
          <h3 className="text-xl font-bold text-slate-900 mt-2">{summary.best_performing?.location_name || "-"}</h3>
          <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs">Revenue</p>
              <p className="font-semibold text-slate-900">{formatCurrency(summary.best_performing?.revenue || 0)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Orders</p>
              <p className="font-semibold text-slate-900">{summary.best_performing?.orders || 0}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Avg Order</p>
              <p className="font-semibold text-slate-900">{formatCurrency(summary.best_performing?.avg_order_value || 0)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Needs Attention</p>
          <h3 className="text-xl font-bold text-slate-900 mt-2">{summary.needs_attention?.location_name || "-"}</h3>
          <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs">Revenue</p>
              <p className="font-semibold text-slate-900">{formatCurrency(summary.needs_attention?.revenue || 0)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Orders</p>
              <p className="font-semibold text-slate-900">{summary.needs_attention?.orders || 0}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Avg Order</p>
              <p className="font-semibold text-slate-900">{formatCurrency(summary.needs_attention?.avg_order_value || 0)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Location Rankings</h3>
          <button
            className="inline-flex items-center gap-2 text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
            onClick={() => setSortDir((prev) => (prev === "desc" ? "asc" : "desc"))}
          >
            <ArrowDownUp size={14} />
            Sort by Revenue
          </button>
        </div>
        <div className="divide-y divide-slate-100 sm:hidden">
          {rankingRows.map((row) => (
            <button
              key={row.location_id}
              className="w-full p-4 text-left space-y-3 hover:bg-slate-50"
              onClick={() => navigate(`/multilocation/locations/${row.location_id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{row.location_name}</p>
                  <p className="text-xs text-slate-500">{row.orders} orders</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-slate-900">{formatCurrency(row.revenue)}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-900 rounded-full" style={{ width: `${Math.max(5, row.revenue_share_pct)}%` }} />
                </div>
                <span className="text-slate-600 text-xs">{formatPercent(row.revenue_share_pct)}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3">Location</th>
                <th className="text-left px-4 py-3">Revenue</th>
                <th className="text-left px-4 py-3">Orders</th>
                <th className="text-left px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    Share
                    <EyeTooltip text="Share is this location's percentage contribution to total revenue in the selected window." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rankingRows.map((row) => (
                <tr
                  key={row.location_id}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/multilocation/locations/${row.location_id}`)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{row.location_name}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCurrency(row.revenue)}</td>
                  <td className="px-4 py-3 text-slate-700">{row.orders}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-900 rounded-full" style={{ width: `${Math.max(5, row.revenue_share_pct)}%` }} />
                      </div>
                      <span className="text-slate-600 text-xs">{formatPercent(row.revenue_share_pct)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
