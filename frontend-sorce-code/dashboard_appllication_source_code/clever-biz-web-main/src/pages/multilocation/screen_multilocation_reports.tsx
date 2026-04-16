import { useMemo, useState } from "react";
import {
  buildBreakdownCsv,
  buildDashboardSummary,
  buildSummaryCsv,
  buildWeeklyAnalysis,
  downloadCsv,
  getDefaultDateRange,
  normalizeDateRange,
} from "./store";
import {
  EyeTooltip,
  GroupedBars,
  HorizontalRevenueChart,
  formatCurrency,
  formatPercent,
} from "./components";

export default function ScreenMultiLocationReports() {
  const defaultRange = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);

  const range = useMemo(() => normalizeDateRange(startDate, endDate), [startDate, endDate]);
  const summary = useMemo(() => buildDashboardSummary(range), [range]);
  const insights = useMemo(() => buildWeeklyAnalysis(range), [range]);

  const handleExportSummary = () => {
    const csv = buildSummaryCsv(range);
    downloadCsv(`multilocation-summary-${range.startDate}-to-${range.endDate}.csv`, csv);
  };

  const handleExportBreakdown = () => {
    const csv = buildBreakdownCsv(range);
    downloadCsv(`multilocation-breakdown-${range.startDate}-to-${range.endDate}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex flex-wrap gap-3 items-end justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-600">
              <span className="block text-xs text-slate-500 mb-1">Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200"
              />
            </label>
            <label className="text-sm text-slate-600">
              <span className="block text-xs text-slate-500 mb-1">End Date</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200"
              />
            </label>
          </div>

          <button
            onClick={handleExportSummary}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
          >
            Export CSV
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Revenue by Location</h3>
          <HorizontalRevenueChart rows={summary.locations} />
        </div>
        <GroupedBars rows={summary.locations} />
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Detailed Breakdown</h3>
          <button
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
            onClick={handleExportBreakdown}
          >
            Download Breakdown
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-left">Revenue</th>
                <th className="px-4 py-3 text-left">Orders</th>
                <th className="px-4 py-3 text-left">AOV</th>
                <th className="px-4 py-3 text-left">Staff</th>
                <th className="px-4 py-3 text-left">
                  <span className="inline-flex items-center gap-2">
                    Share
                    <EyeTooltip text="Share indicates each location's percentage contribution to group revenue." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.locations.map((location) => (
                <tr key={location.location_id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{location.location_name}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCurrency(location.revenue)}</td>
                  <td className="px-4 py-3 text-slate-700">{location.orders}</td>
                  <td className="px-4 py-3 text-slate-700">{formatCurrency(location.avg_order_value)}</td>
                  <td className="px-4 py-3 text-slate-700">{location.staff_count}</td>
                  <td className="px-4 py-3 text-slate-700">{formatPercent(location.revenue_share_pct)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-900">Total</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(summary.total_revenue)}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{summary.total_orders}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {formatCurrency(summary.total_orders ? summary.total_revenue / summary.total_orders : 0)}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">{summary.total_staff}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">100.0%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-900 mb-3">Weekly Analysis</h3>
        <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
          {insights.map((insight) => (
            <li key={insight}>{insight}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
