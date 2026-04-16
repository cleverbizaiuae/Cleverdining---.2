import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Info, TrendingUp } from "lucide-react";
import { listActivities, listLocations } from "./store";

export default function ScreenMultiLocationActivity() {
  const [rows] = useState(() => listActivities());
  const locationMap = useMemo(() => new Map(listLocations().map((entry) => [entry.id, entry.name])), []);

  const counters = useMemo(() => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    return {
      total: rows.length,
      warning: rows.filter((entry) => entry.severity === "warning").length,
      critical: rows.filter((entry) => entry.severity === "critical").length,
      today: rows.filter((entry) => +new Date(entry.created_at) >= oneDayAgo).length,
    };
  }, [rows]);

  const iconForType = (type: string) => {
    if (type === "revenue_milestone") return TrendingUp;
    if (type === "low_performance") return AlertTriangle;
    if (type === "staff_change") return Activity;
    return Bell;
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-500">Total Events</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{counters.total}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-500">Warnings</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{counters.warning}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-500">Critical</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{counters.critical}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-500">Last 24 Hours</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{counters.today}</p>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Activity Feed</h3>
          <p className="text-sm text-slate-500 mt-1">Revenue milestones, staff updates, and low-performance alerts.</p>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.map((entry) => {
            const Icon = iconForType(entry.type);
            const place = entry.location_id ? locationMap.get(entry.location_id) : "System";
            return (
              <article key={entry.id} className="px-5 py-4 flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 text-slate-400 inline-flex items-center justify-center mt-0.5">
                  <Icon size={16} />
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900 truncate">{entry.message}</p>
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString("en-GB")}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span>{place || "Unknown"}</span>
                    <span>•</span>
                    <span className="capitalize">{entry.severity}</span>
                  </div>
                </div>
              </article>
            );
          })}

          {rows.length === 0 && (
            <div className="px-5 py-8 text-center text-slate-500 text-sm inline-flex items-center gap-2 justify-center w-full">
              <Info size={14} />
              No activity events yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
