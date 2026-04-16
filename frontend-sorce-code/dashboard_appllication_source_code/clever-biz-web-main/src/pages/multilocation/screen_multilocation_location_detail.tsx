import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, ExternalLink, ImagePlus, Trash2, Upload, X } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import {
  buildDashboardSummary,
  compressImageFile,
  getDefaultDateRange,
  getLocationById,
  getLocationStaff,
  normalizeDateRange,
  type LocationRecord,
  updateLocation,
} from "./store";
import { RoleBadge, StatusBadge, formatCurrency, formatPercent } from "./components";

type EditDraft = {
  name: string;
  address: string;
  phone: string;
  google_reviews_url: string;
  status: LocationRecord["status"];
  image_url: string;
};

function buildImprovementAreas(location: LocationRecord): string[] {
  const text = location.top_reviews.map((entry) => entry.text.toLowerCase()).join(" ");
  const points: string[] = [];

  if (text.includes("service") && (text.includes("slow") || text.includes("slower"))) {
    points.push("Service speed can be improved during high-demand windows.");
  }
  if (text.includes("parking") && (text.includes("difficult") || text.includes("peak"))) {
    points.push("Parking guidance for peak hours should be improved.");
  }
  if (text.includes("staff") && (text.includes("friend") || text.includes("friendly"))) {
    points.push("Keep staff friendliness standards high with regular coaching.");
  }
  if (text.includes("food") && (text.includes("quality") || text.includes("excellent"))) {
    points.push("Food quality is a strength, maintain consistency across shifts.");
  }

  if (!points.length) {
    points.push("No major recurring concern detected from latest Google reviews.");
  }

  return points.slice(0, 4);
}

export default function ScreenMultiLocationLocationDetail() {
  const navigate = useNavigate();
  const { locationId } = useParams();

  const [location, setLocation] = useState<LocationRecord | null>(() => (locationId ? getLocationById(locationId) || null : null));
  const [isEditOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [isImageLoading, setImageLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!locationId) return;
    const refresh = () => setLocation(getLocationById(locationId) || null);
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [locationId]);

  const defaultRange = getDefaultDateRange();
  const summary = useMemo(
    () => buildDashboardSummary(normalizeDateRange(defaultRange.startDate, defaultRange.endDate)),
    [defaultRange.endDate, defaultRange.startDate]
  );

  const aggregate = useMemo(
    () => summary.locations.find((entry) => entry.location_id === location?.id),
    [location?.id, summary.locations]
  );

  const ranked = summary.locations;
  const rank = useMemo(
    () => (location ? ranked.findIndex((entry) => entry.location_id === location.id) + 1 : 0),
    [location, ranked]
  );

  const topRevenue = ranked[0]?.revenue || 1;
  const vsTopPct = aggregate ? (aggregate.revenue / topRevenue) * 100 : 0;
  const locationStaff = useMemo(() => (location ? getLocationStaff(location.id) : []), [location]);
  const improvementAreas = useMemo(() => (location ? buildImprovementAreas(location) : []), [location]);

  const openEdit = () => {
    if (!location) return;
    setDraft({
      name: location.name,
      address: location.address,
      phone: location.phone,
      google_reviews_url: location.google_reviews_url || "",
      status: location.status,
      image_url: location.image_url || "",
    });
    setEditOpen(true);
  };

  const handleImageSelect = async (file: File) => {
    if (!draft) return;
    setImageLoading(true);
    try {
      const compressed = await compressImageFile(file, 1200, 0.82);
      setDraft({ ...draft, image_url: compressed });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to process image.");
    } finally {
      setImageLoading(false);
    }
  };

  const handleDrop: React.DragEventHandler<HTMLLabelElement> = async (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await handleImageSelect(file);
    }
  };

  const saveEdit = async () => {
    if (!location || !draft) return;
    setSaving(true);
    try {
      const updated = updateLocation(location.id, {
        name: draft.name.trim(),
        address: draft.address.trim(),
        phone: draft.phone.trim(),
        google_reviews_url: draft.google_reviews_url.trim() || undefined,
        status: draft.status,
        image_url: draft.image_url.trim() || undefined,
      });
      setLocation(updated);
      setEditOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update location.");
    } finally {
      setSaving(false);
    }
  };

  if (!location || !aggregate) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-600">
        <p className="mb-3">Location not found.</p>
        <button
          className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm"
          onClick={() => navigate("/multilocation/locations")}
        >
          <ArrowLeft size={14} />
          Back to Locations
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        onClick={() => navigate("/multilocation/locations")}
      >
        <ArrowLeft size={14} />
        Back to Locations
      </button>

      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="relative h-64 bg-slate-100">
          {location.image_url ? (
            <img src={location.image_url} alt={location.name} className="w-full h-full object-cover" />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400">No location image</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-slate-900/20 to-transparent" />

          <div className="absolute left-6 right-6 bottom-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold text-white">{location.name}</h2>
              <p className="text-white/85 text-sm mt-1">{location.address}</p>
            </div>
            <button
              onClick={openEdit}
              className="px-4 py-2 rounded-lg bg-white text-slate-900 text-sm font-medium hover:bg-slate-100"
            >
              Edit Location
            </button>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Revenue</p>
            <p className="text-xl font-semibold text-slate-900 mt-2">{formatCurrency(aggregate.revenue)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Orders</p>
            <p className="text-xl font-semibold text-slate-900 mt-2">{aggregate.orders}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Average Order Value</p>
            <p className="text-xl font-semibold text-slate-900 mt-2">{formatCurrency(aggregate.avg_order_value)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Status</p>
            <div className="mt-2">
              <StatusBadge status={location.status} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Team at {location.name}</h3>
            <span className="text-xs text-slate-500">{locationStaff.length} staff members</span>
          </div>
          <div className="space-y-2">
            {locationStaff.map((member) => (
              <div key={member.id} className="border border-slate-100 rounded-xl px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{member.full_name}</p>
                  <p className="text-xs text-slate-500 capitalize">{member.status.replace("_", " ")}</p>
                </div>
                <RoleBadge role={member.role} />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Compared to Group</h3>
          <div className="space-y-3 text-sm">
            <p className="text-slate-700">Rank: <span className="font-semibold text-slate-900">#{rank}</span></p>
            <p className="text-slate-700">
              Revenue Share: <span className="font-semibold text-slate-900">{formatPercent(aggregate.revenue_share_pct)}</span>
            </p>
            <div>
              <p className="text-xs text-slate-500 mb-1">Vs Top Location</p>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.max(5, Math.min(100, vsTopPct))}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-600">{formatPercent(vsTopPct)} of top location revenue</p>
            </div>
          </div>

          {location.google_reviews_url && (
            <a
              href={location.google_reviews_url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
            >
              Open Google Reviews
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Google Reviews</h3>
          <div className="space-y-2">
            {([5, 4, 3, 2, 1] as const).map((star) => {
              const total = Object.values(location.review_distribution).reduce((sum, value) => sum + value, 0) || 1;
              const count = location.review_distribution[star];
              const pct = (count / total) * 100;
              return (
                <div key={star} className="flex items-center gap-3 text-sm">
                  <span className="w-10 text-slate-600">{star}★</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-900 rounded-full" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                  <span className="w-12 text-right text-slate-500">{count}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-5 space-y-3">
            {location.top_reviews.slice(0, 3).map((review) => (
              <article key={review.id} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900">{review.author}</p>
                  <span className="text-xs text-slate-500">{review.rating}★</span>
                </div>
                <p className="text-sm text-slate-700 mt-1">{review.text}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Improvement Areas</h3>
          <ul className="list-disc pl-5 text-sm text-slate-700 space-y-2">
            {improvementAreas.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      </section>

      {isEditOpen && draft && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 overflow-y-auto">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Edit {location.name}</h3>
              <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <label
                className="block border border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer bg-slate-50"
                onDrop={handleDrop}
                onDragOver={(event) => event.preventDefault()}
              >
                {draft.image_url ? (
                  <div className="space-y-2">
                    <img src={draft.image_url} alt="Preview" className="h-32 w-full object-cover rounded-lg border border-slate-200" />
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-red-600"
                      onClick={(event) => {
                        event.preventDefault();
                        setDraft({ ...draft, image_url: "" });
                      }}
                    >
                      <Trash2 size={12} />
                      Remove image
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-slate-600 inline-flex items-center gap-2">
                    <ImagePlus size={16} />
                    Drag image or click to upload
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) await handleImageSelect(file);
                  }}
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm text-slate-600">
                  Name
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Phone
                  <input
                    value={draft.phone}
                    onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-600 md:col-span-2">
                  Address
                  <input
                    value={draft.address}
                    onChange={(event) => setDraft({ ...draft, address: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Google Reviews URL
                  <input
                    value={draft.google_reviews_url}
                    onChange={(event) => setDraft({ ...draft, google_reviews_url: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    placeholder="https://..."
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Status
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value as LocationRecord["status"] })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <option value="active">Active</option>
                    <option value="needs_attention">Needs Attention</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>

              <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                <Camera size={12} />
                Images are compressed client-side to max 1200px at JPEG 82% quality.
              </p>
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm inline-flex items-center gap-2"
                disabled={isSaving || isImageLoading}
              >
                <Upload size={14} />
                {isSaving ? "Saving..." : isImageLoading ? "Compressing..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
