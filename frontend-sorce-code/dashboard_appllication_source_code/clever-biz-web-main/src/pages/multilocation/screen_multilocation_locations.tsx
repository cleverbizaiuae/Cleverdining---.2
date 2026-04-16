import { useMemo, useState } from "react";
import { ExternalLink, MapPin, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { buildDashboardSummary, getDefaultDateRange, listLocations, normalizeDateRange } from "./store";
import { StatusBadge, formatCurrency } from "./components";

export default function ScreenMultiLocationLocations() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const range = getDefaultDateRange();
  const summary = useMemo(() => buildDashboardSummary(normalizeDateRange(range.startDate, range.endDate)), [range.endDate, range.startDate]);
  const locations = useMemo(() => {
    const map = new Map(summary.locations.map((item) => [item.location_id, item]));
    return listLocations()
      .map((location) => ({
        ...location,
        aggregate: map.get(location.id),
      }))
      .filter((location) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return location.name.toLowerCase().includes(q) || location.address.toLowerCase().includes(q);
      });
  }, [query, summary.locations]);

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search locations by name or address"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {locations.map((location) => (
          <article
            key={location.id}
            className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 transition-colors cursor-pointer"
            onClick={() => navigate(`/multilocation/locations/${location.id}`)}
          >
            <div className="h-44 w-full bg-slate-100">
              {location.image_url ? (
                <img src={location.image_url} alt={location.name} className="w-full h-full object-cover" />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">No image</div>
              )}
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900 truncate">{location.name}</h3>
                <StatusBadge status={location.status} />
              </div>

              <p className="text-sm text-slate-600 inline-flex items-center gap-1.5">
                <MapPin size={14} className="text-slate-400" />
                {location.address}
              </p>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Revenue</p>
                  <p className="font-semibold text-slate-900">{formatCurrency(location.aggregate?.revenue || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Orders</p>
                  <p className="font-semibold text-slate-900">{location.aggregate?.orders || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">AOV</p>
                  <p className="font-semibold text-slate-900">{formatCurrency(location.aggregate?.avg_order_value || 0)}</p>
                </div>
              </div>

              {location.google_reviews_url && (
                <a
                  href={location.google_reviews_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
                >
                  Google Reviews
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
