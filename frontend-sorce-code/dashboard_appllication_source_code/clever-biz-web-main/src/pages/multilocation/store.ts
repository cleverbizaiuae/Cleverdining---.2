export type MultiLocationStatus = "active" | "needs_attention" | "inactive";

export type MultiLocationRole = "manager" | "chef" | "staff" | "cashier";

export type ReviewEntry = {
  id: string;
  author: string;
  rating: number;
  text: string;
  created_at: string;
};

export type LocationRecord = {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  status: MultiLocationStatus;
  google_reviews_url?: string;
  image_url?: string;
  review_distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  top_reviews: ReviewEntry[];
};

export type DailyMetric = {
  id: string;
  location_id: string;
  date: string; // YYYY-MM-DD
  revenue: number;
  orders: number;
};

export type StaffMemberRecord = {
  id: string;
  full_name: string;
  role: MultiLocationRole;
  location_id: string;
  status: "active" | "on_leave";
};

export type ActivityType = "revenue_milestone" | "staff_change" | "low_performance" | "system";

export type ActivityLogRecord = {
  id: string;
  type: ActivityType;
  severity: "info" | "warning" | "critical";
  location_id?: string;
  message: string;
  created_at: string;
};

export type BrandingSettings = {
  brandingEnabled: boolean;
  restaurantName: string;
  logoDataUrl: string;
  coverImageDataUrl: string;
  updatedAt: string;
};

export type MultiLocationStore = {
  version: number;
  seeded_at: string;
  locations: LocationRecord[];
  metrics: DailyMetric[];
  staff: StaffMemberRecord[];
  activities: ActivityLogRecord[];
  branding: BrandingSettings;
};

export type DateRange = {
  startDate: string;
  endDate: string;
};

export type LocationAggregate = {
  location_id: string;
  location_name: string;
  revenue: number;
  orders: number;
  avg_order_value: number;
  staff_count: number;
  revenue_share_pct: number;
  status: MultiLocationStatus;
};

export type DashboardSummary = {
  total_revenue: number;
  total_orders: number;
  active_locations: number;
  total_staff: number;
  locations: LocationAggregate[];
  best_performing?: LocationAggregate;
  needs_attention?: LocationAggregate;
};

const STORAGE_KEY = "cleverbiz_multilocation_store_v1";
const BRANDING_KEY = "cleverbiz_branding_v1";

const DAY_MS = 24 * 60 * 60 * 1000;

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

function toIsoDate(value: Date): string {
  const y = value.getFullYear();
  const m = `${value.getMonth() + 1}`.padStart(2, "0");
  const d = `${value.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map((entry) => Number(entry));
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function seededRandom(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function statusLabel(status: MultiLocationStatus): string {
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  return "Needs Attention";
}

const DEFAULT_LOCATIONS: Array<Omit<LocationRecord, "review_distribution" | "top_reviews"> & { tier: number }> = [
  {
    id: "loc_dubai_palm",
    name: "Dubai Palm",
    slug: "dubai-palm",
    address: "Palm Jumeirah, Dubai",
    phone: "+971 4 321 9012",
    status: "active",
    google_reviews_url: "https://maps.google.com/?q=Dubai+Palm+Restaurant",
    image_url:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80",
    tier: 1.18,
  },
  {
    id: "loc_dubai_mall",
    name: "Dubai Mall",
    slug: "dubai-mall",
    address: "Dubai Mall, Downtown Dubai",
    phone: "+971 4 221 4301",
    status: "active",
    google_reviews_url: "https://maps.google.com/?q=Dubai+Mall+Restaurant",
    image_url:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    tier: 1.25,
  },
  {
    id: "loc_downtown",
    name: "Downtown",
    slug: "downtown",
    address: "Sheikh Mohammed Bin Rashid Blvd, Dubai",
    phone: "+971 4 501 2202",
    status: "active",
    google_reviews_url: "https://maps.google.com/?q=Downtown+Dubai+Restaurant",
    image_url:
      "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80",
    tier: 1.07,
  },
  {
    id: "loc_marina",
    name: "Marina",
    slug: "marina",
    address: "Marina Walk, Dubai",
    phone: "+971 4 663 0021",
    status: "needs_attention",
    google_reviews_url: "https://maps.google.com/?q=Dubai+Marina+Restaurant",
    image_url:
      "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80",
    tier: 0.95,
  },
  {
    id: "loc_abu_dhabi",
    name: "Abu Dhabi",
    slug: "abu-dhabi",
    address: "Corniche Road, Abu Dhabi",
    phone: "+971 2 611 9811",
    status: "active",
    google_reviews_url: "https://maps.google.com/?q=Abu+Dhabi+Restaurant",
    image_url:
      "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80",
    tier: 1.12,
  },
];

function buildReviewDistribution(seed: string): Record<1 | 2 | 3 | 4 | 5, number> {
  const five = 220 + Math.round(seededRandom(`${seed}:5`) * 120);
  const four = 110 + Math.round(seededRandom(`${seed}:4`) * 70);
  const three = 40 + Math.round(seededRandom(`${seed}:3`) * 25);
  const two = 12 + Math.round(seededRandom(`${seed}:2`) * 15);
  const one = 8 + Math.round(seededRandom(`${seed}:1`) * 9);
  return { 1: one, 2: two, 3: three, 4: four, 5: five };
}

function buildTopReviews(locationName: string, seed: string): ReviewEntry[] {
  return [
    {
      id: uid("review"),
      author: "Ayesha R.",
      rating: 5,
      text: `${locationName} has excellent food quality and quick service.`,
      created_at: new Date(Date.now() - Math.floor(seededRandom(`${seed}:r1`) * 14) * DAY_MS).toISOString(),
    },
    {
      id: uid("review"),
      author: "Daniel M.",
      rating: 4,
      text: "Great ambience and staff friendliness. Parking can be difficult during peak hours.",
      created_at: new Date(Date.now() - (5 + Math.floor(seededRandom(`${seed}:r2`) * 18)) * DAY_MS).toISOString(),
    },
    {
      id: uid("review"),
      author: "Lina A.",
      rating: 4,
      text: "Loved the menu variety. Service speed was slower on weekends.",
      created_at: new Date(Date.now() - (8 + Math.floor(seededRandom(`${seed}:r3`) * 25)) * DAY_MS).toISOString(),
    },
  ];
}

function seedMetrics(locations: Array<{ id: string; tier: number }>): DailyMetric[] {
  const today = new Date();
  const start = new Date(today.getTime() - 59 * DAY_MS);
  const metrics: DailyMetric[] = [];

  for (let dayIndex = 0; dayIndex < 60; dayIndex += 1) {
    const date = new Date(start.getTime() + dayIndex * DAY_MS);
    const dateIso = toIsoDate(date);
    const day = date.getDay();
    const weekendBoost = day === 5 || day === 6 ? 1.35 : 1;
    const growth = 1 + dayIndex * 0.0028;

    locations.forEach((location, locationIndex) => {
      const baseRevenue = 7600 * location.tier;
      const noise = 0.84 + seededRandom(`${location.id}:${dateIso}:noise`) * 0.34;
      const seasonal = 1 + (Math.sin((dayIndex + locationIndex) / 7) * 0.04);
      const revenue = Math.round(baseRevenue * weekendBoost * growth * noise * seasonal);

      const baseOrders = 96 * location.tier;
      const orderNoise = 0.86 + seededRandom(`${location.id}:${dateIso}:orders`) * 0.32;
      const orders = Math.max(18, Math.round(baseOrders * weekendBoost * growth * orderNoise * 0.65));

      metrics.push({
        id: uid("metric"),
        location_id: location.id,
        date: dateIso,
        revenue,
        orders,
      });
    });
  }
  return metrics;
}

function seedStaff(locations: LocationRecord[]): StaffMemberRecord[] {
  const rolePool: MultiLocationRole[] = ["manager", "chef", "staff", "cashier"];
  const names = [
    "Priya Kapoor",
    "Omar Rahman",
    "Hannah Smith",
    "Faisal Khan",
    "Noah Clarke",
    "Sara Abdullah",
    "Leah Wilson",
    "Ravi Menon",
    "Mariam Ali",
    "George Patel",
    "Aarav Singh",
    "Fatima Noor",
    "Amir Hussain",
    "Sophie Lewis",
    "Kabir Mehta",
    "Emma Reed",
    "Liam Turner",
    "Nora Qureshi",
  ];

  const staff: StaffMemberRecord[] = [];
  let pointer = 0;

  locations.forEach((location, idx) => {
    const count = 6 + (idx % 3);
    for (let i = 0; i < count; i += 1) {
      const role = rolePool[(i + idx) % rolePool.length];
      staff.push({
        id: uid("staff"),
        full_name: names[pointer % names.length],
        role,
        location_id: location.id,
        status: seededRandom(`${location.id}:staff:${i}`) > 0.88 ? "on_leave" : "active",
      });
      pointer += 1;
    }
  });

  return staff;
}

function seedActivities(locations: LocationRecord[], metrics: DailyMetric[]): ActivityLogRecord[] {
  const now = Date.now();
  const recent: ActivityLogRecord[] = [];

  locations.forEach((location) => {
    const locationMetrics = metrics.filter((entry) => entry.location_id === location.id);
    const latestWeek = locationMetrics.slice(-7);
    const weeklyRevenue = latestWeek.reduce((sum, entry) => sum + entry.revenue, 0);

    if (weeklyRevenue > 70000) {
      recent.push({
        id: uid("act"),
        type: "revenue_milestone",
        severity: "info",
        location_id: location.id,
        message: `${location.name} crossed AED 70K revenue this week.`,
        created_at: new Date(now - Math.floor(seededRandom(`${location.id}:milestone`) * 20) * 60 * 60 * 1000).toISOString(),
      });
    }

    if (location.status === "needs_attention") {
      recent.push({
        id: uid("act"),
        type: "low_performance",
        severity: "warning",
        location_id: location.id,
        message: `${location.name} is below group average order volume for 2 consecutive weeks.`,
        created_at: new Date(now - (4 + Math.floor(seededRandom(`${location.id}:warn`) * 24)) * 60 * 60 * 1000).toISOString(),
      });
    }
  });

  recent.push({
    id: uid("act"),
    type: "system",
    severity: "info",
    message: "Group analytics synced for all locations.",
    created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  });

  recent.push({
    id: uid("act"),
    type: "staff_change",
    severity: "info",
    location_id: locations[1]?.id,
    message: "New chef assigned to Dubai Mall evening shift.",
    created_at: new Date(now - 7 * 60 * 60 * 1000).toISOString(),
  });

  return recent.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

function seedStore(): MultiLocationStore {
  const locations: LocationRecord[] = DEFAULT_LOCATIONS.map((location) => ({
    id: location.id,
    name: location.name,
    slug: location.slug,
    address: location.address,
    phone: location.phone,
    status: location.status,
    google_reviews_url: location.google_reviews_url,
    image_url: location.image_url,
    review_distribution: buildReviewDistribution(location.id),
    top_reviews: buildTopReviews(location.name, location.id),
  }));

  const metrics = seedMetrics(DEFAULT_LOCATIONS.map((location) => ({ id: location.id, tier: location.tier })));
  const staff = seedStaff(locations);
  const activities = seedActivities(locations, metrics);

  return {
    version: 1,
    seeded_at: new Date().toISOString(),
    locations,
    metrics,
    staff,
    activities,
    branding: {
      brandingEnabled: false,
      restaurantName: "",
      logoDataUrl: "",
      coverImageDataUrl: "",
      updatedAt: new Date().toISOString(),
    },
  };
}

function readStore(): MultiLocationStore {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedStore();
    writeStore(seeded);
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw) as MultiLocationStore;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.locations)) {
      const seeded = seedStore();
      writeStore(seeded);
      return seeded;
    }
    return parsed;
  } catch {
    const seeded = seedStore();
    writeStore(seeded);
    return seeded;
  }
}

function writeStore(store: MultiLocationStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getMultiLocationStore(): MultiLocationStore {
  return readStore();
}

export function getDefaultDateRange(): DateRange {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * DAY_MS);
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  };
}

function inRange(dateIso: string, range: DateRange): boolean {
  return dateIso >= range.startDate && dateIso <= range.endDate;
}

export function getFilteredMetrics(range: DateRange): DailyMetric[] {
  const store = readStore();
  return store.metrics.filter((entry) => inRange(entry.date, range));
}

export function buildDashboardSummary(range: DateRange): DashboardSummary {
  const store = readStore();
  const metrics = store.metrics.filter((entry) => inRange(entry.date, range));
  const byLocation = new Map<string, { revenue: number; orders: number }>();

  metrics.forEach((entry) => {
    const prev = byLocation.get(entry.location_id) || { revenue: 0, orders: 0 };
    prev.revenue += entry.revenue;
    prev.orders += entry.orders;
    byLocation.set(entry.location_id, prev);
  });

  const totalRevenue = Array.from(byLocation.values()).reduce((sum, row) => sum + row.revenue, 0);
  const locations: LocationAggregate[] = store.locations.map((location) => {
    const agg = byLocation.get(location.id) || { revenue: 0, orders: 0 };
    const staffCount = store.staff.filter((member) => member.location_id === location.id).length;
    const avgOrderValue = agg.orders > 0 ? agg.revenue / agg.orders : 0;
    const share = totalRevenue > 0 ? (agg.revenue / totalRevenue) * 100 : 0;

    return {
      location_id: location.id,
      location_name: location.name,
      revenue: agg.revenue,
      orders: agg.orders,
      avg_order_value: avgOrderValue,
      staff_count: staffCount,
      revenue_share_pct: share,
      status: location.status,
    };
  });

  const ranked = [...locations].sort((a, b) => b.revenue - a.revenue);
  const best = ranked[0];
  const attention = [...ranked].sort((a, b) => a.revenue - b.revenue)[0];

  return {
    total_revenue: totalRevenue,
    total_orders: ranked.reduce((sum, row) => sum + row.orders, 0),
    active_locations: store.locations.filter((location) => location.status === "active").length,
    total_staff: store.staff.length,
    locations: ranked,
    best_performing: best,
    needs_attention: attention,
  };
}

export function getLocationById(locationId: string): LocationRecord | undefined {
  return readStore().locations.find((location) => location.id === locationId);
}

export function getLocationDailyMetrics(locationId: string, range: DateRange): DailyMetric[] {
  return readStore()
    .metrics
    .filter((entry) => entry.location_id === locationId && inRange(entry.date, range))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function getLocationStaff(locationId: string): StaffMemberRecord[] {
  return readStore().staff.filter((member) => member.location_id === locationId);
}

export function listLocations(): LocationRecord[] {
  return readStore().locations;
}

export function updateLocation(locationId: string, patch: Partial<LocationRecord>): LocationRecord {
  const store = readStore();
  const index = store.locations.findIndex((entry) => entry.id === locationId);
  if (index < 0) {
    throw new Error("Location not found");
  }
  const current = store.locations[index];
  const updated: LocationRecord = {
    ...current,
    ...patch,
    review_distribution: patch.review_distribution || current.review_distribution,
    top_reviews: patch.top_reviews || current.top_reviews,
  };
  store.locations[index] = updated;

  store.activities.unshift({
    id: uid("act"),
    type: "system",
    severity: "info",
    location_id: locationId,
    message: `${updated.name} details were updated.`,
    created_at: new Date().toISOString(),
  });

  writeStore(store);
  return updated;
}

export function listStaff(): StaffMemberRecord[] {
  return readStore().staff;
}

export function addStaff(payload: Omit<StaffMemberRecord, "id">): StaffMemberRecord {
  const store = readStore();
  const created: StaffMemberRecord = {
    id: uid("staff"),
    ...payload,
  };
  store.staff.unshift(created);

  const location = store.locations.find((entry) => entry.id === payload.location_id);
  store.activities.unshift({
    id: uid("act"),
    type: "staff_change",
    severity: "info",
    location_id: payload.location_id,
    message: `${payload.full_name} (${payload.role}) added to ${location?.name || "location"}.`,
    created_at: new Date().toISOString(),
  });

  writeStore(store);
  return created;
}

export function updateStaff(staffId: string, patch: Partial<StaffMemberRecord>): StaffMemberRecord {
  const store = readStore();
  const index = store.staff.findIndex((entry) => entry.id === staffId);
  if (index < 0) {
    throw new Error("Staff member not found");
  }

  const current = store.staff[index];
  const updated = { ...current, ...patch };
  store.staff[index] = updated;

  store.activities.unshift({
    id: uid("act"),
    type: "staff_change",
    severity: "info",
    location_id: updated.location_id,
    message: `${updated.full_name} profile updated (${updated.role}, ${updated.status}).`,
    created_at: new Date().toISOString(),
  });

  writeStore(store);
  return updated;
}

export function deleteStaff(staffId: string): void {
  const store = readStore();
  const staff = store.staff.find((entry) => entry.id === staffId);
  if (!staff) return;

  store.staff = store.staff.filter((entry) => entry.id !== staffId);
  const location = store.locations.find((entry) => entry.id === staff.location_id);
  store.activities.unshift({
    id: uid("act"),
    type: "staff_change",
    severity: "warning",
    location_id: staff.location_id,
    message: `${staff.full_name} removed from ${location?.name || "location"}.`,
    created_at: new Date().toISOString(),
  });
  writeStore(store);
}

export function listActivities(): ActivityLogRecord[] {
  return readStore().activities.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildWeeklyAnalysis(range: DateRange): string[] {
  const summary = buildDashboardSummary(range);
  const ranked = summary.locations;
  if (!ranked.length) return ["No data available for the selected date range."];

  const top = ranked[0];
  const trailing = ranked[ranked.length - 1];
  const aovs = ranked.map((entry) => entry.avg_order_value);
  const avgAov = average(aovs);

  const aboveAvg = ranked.filter((entry) => entry.avg_order_value >= avgAov).map((entry) => entry.location_name);
  const belowAvg = ranked.filter((entry) => entry.avg_order_value < avgAov).map((entry) => entry.location_name);
  const lowOrders = ranked.filter((entry) => entry.orders < average(ranked.map((entry2) => entry2.orders)) * 0.8);

  const bullets: string[] = [];
  bullets.push(`Best performer ${top.location_name} holds ${top.revenue_share_pct.toFixed(1)}% of group revenue.`);
  bullets.push(
    `${trailing.location_name} trails the top location by AED ${(top.revenue - trailing.revenue).toLocaleString("en-US")}.`
  );
  bullets.push(
    aboveAvg.length
      ? `Above-average AOV locations: ${aboveAvg.join(", ")}.`
      : "No location is currently above the group AOV average."
  );
  bullets.push(
    belowAvg.length
      ? `Below-average AOV locations: ${belowAvg.join(", ")}.`
      : "All locations are at or above the group AOV average."
  );
  bullets.push(
    lowOrders.length
      ? `Low order volume watchlist: ${lowOrders.map((entry) => entry.location_name).join(", ")}.`
      : "No locations are under low-order thresholds this period."
  );
  bullets.push(`Group-wide AOV for selected range is AED ${avgAov.toFixed(2)}.`);

  return bullets;
}

export function buildSummaryCsv(range: DateRange): string {
  const summary = buildDashboardSummary(range);
  const headers = [
    "Location",
    "Revenue (AED)",
    "Orders",
    "Average Order Value",
    "Revenue Share %",
    "Staff Count",
    "Status",
  ];

  const rows = summary.locations.map((entry) => [
    entry.location_name,
    entry.revenue.toFixed(2),
    `${entry.orders}`,
    entry.avg_order_value.toFixed(2),
    entry.revenue_share_pct.toFixed(2),
    `${entry.staff_count}`,
    statusLabel(entry.status),
  ]);

  rows.unshift([
    "TOTAL",
    summary.total_revenue.toFixed(2),
    `${summary.total_orders}`,
    summary.total_orders > 0 ? (summary.total_revenue / summary.total_orders).toFixed(2) : "0.00",
    "100.00",
    `${summary.total_staff}`,
    "-",
  ]);

  return [headers, ...rows].map((line) => line.join(",")).join("\n");
}

export function buildBreakdownCsv(range: DateRange): string {
  const summary = buildDashboardSummary(range);
  const topRevenue = summary.locations[0]?.revenue || 1;

  const headers = [
    "Location",
    "Revenue (AED)",
    "Orders",
    "Average Order Value",
    "Revenue Share %",
    "Vs Top Location %",
    "Staff Count",
    "Status",
  ];

  const rows = summary.locations.map((entry) => [
    entry.location_name,
    entry.revenue.toFixed(2),
    `${entry.orders}`,
    entry.avg_order_value.toFixed(2),
    entry.revenue_share_pct.toFixed(2),
    ((entry.revenue / topRevenue) * 100).toFixed(2),
    `${entry.staff_count}`,
    statusLabel(entry.status),
  ]);

  return [headers, ...rows].map((line) => line.join(",")).join("\n");
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getBrandingSettings(): BrandingSettings {
  const store = readStore();
  const persisted = localStorage.getItem(BRANDING_KEY);
  if (persisted) {
    try {
      return { ...store.branding, ...(JSON.parse(persisted) as BrandingSettings) };
    } catch {
      return store.branding;
    }
  }
  return store.branding;
}

export function saveBrandingSettings(payload: Partial<BrandingSettings>): BrandingSettings {
  const store = readStore();
  const next: BrandingSettings = {
    ...store.branding,
    ...payload,
    brandingEnabled: true, // auto-enable on save
    updatedAt: new Date().toISOString(),
  };

  store.branding = next;
  writeStore(store);
  localStorage.setItem(BRANDING_KEY, JSON.stringify(next));

  // expose to customer app lookup as lightweight bridge
  localStorage.setItem("customer_branding", JSON.stringify(next));
  window.dispatchEvent(new Event("branding-updated"));

  return next;
}

export async function compressImageFile(
  file: File,
  maxDim = 1200,
  quality = 0.82,
  options: { preserveTransparency?: boolean } = {},
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for compression."));
    image.src = dataUrl;
  });

  const ratio = img.width > img.height ? maxDim / img.width : maxDim / img.height;
  const targetWidth = ratio < 1 ? Math.round(img.width * ratio) : img.width;
  const targetHeight = ratio < 1 ? Math.round(img.height * ratio) : img.height;

  const canvas = document.createElement("canvas");
  canvas.width = clamp(1, targetWidth, maxDim);
  canvas.height = clamp(1, targetHeight, maxDim);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to initialize image compression canvas.");
  }

  const shouldPreserveTransparency =
    options.preserveTransparency ||
    file.type === "image/png" ||
    file.type === "image/webp";

  if (!shouldPreserveTransparency) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (shouldPreserveTransparency) {
    return canvas.toDataURL("image/png");
  }

  return canvas.toDataURL("image/jpeg", quality);
}

export function normalizeDateRange(startDate: string, endDate: string): DateRange {
  if (!startDate || !endDate) {
    return getDefaultDateRange();
  }

  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (end < start) {
    return { startDate: toIsoDate(end), endDate: toIsoDate(start) };
  }

  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}
