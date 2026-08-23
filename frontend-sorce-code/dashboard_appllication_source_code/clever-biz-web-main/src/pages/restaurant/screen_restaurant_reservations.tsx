/* eslint-disable @typescript-eslint/no-explicit-any */
import { useOwner } from "@/context/ownerContext";
import { getActiveRestaurantLocale, getActiveRestaurantTimezone } from "@/lib/utils";
import axiosInstance from "@/lib/axios";
import { useRole } from "@/hooks/useRole";
import { Fragment } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  History,
  Lock,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Table2,
  Timer,
  Trash2,
  Unlock,
  UserCheck,
  Users,
  UserX,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

type TabKey = "reservations" | "tables" | "history";
type ViewMode = "list" | "timeline" | "board";
type StatusFilter = "all" | "pending" | "confirmed" | "seated" | "finished" | "cancelled" | "no_show";

type ReservationStatusKey =
  | "draft"
  | "pending"
  | "confirmed"
  | "overdue"
  | "seated"
  | "extended"
  | "finished"
  | "cancelled"
  | "no_show";

type SourceKey = "whatsapp" | "walk_in" | "dashboard" | "phone" | "web" | "google";
type CreateMode = "reservation" | "walk_in";

type CreateReservationForm = {
  customerName: string;
  phone: string;
  email: string;
  tableId: string;
  date: string;
  time: string;
  guestCount: string;
  durationMinutes: string;
  customRequest: string;
};

type Dialog360Settings = {
  provider: string;
  enabled: boolean;
  chatbotEnabled: boolean;
  configured: boolean;
  wabaId: string;
  phoneNumberId: string;
  displayNumber: string;
  channelId: string;
  callbackUrl: string;
  verifyToken: string;
  specialPhrases?: {
    reminder24hTemplate?: string;
    reminder2hTemplate?: string;
    followUpTemplate?: string;
    templateLanguage?: string;
    [key: string]: unknown;
  };
};

type ReservationSettings = {
  reservation_duration_minutes: number;
  reservation_slot_start: string;
  reservation_slot_end: string;
};

const BRAND = "#0055FE";
const WHATSAPP = "#25D366";
const HISTORY_PAGE_SIZE = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatApiError = (data: any, fallback: string) => {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.conflict) return data.error || "Table has a conflicting reservation";
  if (typeof data.error === "string") return data.error;
  if (typeof data.detail === "string") return data.detail;
  const firstField = Object.entries(data).find(([, value]) => Array.isArray(value) || typeof value === "string");
  if (firstField) {
    const [field, value] = firstField;
    const message = Array.isArray(value) ? value[0] : value;
    return `${field.replace(/_/g, " ")}: ${message}`;
  }
  return fallback;
};

const statusConfig: Record<ReservationStatusKey, { label: string; bg: string; text: string; dot: string; border: string }> = {
  draft: { label: "Needs Approval", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500", border: "border-l-violet-400" },
  pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", border: "border-l-amber-400" },
  confirmed: { label: "Confirmed", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", border: "border-l-blue-400" },
  overdue: { label: "Overdue", bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500", border: "border-l-orange-400" },
  seated: { label: "Seated", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", border: "border-l-emerald-400" },
  extended: { label: "Extended", bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500", border: "border-l-purple-400" },
  finished: { label: "Completed", bg: "bg-slate-100", text: "text-slate-500", dot: "bg-slate-400", border: "border-l-slate-300" },
  cancelled: { label: "Cancelled", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", border: "border-l-red-400" },
  no_show: { label: "No-Show", bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-600", border: "border-l-rose-400" },
};

const sourceConfig: Record<SourceKey, { label: string; style: string; color: string }> = {
  whatsapp: { label: "WhatsApp", style: "bg-[#25D366] text-white", color: WHATSAPP },
  walk_in: { label: "Walk-in", style: "bg-sky-500 text-white", color: "#0EA5E9" },
  dashboard: { label: "Dashboard", style: "bg-indigo-500 text-white", color: "#6366F1" },
  phone: { label: "Phone", style: "bg-amber-500 text-white", color: "#F59E0B" },
  web: { label: "Web", style: "bg-slate-500 text-white", color: "#64748B" },
  google: { label: "Google", style: "bg-[#4285F4] text-white", color: "#4285F4" },
};

const tableStatusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  available: { label: "Available", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  occupied: { label: "Occupied", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  reserved: { label: "Reserved", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  unavailable: { label: "Unavailable", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  inactive: { label: "Inactive", bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" },
};

const backendStatusToUi = (status?: string): ReservationStatusKey => {
  const value = String(status || "hold").toLowerCase();
  if (["accept", "accepted", "confirmed"].includes(value)) return "confirmed";
  if (["cancel", "cancelled", "canceled"].includes(value)) return "cancelled";
  if (["no_show", "no-show", "noshow"].includes(value)) return "no_show";
  if (["seated"].includes(value)) return "seated";
  if (["extended"].includes(value)) return "extended";
  if (["finished", "completed", "complete"].includes(value)) return "finished";
  if (["draft"].includes(value)) return "draft";
  return "pending";
};

const filterToStatus = (status: ReservationStatusKey): StatusFilter => {
  if (status === "draft" || status === "overdue") return "pending";
  if (status === "extended") return "seated";
  return status as StatusFilter;
};

const normaliseDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getZonedInputParts = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
};

const timeZoneOffsetMs = (date: Date, timezone: string) => {
  const parts = getZonedInputParts(date, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
};

const buildRestaurantDateTime = (date: string, timeValue: string, timezone: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour || 0, minute || 0, 0);
  let offset = timeZoneOffsetMs(new Date(wallClockUtc), timezone);
  let instant = wallClockUtc - offset;
  const refinedOffset = timeZoneOffsetMs(new Date(instant), timezone);
  if (refinedOffset !== offset) {
    offset = refinedOffset;
    instant = wallClockUtc - offset;
  }
  return new Date(instant).toISOString();
};

const parseDateInput = (value: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const formatDate = (date: Date, locale: string, timezone: string) =>
  date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: timezone });

const formatShortDateTime = (value: string, locale: string, timezone: string) =>
  new Date(value).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: timezone });

const formatTime = (value: string, locale: string, timezone: string) =>
  new Date(value).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: timezone });

const relativeTime = (value: string) => {
  const target = new Date(value).getTime();
  const diff = target - Date.now();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  if (minutes < 1) return diff >= 0 ? "Now" : "Just now";
  if (minutes < 60) return diff >= 0 ? `In ${minutes}m` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return diff >= 0 ? `In ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return diff >= 0 ? `In ${days}d` : `${days}d ago`;
};

const initials = (name?: string) => String(name || "Guest").split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "G";

const StatusBadge = ({ status }: { status: ReservationStatusKey }) => {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${config.bg} ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

const SourceBadge = ({ source }: { source: SourceKey }) => {
  const config = sourceConfig[source];
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold ${config.style}`}>{config.label}</span>;
};

const TableStatusBadge = ({ status }: { status: string }) => {
  const config = tableStatusConfig[status] || tableStatusConfig.available;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${config.bg} ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

const KpiCard = ({ label, value, color }: { label: string; value: number | string; color: string }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center gap-3">
      <span className={`h-10 w-1 flex-shrink-0 rounded-full ${color}`} />
      <div>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        <p className="text-[11px] leading-tight text-slate-500">{label}</p>
      </div>
    </div>
  </div>
);

const ReservationSettingsCard = ({
  onLoaded,
}: {
  onLoaded: (settings: ReservationSettings) => void;
}) => {
  const [settings, setSettings] = useState<ReservationSettings>({
    reservation_duration_minutes: 90,
    reservation_slot_start: "18:00",
    reservation_slot_end: "22:00",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    axiosInstance
      .get("/owners/restaurant-settings/")
      .then((response) => {
        if (!mounted) return;
        const next = {
          reservation_duration_minutes: Number(response.data?.reservation_duration_minutes) || 90,
          reservation_slot_start: response.data?.reservation_slot_start || "18:00",
          reservation_slot_end: response.data?.reservation_slot_end || "22:00",
        };
        setSettings(next);
        onLoaded(next);
      })
      .catch(() => {
        if (mounted) toast.error("Could not load reservation settings");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [onLoaded]);

  const updateSetting = (key: keyof ReservationSettings, value: string) => {
    setSettings((previous) => ({
      ...previous,
      [key]: key === "reservation_duration_minutes" ? Number(value) : value,
    }));
  };

  const saveSettings = async () => {
    const duration = Number(settings.reservation_duration_minutes);
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
      toast.error("Dining duration must be between 15 and 480 minutes");
      return;
    }
    if (!settings.reservation_slot_start || !settings.reservation_slot_end) {
      toast.error("Choose both the first and last reservation time");
      return;
    }
    setSaving(true);
    try {
      const response = await axiosInstance.patch("/owners/restaurant-settings/", settings);
      const next = {
        reservation_duration_minutes: Number(response.data?.reservation_duration_minutes) || duration,
        reservation_slot_start: response.data?.reservation_slot_start || settings.reservation_slot_start,
        reservation_slot_end: response.data?.reservation_slot_end || settings.reservation_slot_end,
      };
      setSettings(next);
      onLoaded(next);
      toast.success("Reservation settings saved");
    } catch (error: any) {
      toast.error(formatApiError(error?.response?.data, "Could not save reservation settings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0055FE]">
            <Settings className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Reservation Settings</h2>
            <p className="mt-1 text-xs text-slate-500">
              The dining duration is the exact time a table remains occupied. New bookings use these live hours.
            </p>
          </div>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-4 lg:max-w-[700px]">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">Dining duration</span>
            <div className="relative">
              <input
                type="number"
                min={15}
                max={480}
                step={15}
                disabled={loading}
                value={settings.reservation_duration_minutes}
                onChange={(event) => updateSetting("reservation_duration_minutes", event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-12 text-sm outline-none focus:border-[#0055FE]"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">min</span>
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">First slot</span>
            <input type="time" disabled={loading} value={settings.reservation_slot_start} onChange={(event) => updateSetting("reservation_slot_start", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">Last slot</span>
            <input type="time" disabled={loading} value={settings.reservation_slot_end} onChange={(event) => updateSetting("reservation_slot_end", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" />
          </label>
          <button type="button" onClick={saveSettings} disabled={loading || saving} className="h-10 self-end rounded-lg bg-[#0055FE] px-4 text-sm font-semibold text-white hover:bg-[#0047D1] disabled:opacity-60">
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
};

const Dialog360StatusCard = ({
  settings,
  loading,
  onSaved,
}: {
  settings: Dialog360Settings | null;
  loading: boolean;
  onSaved: (settings: Dialog360Settings) => void;
}) => {
  const isConfigured = Boolean(settings?.configured);
  const isEnabled = Boolean(settings?.enabled);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    chatbotEnabled: false,
    wabaId: "",
    phoneNumberId: "",
    displayNumber: "",
    channelId: "",
    verifyToken: "",
    apiKey: "",
    reminder24hTemplate: "",
    reminder2hTemplate: "",
    followUpTemplate: "",
    templateLanguage: "en",
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      enabled: Boolean(settings?.enabled),
      chatbotEnabled: Boolean(settings?.chatbotEnabled),
      wabaId: settings?.wabaId || "",
      phoneNumberId: settings?.phoneNumberId || "",
      displayNumber: settings?.displayNumber || "",
      channelId: settings?.channelId || "",
      verifyToken: settings?.verifyToken || "",
      apiKey: "",
      reminder24hTemplate: String(settings?.specialPhrases?.reminder24hTemplate || ""),
      reminder2hTemplate: String(settings?.specialPhrases?.reminder2hTemplate || ""),
      followUpTemplate: String(settings?.specialPhrases?.followUpTemplate || ""),
      templateLanguage: String(settings?.specialPhrases?.templateLanguage || "en"),
    }));
  }, [settings]);

  const updateForm = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        provider: "360dialog",
        enabled: form.enabled,
        chatbotEnabled: form.chatbotEnabled,
        wabaId: form.wabaId.trim(),
        phoneNumberId: form.phoneNumberId.trim(),
        displayNumber: form.displayNumber.trim(),
        channelId: form.channelId.trim(),
        verifyToken: form.verifyToken.trim(),
        specialPhrases: {
          ...(settings?.specialPhrases || {}),
          reminder24hTemplate: form.reminder24hTemplate.trim(),
          reminder2hTemplate: form.reminder2hTemplate.trim(),
          followUpTemplate: form.followUpTemplate.trim(),
          templateLanguage: form.templateLanguage.trim() || "en",
        },
      };
      if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
      const response = await axiosInstance.patch("/owners/whatsapp/360dialog-settings/", payload);
      onSaved(response.data);
      setEditing(false);
      toast.success("WhatsApp settings saved");
    } catch (error: any) {
      toast.error(formatApiError(error?.response?.data, "Could not save WhatsApp settings"));
    } finally {
      setSaving(false);
    }
  };

  const copyWebhook = async () => {
    if (!settings?.callbackUrl) return;
    await navigator.clipboard?.writeText(settings.callbackUrl);
    toast.success("WhatsApp webhook URL copied");
  };

  return (
    <div className="mb-6 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <MessageCircle className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">WhatsApp Reservations</h2>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isConfigured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isConfigured ? "bg-emerald-500" : "bg-amber-500"}`} />
                {loading ? "Checking" : isConfigured ? "Connected" : "Setup required"}
              </span>
              {isEnabled && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                  Chatbot {settings?.chatbotEnabled ? "on" : "ready"}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Incoming WhatsApp bookings are mapped by WABA ID or phone-number ID, then shown here as WhatsApp reservations.
            </p>
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50"
            >
              {editing ? "Hide setup" : isConfigured ? "Edit setup" : "Complete setup"}
            </button>
          </div>
        </div>

        <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:min-w-[520px]">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-semibold uppercase tracking-wide text-slate-400">WABA ID</p>
            <p className="mt-1 truncate font-medium text-slate-800">{settings?.wabaId || "Not set"}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-semibold uppercase tracking-wide text-slate-400">Phone Number ID</p>
            <p className="mt-1 truncate font-medium text-slate-800">{settings?.phoneNumberId || "Not set"}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-semibold uppercase tracking-wide text-slate-400">Display Number</p>
            <p className="mt-1 truncate font-medium text-slate-800">{settings?.displayNumber || "Not set"}</p>
          </div>
          <button
            type="button"
            onClick={copyWebhook}
            disabled={!settings?.callbackUrl}
            className="rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <p className="font-semibold uppercase tracking-wide text-slate-400">Webhook URL</p>
            <p className="mt-1 truncate font-medium text-slate-800">{settings?.callbackUrl || "Unavailable"}</p>
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">WABA ID</span>
              <input value={form.wabaId} onChange={(event) => updateForm("wabaId", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Phone Number ID</span>
              <input value={form.phoneNumberId} onChange={(event) => updateForm("phoneNumberId", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Display Number</span>
              <input value={form.displayNumber} onChange={(event) => updateForm("displayNumber", event.target.value)} placeholder="+971..." className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">WhatsApp Channel ID</span>
              <input value={form.channelId} onChange={(event) => updateForm("channelId", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
            </label>
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-semibold text-slate-500">Webhook Verify Token</span>
              <input value={form.verifyToken} onChange={(event) => updateForm("verifyToken", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
            </label>
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-semibold text-slate-500">WhatsApp API Key</span>
              <input value={form.apiKey} onChange={(event) => updateForm("apiKey", event.target.value)} type="password" placeholder={settings?.configured ? "Leave blank to keep existing key" : "Paste API key"} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">24-hour reminder template</span>
              <input value={form.reminder24hTemplate} onChange={(event) => updateForm("reminder24hTemplate", event.target.value)} placeholder="reservation_reminder_24h" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">2-hour reminder template</span>
              <input value={form.reminder2hTemplate} onChange={(event) => updateForm("reminder2hTemplate", event.target.value)} placeholder="reservation_reminder_2h" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Post-visit template</span>
              <input value={form.followUpTemplate} onChange={(event) => updateForm("followUpTemplate", event.target.value)} placeholder="reservation_follow_up" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Template language</span>
              <input value={form.templateLanguage} onChange={(event) => updateForm("templateLanguage", event.target.value)} placeholder="en" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Use approved WhatsApp utility-template names so reminders are delivered after WhatsApp's 24-hour service window.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={form.enabled} onChange={(event) => updateForm("enabled", event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
                Enable WhatsApp
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={form.chatbotEnabled} onChange={(event) => updateForm("chatbotEnabled", event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
                Enable booking chatbot
              </label>
            </div>
            <button
              type="button"
              onClick={saveSettings}
              disabled={saving}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save WhatsApp Setup"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const GhostAction = ({ children, onClick, danger = false }: { children: React.ReactNode; onClick?: () => void; danger?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${
      danger ? "text-red-600 hover:bg-red-50" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    }`}
  >
    {children}
  </button>
);

const getReservationBase = (role?: string | null) => {
  const normalizedRole = String(role || "").toLowerCase();
  if (normalizedRole === "owner" || normalizedRole === "manager") return "/owners/reservations";
  if (normalizedRole === "chef") return "/api/chef/reservations";
  return "/api/staff/reservations";
};

const normalizeReservationRecords = (records: any[], devices: any[]) =>
  (records || []).map((reservation: any) => {
    const status = backendStatusToUi(reservation.status);
    const source: SourceKey = reservation.source || reservation.bookingSource || reservation.source_type || "dashboard";
    const tableId = Number(reservation.tableNo || reservation.device || 0);
    const table = (devices || []).find((device: any) => Number(device.id) === tableId) as any;
    return {
      ...reservation,
      customerName: reservation.customerName || reservation.customer_name || "Guest",
      guestNo: Number(reservation.guestNo ?? reservation.guestCount ?? reservation.guest_no ?? 0),
      cellNumber: reservation.cellNumber || reservation.phone || reservation.cell_number || "",
      reservationTime: reservation.reservationTime || reservation.reservation_time,
      endTime: reservation.endTime || reservation.end_time,
      customRequest: reservation.customRequest || reservation.custom_request || "",
      statusKey: status,
      sourceKey: sourceConfig[source] ? source : "dashboard",
      tableId,
      tableName:
        reservation.deviceName ||
        reservation.device_name ||
        reservation.tableName ||
        reservation.tableNoName ||
        table?.table_name ||
        table?.name ||
        `Table ${reservation.tableNo || "-"}`,
      area: table?.region || table?.area || "Primary",
      duration: reservation.duration || `${reservation.durationMinutes || reservation.duration_minutes || 90} min`,
      occasion: reservation.occasion || "-",
      seating: reservation.seating || "Standard",
      createdAt: reservation.createdAt || reservation.created_at || reservation.reservationTime,
      updatedAt: reservation.updatedAt || reservation.updated_at || reservation.reservationTime,
    };
  });

const makeDefaultCreateForm = (
  date: Date | null,
  mode: CreateMode,
  timezone: string,
  durationMinutes = 90,
): CreateReservationForm => {
  const nowParts = getZonedInputParts(new Date(), timezone);
  return {
    customerName: "",
    phone: "",
    email: "",
    tableId: "",
    date: mode === "walk_in" ? nowParts.date : date ? normaliseDateInput(date) : nowParts.date,
    time: nowParts.time,
    guestCount: "2",
    durationMinutes: String(durationMinutes),
    customRequest: "",
  };
};

const ScreenRestaurantReservations = () => {
  const locale = getActiveRestaurantLocale();
  const timezone = getActiveRestaurantTimezone();
  const { userRole } = useRole();
  const {
    reservations,
    reservationsCurrentPage,
    reservationsSearchQuery,
    reservationStatusReport,
    allDevices,
    fetchReservations,
    fetchReservationStatusReport,
    fetchAllDevices,
    fetchDeviceStats,
    updateDeviceStatus,
    setReservationsCurrentPage,
    setReservationsSearchQuery,
  } = useOwner();

  const [tab, setTab] = useState<TabKey>("reservations");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedReservation, setSelectedReservation] = useState<any | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode | null>(null);
  const [reservationSettings, setReservationSettings] = useState<ReservationSettings>({
    reservation_duration_minutes: 90,
    reservation_slot_start: "18:00",
    reservation_slot_end: "22:00",
  });
  const [createForm, setCreateForm] = useState<CreateReservationForm>(() =>
    makeDefaultCreateForm(new Date(), "reservation", timezone),
  );
  const [actionLoading, setActionLoading] = useState(false);
  const [areaFilter, setAreaFilter] = useState("All Areas");
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historySource, setHistorySource] = useState("all");
  const [historyStart, setHistoryStart] = useState("");
  const [historyEnd, setHistoryEnd] = useState("");
  const [historyReservations, setHistoryReservations] = useState<any[]>([]);
  const [dayReservations, setDayReservations] = useState<any[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [dialog360Settings, setDialog360Settings] = useState<Dialog360Settings | null>(null);
  const [dialog360Loading, setDialog360Loading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(reservationsSearchQuery), 350);
    return () => window.clearTimeout(timer);
  }, [reservationsSearchQuery]);

  useEffect(() => {
    const dateString = selectedDate ? normaliseDateInput(selectedDate) : undefined;
    fetchReservations(reservationsCurrentPage, debouncedSearchQuery, dateString);
    fetchReservationStatusReport();
  }, [reservationsCurrentPage, debouncedSearchQuery, selectedDate, fetchReservations, fetchReservationStatusReport]);

  useEffect(() => {
    if (tab !== "history") return;
    let active = true;

    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const collected: any[] = [];
        let page = 1;
        let hasNext = true;

        while (hasNext) {
          const response = await axiosInstance.get(`${getReservationBase(userRole)}/`, {
            params: { page, page_size: HISTORY_PAGE_SIZE },
          });
          const payload = response.data;
          const batch = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.results)
              ? payload.results
              : [];
          collected.push(...batch);
          hasNext = !Array.isArray(payload) && batch.length > 0 && Boolean(payload?.next);
          page += 1;
        }

        if (active) {
          const uniqueReservations = Array.from(
            new Map(
              collected.map((reservation: any, index: number) => [
                String(reservation.id ?? `${reservation.reservationTime ?? "reservation"}-${index}`),
                reservation,
              ]),
            ).values(),
          );
          setHistoryReservations(uniqueReservations);
        }
      } catch {
        if (active) setHistoryError("Unable to load reservation history.");
      } finally {
        if (active) setHistoryLoading(false);
      }
    };

    void loadHistory();
    return () => {
      active = false;
    };
  }, [historyRefreshKey, tab, userRole]);

  useEffect(() => {
    fetchAllDevices(1, "");
    fetchDeviceStats();
  }, [fetchAllDevices, fetchDeviceStats]);

  useEffect(() => {
    let mounted = true;
    setDialog360Loading(true);
    axiosInstance
      .get("/owners/whatsapp/360dialog-settings/")
      .then((response) => {
        if (mounted) setDialog360Settings(response.data);
      })
      .catch(() => {
        if (mounted) setDialog360Settings(null);
      })
      .finally(() => {
        if (mounted) setDialog360Loading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loadDayReservations = useCallback(async () => {
    if (!selectedDate || !userRole) {
      setDayReservations([]);
      return;
    }
    try {
      const response = await axiosInstance.get(`${getReservationBase(userRole)}/`, {
        params: {
          date: normaliseDateInput(selectedDate),
          page_size: 1000,
        },
      });
      const payload = response.data;
      setDayReservations(
        Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.results)
            ? payload.results
            : [],
      );
    } catch {
      setDayReservations(null);
    }
  }, [selectedDate, userRole]);

  const reservationRefreshSignature = useMemo(
    () => (reservations || []).map((reservation: any) => `${reservation.id}:${reservation.status}:${reservation.updatedAt || reservation.updated_at || ""}`).join("|"),
    [reservations],
  );

  useEffect(() => {
    void loadDayReservations();
  }, [loadDayReservations, reservationRefreshSignature]);

  const normalizedReservations = useMemo(
    () => normalizeReservationRecords(reservations || [], allDevices || []),
    [allDevices, reservations],
  );

  const normalizedDayReservations = useMemo(
    () => dayReservations === null
      ? normalizedReservations
      : normalizeReservationRecords(dayReservations, allDevices || []),
    [allDevices, dayReservations, normalizedReservations],
  );

  const normalizedHistoryReservations = useMemo(
    () => normalizeReservationRecords(historyReservations, allDevices || []),
    [allDevices, historyReservations],
  );

  const filteredReservations = useMemo(() => {
    return normalizedDayReservations.filter((reservation) => {
      if (statusFilter !== "all" && filterToStatus(reservation.statusKey) !== statusFilter) return false;
      const query = debouncedSearchQuery.trim().toLowerCase();
      if (query) {
        const haystack = `${reservation.id || ""} ${reservation.customerName || ""} ${reservation.cellNumber || ""} ${reservation.tableName || ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [debouncedSearchQuery, normalizedDayReservations, statusFilter]);

  const todaysReservations = normalizedDayReservations;
  const counts = useMemo(() => {
    const base = {
      all: normalizedDayReservations.length,
      pending: 0,
      confirmed: 0,
      seated: 0,
      finished: 0,
      cancelled: 0,
      no_show: 0,
      whatsapp: 0,
    };
    normalizedDayReservations.forEach((reservation) => {
      const status = filterToStatus(reservation.statusKey);
      if (status in base) base[status as keyof typeof base] += 1;
      if (reservation.sourceKey === "whatsapp") base.whatsapp += 1;
    });
    return base;
  }, [normalizedDayReservations]);

  const areas = useMemo(() => {
    const set = new Set<string>(["All Areas"]);
    (allDevices || []).forEach((device: any) => set.add(device.region || device.area || "Primary"));
    return Array.from(set);
  }, [allDevices]);

  const tableRows = useMemo(() => {
    return (allDevices || [])
      .filter((device: any) => areaFilter === "All Areas" || (device.region || device.area || "Primary") === areaFilter)
      .map((device: any) => {
        const deviceReservations = normalizedDayReservations
          .filter((reservation) => Number(reservation.tableId) === Number(device.id))
          .sort((a, b) => new Date(a.reservationTime).getTime() - new Date(b.reservationTime).getTime());
        const current = deviceReservations.find((reservation) => ["seated", "extended"].includes(reservation.statusKey));
        const next = deviceReservations.find((reservation) => new Date(reservation.reservationTime).getTime() >= Date.now() && !["cancelled", "finished", "no_show"].includes(reservation.statusKey));
        const action = String(device.action || "active").toLowerCase();
        const tableStatus = action === "hold" ? "unavailable" : current ? "occupied" : next ? "reserved" : "available";
        return { device, current, next, tableStatus };
      });
  }, [allDevices, areaFilter, normalizedDayReservations]);

  const availableWalkInTables = useMemo(() => {
    let walkInStart = Date.now();
    try {
      walkInStart = new Date(
        buildRestaurantDateTime(createForm.date, createForm.time, timezone),
      ).getTime();
    } catch {
      // The form validation will report an invalid date or time before submit.
    }
    const duration = Number(createForm.durationMinutes) || reservationSettings.reservation_duration_minutes || 90;
    const walkInEnd = walkInStart + duration * 60_000;
    const guests = Number(createForm.guestCount) || 1;
    const occupyingStatuses = new Set(["confirmed", "accept", "overdue", "seated", "extended"]);

    return (allDevices || []).filter((device: any) => {
      if (String(device.action || "active").toLowerCase() !== "active") return false;
      if (Number(device.capacity || 0) < guests) return false;
      return !normalizedDayReservations.some((reservation: any) => {
        if (Number(reservation.tableId) !== Number(device.id)) return false;
        if (!occupyingStatuses.has(String(reservation.status || "").toLowerCase())) return false;
        const start = new Date(reservation.reservationTime).getTime();
        const fallbackDuration = Number(reservation.durationMinutes || reservation.duration_minutes || 90);
        const end = reservation.endTime
          ? new Date(reservation.endTime).getTime()
          : start + fallbackDuration * 60_000;
        return start < walkInEnd && end > walkInStart;
      });
    });
  }, [
    allDevices,
    createForm.date,
    createForm.durationMinutes,
    createForm.guestCount,
    createForm.time,
    normalizedDayReservations,
    reservationSettings.reservation_duration_minutes,
    timezone,
  ]);

  const historyRows = useMemo(() => {
    return normalizedHistoryReservations.filter((reservation) => {
      const haystack = `${reservation.customerName || ""} ${reservation.cellNumber || ""} ${reservation.id || ""}`.toLowerCase();
      if (historySearch && !haystack.includes(historySearch.toLowerCase())) return false;
      if (historyStatus !== "all" && reservation.statusKey !== historyStatus) return false;
      if (historySource !== "all" && reservation.sourceKey !== historySource) return false;
      const time = new Date(reservation.reservationTime).getTime();
      if (historyStart && time < new Date(historyStart).setHours(0, 0, 0, 0)) return false;
      if (historyEnd && time > new Date(historyEnd).setHours(23, 59, 59, 999)) return false;
      return true;
    });
  }, [historyEnd, historySearch, historySource, historyStart, historyStatus, normalizedHistoryReservations]);

  const historyStats = useMemo(() => {
    const total = historyRows.length;
    const completed = historyRows.filter((row) => ["finished", "confirmed"].includes(row.statusKey)).length;
    const noShows = historyRows.filter((row) => row.statusKey === "no_show").length;
    const avgParty = total ? Math.round(historyRows.reduce((sum, row) => sum + Number(row.guestNo || 0), 0) / total) : 0;
    return { total, completed, noShows, avgParty };
  }, [historyRows]);

  const sourceStats = useMemo(() => {
    const total = Math.max(historyRows.length, 1);
    return (Object.keys(sourceConfig) as SourceKey[]).map((source) => {
      const count = historyRows.filter((row) => row.sourceKey === source).length;
      return { source, count, pct: Math.round((count / total) * 100) };
    });
  }, [historyRows]);

  const busiestHours = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    historyRows.forEach((row) => {
      const hour = new Date(row.reservationTime).getHours();
      if (hours[hour]) hours[hour].count += 1;
    });
    const max = Math.max(...hours.map((hour) => hour.count), 1);
    return { hours, max, peak: hours.reduce((best, hour) => (hour.count > best.count ? hour : best), hours[0]) };
  }, [historyRows]);

  const openWhatsApp = (phone?: string) => {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) {
      toast.error("No phone number available");
      return;
    }
    window.open(`https://wa.me/${digits}`, "_blank", "noopener,noreferrer");
  };

  const openCreateDialog = (mode: CreateMode) => {
    setCreateForm(
      makeDefaultCreateForm(
        selectedDate,
        mode,
        timezone,
        reservationSettings.reservation_duration_minutes,
      ),
    );
    setCreateMode(mode);
  };

  const updateCreateForm = (key: keyof CreateReservationForm, value: string) => {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  };

  const submitCreateReservation = async () => {
    if (!createMode) return;
    const isWalkIn = createMode === "walk_in";
    if (!isWalkIn && !createForm.customerName.trim()) return toast.error("Customer name is required");
    if (!isWalkIn && !createForm.phone.trim()) return toast.error("Phone is required");
    if (!createForm.tableId) return toast.error("Select a table");
    if (!createForm.date || !createForm.time) return toast.error("Date and time are required");
    const email = createForm.email.trim();
    if (email && !EMAIL_PATTERN.test(email)) {
      return toast.error("Email is optional. Enter a valid email address or leave it blank.");
    }
    setActionLoading(true);
    try {
      const reservationTime = buildRestaurantDateTime(createForm.date, createForm.time, timezone);
      await axiosInstance.post(`${getReservationBase(userRole)}/`, {
        customerName: createForm.customerName.trim() || "Walk-in Guest",
        phone: createForm.phone.trim() || "Not provided",
        email: email || null,
        tableId: createForm.tableId,
        guestCount: Number(createForm.guestCount) || 1,
        reservationTime,
        durationMinutes: Number(createForm.durationMinutes) || 90,
        customRequest: createForm.customRequest.trim(),
        source: isWalkIn ? "walk_in" : "dashboard",
        status: isWalkIn ? "seated" : "confirmed",
        actualSeatedTime: isWalkIn ? new Date().toISOString() : null,
      });
      toast.success(createMode === "walk_in" ? "Walk-in seated" : "Reservation created");
      setCreateMode(null);
      await refreshReservationData();
    } catch (error: any) {
      toast.error(formatApiError(error?.response?.data, "Failed to create reservation"));
    } finally {
      setActionLoading(false);
    }
  };

  const refreshReservationData = async () => {
    const dateString = selectedDate ? normaliseDateInput(selectedDate) : undefined;
    await Promise.all([
      fetchReservations(reservationsCurrentPage, debouncedSearchQuery, dateString),
      loadDayReservations(),
    ]);
  };

  const runReservationAction = async (reservation: any, action: string, body: Record<string, any> = {}) => {
    setOpenMenuId(null);
    setActionLoading(true);
    try {
      await axiosInstance.post(`${getReservationBase(userRole)}/${reservation.id}/${action}/`, body);
      toast.success("Reservation updated successfully");
      await refreshReservationData();
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.detail || "Failed to update reservation";
      toast.error(message);
      throw error;
    } finally {
      setActionLoading(false);
    }
  };

  const extendReservation = async (reservation: any) => {
    const value = window.prompt("Extend by how many minutes?", "30");
    if (!value) return;
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      toast.error("Enter a valid extension in minutes");
      return;
    }
    await runReservationAction(reservation, "extend", { minutes });
  };

  const moveReservation = async (reservation: any) => {
    const options = (allDevices || []).map((device: any) => `${device.id}: ${device.table_name || device.name}`).join("\n");
    const tableId = window.prompt(`Move to table ID:\n${options}`);
    if (!tableId) return;
    await runReservationAction(reservation, "move-table", { tableId });
  };

  const cancelReservation = async (reservation: any) => {
    const reason = window.prompt("Cancellation reason", "Cancelled by staff");
    if (reason === null) return;
    await runReservationAction(reservation, "cancel", { reason });
  };

  const deleteReservation = async (reservation: any) => {
    if (!window.confirm(`Delete the reservation for ${reservation.customerName}? This cannot be undone.`)) return;
    setOpenMenuId(null);
    setActionLoading(true);
    try {
      await axiosInstance.delete(`${getReservationBase(userRole)}/${reservation.id}/`);
      setSelectedReservation(null);
      toast.success("Reservation deleted");
      await refreshReservationData();
    } catch (error: any) {
      toast.error(formatApiError(error?.response?.data, "Failed to delete reservation"));
    } finally {
      setActionLoading(false);
    }
  };

  const editReservationTime = async (reservation: any) => {
    const current = new Date(reservation.reservationTime);
    const currentParts = getZonedInputParts(current, timezone);
    const date = window.prompt("New reservation date (YYYY-MM-DD)", currentParts.date);
    if (!date) return;
    const time = window.prompt(
      "New reservation time (HH:MM)",
      currentParts.time,
    );
    if (!time) return;
    setOpenMenuId(null);
    setActionLoading(true);
    try {
      await axiosInstance.patch(`${getReservationBase(userRole)}/${reservation.id}/`, {
        reservationTime: buildRestaurantDateTime(date, time, timezone),
      });
      toast.success("Reservation date and time updated");
      setSelectedReservation(null);
      await refreshReservationData();
    } catch (error: any) {
      toast.error(formatApiError(error?.response?.data, "That time is not available"));
    } finally {
      setActionLoading(false);
    }
  };

  const exportHistory = () => {
    const rows = [
      ["Guest", "Phone", "Date", "Guests", "Table", "Source", "Status"],
      ...historyRows.map((row) => [row.customerName, row.cellNumber, row.reservationTime, row.guestNo, row.tableName, sourceConfig[row.sourceKey].label, statusConfig[row.statusKey].label]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reservations-${normaliseDateInput(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filterPills: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "confirmed", label: "Confirmed", count: counts.confirmed },
    { key: "seated", label: "Seated", count: counts.seated },
    { key: "finished", label: "Completed", count: counts.finished },
    { key: "cancelled", label: "Cancelled", count: counts.cancelled },
    { key: "no_show", label: "No-Show", count: counts.no_show },
  ];

  return (
    <div className="font-sans text-slate-900">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
            {selectedDate ? formatDate(selectedDate, locale, timezone) : "Reservations"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">Reservation Management</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => openCreateDialog("walk_in")}
            disabled={actionLoading}
            className="inline-flex h-9 items-center rounded-lg border border-amber-200 bg-white px-3 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-50"
          >
            <Zap className="mr-1.5 h-4 w-4" strokeWidth={2} />
            Walk-in
          </button>
          <button
            type="button"
            onClick={() => openCreateDialog("reservation")}
            disabled={actionLoading}
            className="inline-flex h-9 items-center rounded-lg bg-[#0055FE] px-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-[#0047D1]"
          >
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={2} />
            New Reservation
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Today" value={todaysReservations.length} color="bg-[#0055FE]" />
        <KpiCard label="Confirmed" value={counts.confirmed} color="bg-blue-500" />
        <KpiCard label="Pending Approval" value={counts.pending} color="bg-amber-500" />
        <KpiCard label="Seated Now" value={counts.seated} color="bg-emerald-500" />
        <KpiCard label="WhatsApp Requests" value={counts.whatsapp} color="bg-[#25D366]" />
      </div>

      <ReservationSettingsCard onLoaded={setReservationSettings} />
      <Dialog360StatusCard settings={dialog360Settings} loading={dialog360Loading} onSaved={setDialog360Settings} />

      <div className="mb-6">
        <div className="inline-flex max-w-full rounded-xl bg-slate-100 p-1">
          {[
            { key: "reservations" as TabKey, label: "Reservations", icon: CalendarCheck },
            { key: "tables" as TabKey, label: "Table Availability", icon: Table2 },
            { key: "history" as TabKey, label: "Reservation History", icon: History },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Icon className="mr-2 h-4 w-4" strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "reservations" && (
        <div>
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <div className="relative sm:w-44">
                  <CalendarDays className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
                  <input
                    type="date"
                    value={selectedDate ? normaliseDateInput(selectedDate) : ""}
                    onChange={(event) => {
                      setSelectedDate(parseDateInput(event.target.value));
                      setReservationsCurrentPage(1);
                    }}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-[#0055FE] focus:ring-1 focus:ring-[#0055FE]/30"
                  />
                </div>
                <div className="relative sm:w-60">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
                  <input
                    type="text"
                    placeholder="Search by name or ID"
                    value={reservationsSearchQuery}
                    onChange={(event) => {
                      setReservationsSearchQuery(event.target.value);
                      setReservationsCurrentPage(1);
                    }}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-[#0055FE] focus:ring-1 focus:ring-[#0055FE]/30"
                  />
                </div>
              </div>
              <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-1">
                {(["list", "timeline", "board"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${viewMode === mode ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filterPills.map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setStatusFilter(pill.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === pill.key ? "border-[#0055FE] bg-[#0055FE] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {pill.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusFilter === pill.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"}`}>{pill.count}</span>
                </button>
              ))}
            </div>
          </div>

          {viewMode === "timeline" && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="space-y-2">
                {tableRows.map(({ device }) => {
                  const bookings = filteredReservations
                    .filter((reservation) => Number(reservation.tableId) === Number(device.id))
                    .sort((a, b) => new Date(a.reservationTime).getTime() - new Date(b.reservationTime).getTime());
                  return (
                    <div key={device.id} className="grid min-h-14 grid-cols-[120px_minmax(0,1fr)] items-center gap-3 border-b border-slate-100 py-2 last:border-0">
                      <div><p className="text-sm font-semibold text-slate-800">{device.table_name || device.name}</p><p className="text-[10px] text-slate-400">Capacity {device.capacity || "-"}</p></div>
                      <div className="flex min-w-0 flex-wrap gap-2">
                        {bookings.length ? bookings.map((reservation) => (
                          <button key={reservation.id} type="button" onClick={() => setSelectedReservation(reservation)} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-left text-xs text-blue-800">
                            <span className="font-semibold">{formatTime(reservation.reservationTime, locale, timezone)}</span> · {reservation.customerName} · {reservation.guestNo} guests
                          </button>
                        )) : <span className="text-xs text-slate-400">No bookings</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === "board" && (
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
              {(["pending", "confirmed", "seated", "finished", "cancelled", "no_show"] as StatusFilter[]).map((columnStatus) => (
                <section key={columnStatus} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{columnStatus === "finished" ? "Completed" : columnStatus.replace("_", " ")}</h3>
                  <div className="space-y-2">
                    {filteredReservations.filter((reservation) => filterToStatus(reservation.statusKey) === columnStatus).map((reservation) => (
                      <button key={reservation.id} type="button" onClick={() => setSelectedReservation(reservation)} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm">
                        <p className="text-xs font-semibold text-slate-800">{reservation.customerName}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{reservation.tableName} · {formatTime(reservation.reservationTime, locale, timezone)}</p>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div className={`${viewMode === "list" ? "hidden md:block" : "hidden"} overflow-visible rounded-xl border border-slate-200 bg-white`}>
            <div className="rounded-xl">
              <table className="w-full table-fixed text-left">
                <colgroup>
                  <col className="w-[20%]" /><col className="w-[10%]" /><col className="w-[7%]" />
                  <col className="w-[13%]" /><col className="w-[10%]" /><col className="w-[10%]" />
                  <col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[5%]" />
                </colgroup>
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {[
                      "Customer",
                      "Table",
                      "Guests",
                      "Time",
                      "Duration",
                      "Occasion",
                      "Source",
                      "Status",
                      "",
                    ].map((heading) => (
                      <th key={heading} className="px-2 py-3 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReservations.length > 0 ? filteredReservations.map((reservation) => {
                    const config = statusConfig[reservation.statusKey];
                    return (
                      <tr key={reservation.id} className={`border-l-4 transition-colors hover:bg-slate-50/60 ${config.border} ${reservation.statusKey === "pending" ? "bg-amber-50/30" : ""}`}>
                        <td className="break-words px-2 py-3">
                          <button type="button" onClick={() => setSelectedReservation(reservation)} className="text-left">
                            <p className="text-sm font-semibold text-slate-900 hover:text-[#0055FE]">{reservation.customerName}</p>
                            <p className="text-xs text-slate-400">{reservation.cellNumber}</p>
                          </button>
                        </td>
                        <td className="break-words px-2 py-3 text-xs text-slate-600">{reservation.tableName}</td>
                        <td className="px-2 py-3"><span className="inline-flex items-center gap-1 text-xs text-slate-600"><Users className="h-3 w-3 text-slate-400" strokeWidth={1.8} />{reservation.guestNo}</span></td>
                        <td className="px-2 py-3"><p className="text-xs font-medium text-slate-800">{formatTime(reservation.reservationTime, locale, timezone)}</p><p className="text-[9px] text-slate-400">{relativeTime(reservation.reservationTime)}</p></td>
                        <td className="break-words px-2 py-3 text-xs text-slate-500">{reservation.duration}</td>
                        <td className="break-words px-2 py-3 text-xs text-slate-500">{reservation.occasion}</td>
                        <td className="px-2 py-3"><SourceBadge source={reservation.sourceKey} /></td>
                        <td className="px-2 py-3"><StatusBadge status={reservation.statusKey} /></td>
                        <td className="relative px-1 py-3 text-right">
                          <button type="button" onClick={() => setOpenMenuId(openMenuId === reservation.id ? null : reservation.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700">
                            <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
                          </button>
                          {openMenuId === reservation.id && (
                            <div className="absolute right-4 top-10 z-20 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                              <GhostAction onClick={() => { setSelectedReservation(reservation); setOpenMenuId(null); }}><Eye className="mr-2 h-4 w-4 text-slate-500" strokeWidth={1.8} />View Details</GhostAction>
                              <GhostAction onClick={() => editReservationTime(reservation)}><CalendarDays className="mr-2 h-4 w-4 text-blue-600" strokeWidth={1.8} />Edit Date / Time</GhostAction>
                              <GhostAction onClick={() => openWhatsApp(reservation.cellNumber)}><MessageCircle className="mr-2 h-4 w-4 text-[#25D366]" strokeWidth={1.8} />Message on WhatsApp</GhostAction>
                              <GhostAction onClick={() => runReservationAction(reservation, "confirm")}><CheckCircle2 className="mr-2 h-4 w-4 text-blue-600" strokeWidth={1.8} />Confirm Booking</GhostAction>
                              <GhostAction onClick={() => runReservationAction(reservation, "mark-seated")}><UserCheck className="mr-2 h-4 w-4 text-emerald-600" strokeWidth={1.8} />Mark as Seated</GhostAction>
                              <GhostAction onClick={() => extendReservation(reservation)}><Timer className="mr-2 h-4 w-4 text-purple-600" strokeWidth={1.8} />Extend Time</GhostAction>
                              <GhostAction onClick={() => runReservationAction(reservation, "free-table")}><Unlock className="mr-2 h-4 w-4 text-slate-500" strokeWidth={1.8} />Free Table</GhostAction>
                              <GhostAction onClick={() => moveReservation(reservation)}><ArrowRightLeft className="mr-2 h-4 w-4 text-slate-500" strokeWidth={1.8} />Reassign Table</GhostAction>
                              <GhostAction danger onClick={() => cancelReservation(reservation)}><XCircle className="mr-2 h-4 w-4" strokeWidth={1.8} />Cancel Reservation</GhostAction>
                              <GhostAction danger onClick={() => runReservationAction(reservation, "no-show")}><UserX className="mr-2 h-4 w-4 text-rose-700" strokeWidth={1.8} />Mark No-Show</GhostAction>
                              <GhostAction danger onClick={() => deleteReservation(reservation)}><Trash2 className="mr-2 h-4 w-4" strokeWidth={1.8} />Delete Reservation</GhostAction>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">No reservations found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${viewMode === "list" ? "divide-y divide-slate-100 md:hidden" : "hidden"} rounded-xl border border-slate-200 bg-white`}>
            {filteredReservations.length > 0 ? filteredReservations.map((reservation) => {
              const config = statusConfig[reservation.statusKey];
              return (
                <button key={reservation.id} type="button" onClick={() => setSelectedReservation(reservation)} className={`block w-full border-l-4 p-4 text-left hover:bg-slate-50/50 ${config.border}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{reservation.customerName}</p>
                        <StatusBadge status={reservation.statusKey} />
                        <SourceBadge source={reservation.sourceKey} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{reservation.tableName} · {reservation.guestNo} guests</p>
                      <p className="mt-0.5 text-xs text-slate-400">{formatShortDateTime(reservation.reservationTime, locale, timezone)} · {relativeTime(reservation.reservationTime)}</p>
                      {reservation.customRequest && <p className="mt-1 truncate text-xs text-amber-600">Note: {reservation.customRequest}</p>}
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" strokeWidth={1.8} />
                  </div>
                </button>
              );
            }) : <div className="p-12 text-center text-sm text-slate-500">No reservations found</div>}
          </div>

          <div className="py-6 text-sm text-slate-500">
            {filteredReservations.length} of {normalizedDayReservations.length} reservations
          </div>
        </div>
      )}

      {tab === "tables" && (
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            {areas.map((area) => (
              <button key={area} type="button" onClick={() => setAreaFilter(area)} className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${areaFilter === area ? "border-[#0055FE] bg-[#0055FE] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>{area}</button>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>{["Table", "Location", "Capacity", "Current Status", "Next Booking", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {tableRows.length > 0 ? tableRows.map(({ device, next, tableStatus }) => (
                    <tr key={device.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{device.table_name || device.name}</td>
                      <td className="px-4 py-3 text-slate-500">{device.region || device.area || "Primary"}</td>
                      <td className="px-4 py-3 text-slate-500">{device.capacity || "-"}</td>
                      <td className="px-4 py-3"><TableStatusBadge status={tableStatus} /></td>
                      <td className="px-4 py-3 text-xs text-slate-500">{next ? `${formatTime(next.reservationTime, locale, timezone)} - ${next.customerName} (${next.guestNo} guests)` : "No upcoming booking"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {String(device.action || "active") === "hold" ? (
                            <button type="button" onClick={() => updateDeviceStatus(device.id, "active")} className="inline-flex h-8 items-center rounded-lg border border-emerald-200 px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50"><Unlock className="mr-1 h-3 w-3" strokeWidth={1.8} />Free</button>
                          ) : (
                            <button type="button" onClick={() => updateDeviceStatus(device.id, "hold")} className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"><Lock className="mr-1 h-3 w-3" strokeWidth={1.8} />Block</button>
                          )}
                          <button type="button" onClick={() => next ? setSelectedReservation(next) : toast("No active booking for this table")} className="inline-flex h-8 items-center rounded-lg border border-blue-200 px-2 text-xs font-medium text-blue-700 hover:bg-blue-50"><Eye className="mr-1 h-3 w-3" strokeWidth={1.8} />View Booking</button>
                          <button type="button" onClick={() => next ? extendReservation(next) : toast("No active booking for this table")} className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"><Timer className="mr-1 h-3 w-3" strokeWidth={1.8} />Extend</button>
                          <button type="button" onClick={() => fetchAllDevices(1, "")} className="inline-flex h-8 items-center rounded-lg border border-blue-200 px-2 text-xs font-medium text-blue-700 hover:bg-blue-50"><RefreshCw className="mr-1 h-3 w-3" strokeWidth={1.8} />Refresh</button>
                        </div>
                      </td>
                    </tr>
                  )) : <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">No tables found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Total Past" value={historyStats.total} color="bg-slate-400" />
            <KpiCard label="Completed" value={historyStats.completed} color="bg-emerald-500" />
            <KpiCard label="No-Shows" value={historyStats.noShows} color="bg-rose-500" />
            <KpiCard label="Avg Party" value={historyStats.avgParty} color="bg-[#0055FE]" />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="mb-4 text-sm font-bold text-slate-900">Booking Source</h3>
              <div className="space-y-3">
                {sourceStats.map(({ source, count, pct }) => (
                  <div key={source}>
                    <div className="mb-1.5 flex items-center justify-between"><span className="text-xs font-medium text-slate-700">{sourceConfig[source].label}</span><span className="text-xs text-slate-400">{count} · {pct}%</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: sourceConfig[source].color }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Busiest Hours</h3><span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Peak {String(busiestHours.peak.hour).padStart(2, "0")}:00</span></div>
              <div className="flex h-16 items-end gap-0.5">
                {busiestHours.hours.map(({ hour, count }) => <div key={hour} className="flex-1 rounded-t" style={{ height: `${Math.max(8, (count / busiestHours.max) * 100)}%`, backgroundColor: count === 0 ? "#F1F5F9" : hour === busiestHours.peak.hour ? BRAND : "#BFDBFE" }} />)}
              </div>
              <div className="mt-2 grid grid-cols-4 text-[8px] leading-none text-slate-300"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span></div>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="relative min-w-[140px] flex-1 sm:max-w-xs"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" strokeWidth={1.8} /><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search history" className="h-8 w-full rounded-md border border-slate-200 pl-8 pr-2 text-xs outline-none focus:border-[#0055FE]" /></div>
            <select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-600"><option value="all">All statuses</option>{Object.entries(statusConfig).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select>
            <select value={historySource} onChange={(event) => setHistorySource(event.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-600"><option value="all">All sources</option>{Object.entries(sourceConfig).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select>
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.8} /><input type="date" value={historyStart} onChange={(event) => setHistoryStart(event.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-xs" /><span className="text-slate-300">-</span><input type="date" value={historyEnd} onChange={(event) => setHistoryEnd(event.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-xs" />
            <button type="button" onClick={() => setHistoryRefreshKey((value) => value + 1)} disabled={historyLoading} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`} strokeWidth={1.8} />Refresh</button>
            <button type="button" onClick={exportHistory} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"><Download className="h-3.5 w-3.5" strokeWidth={1.8} />Export CSV</button>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-slate-100 bg-slate-50/60"><tr>{["Guest", "Date & Time", "Guests", "Table", "Duration", "Source", "Status", ""].map((heading) => <th key={heading} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{heading}</th>)}</tr></thead>
                <tbody>
                  {historyLoading && normalizedHistoryReservations.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500">Loading reservation history...</td></tr>
                  ) : historyError && normalizedHistoryReservations.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-red-600"><div className="flex flex-col items-center gap-2"><span>{historyError}</span><button type="button" onClick={() => setHistoryRefreshKey((value) => value + 1)} className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold hover:bg-red-50">Retry</button></div></td></tr>
                  ) : historyRows.length > 0 ? historyRows.map((reservation) => (
                    <Fragment key={reservation.id}>
                      <tr key={reservation.id} onClick={() => setExpandedHistoryId(expandedHistoryId === reservation.id ? null : reservation.id)} className="cursor-pointer border-b border-slate-50 transition-colors hover:bg-slate-50/60">
                        <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{initials(reservation.customerName)}</span><div><p className="text-xs font-semibold text-slate-900">{reservation.customerName}</p><p className="text-[10px] text-slate-400">{reservation.cellNumber}</p></div></div></td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatShortDateTime(reservation.reservationTime, locale, timezone)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500"><Users className="mr-1 inline h-3 w-3 text-slate-400" strokeWidth={1.8} />{reservation.guestNo}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{reservation.tableName}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{reservation.duration}</td>
                        <td className="px-4 py-3"><SourceBadge source={reservation.sourceKey} /></td>
                        <td className="px-4 py-3"><StatusBadge status={reservation.statusKey} /></td>
                        <td className="px-4 py-3"><ChevronDown className={`h-3.5 w-3.5 text-slate-300 transition-transform ${expandedHistoryId === reservation.id ? "rotate-180" : ""}`} /></td>
                      </tr>
                      {expandedHistoryId === reservation.id && <tr className="border-b border-slate-100 bg-slate-50/80"><td colSpan={8} className="px-6 py-4"><div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4"><div><p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Email</p><p className="text-slate-700">{reservation.email || "-"}</p></div><div><p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Occasion</p><p className="text-slate-700">{reservation.occasion}</p></div><div><p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Seating</p><p className="text-slate-700">{reservation.seating}</p></div><div><p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Request</p><p className="text-slate-700">{reservation.customRequest || "-"}</p></div></div></td></tr>}
                    </Fragment>
                  )) : <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500">No historical reservations match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-4 py-3 text-right text-xs text-slate-400">{historyRows.length} of {normalizedHistoryReservations.length} reservations</div>
          </div>
        </div>
      )}

      {selectedReservation && (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close reservation details" onClick={() => setSelectedReservation(null)} className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
          <aside className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h2 className="inline-flex items-center text-base font-semibold text-slate-900"><CalendarCheck className="mr-2 h-4 w-4 text-[#0055FE]" strokeWidth={1.8} />Reservation Details</h2>
              <button type="button" onClick={() => setSelectedReservation(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700"><X className="h-4 w-4" strokeWidth={1.8} /></button>
            </div>
            <div className="space-y-5 p-5">
              <section>
                <p className="text-lg font-bold text-slate-900">{selectedReservation.customerName}</p>
                <p className="mt-0.5 text-xs text-slate-400">#{String(selectedReservation.id).padStart(8, "0").slice(0, 8).toUpperCase()}</p>
                <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={selectedReservation.statusKey} /><SourceBadge source={selectedReservation.sourceKey} /></div>
                <button type="button" onClick={() => openWhatsApp(selectedReservation.cellNumber)} className="mt-3 inline-flex items-center rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1ea855]"><MessageCircle className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />Message on WhatsApp</button>
                <button type="button" onClick={() => editReservationTime(selectedReservation)} className="ml-2 mt-3 inline-flex items-center rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"><CalendarDays className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />Edit Date / Time</button>
                <button type="button" disabled={actionLoading} onClick={() => deleteReservation(selectedReservation)} className="ml-2 mt-3 inline-flex items-center rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />Delete Reservation</button>
              </section>

              <section className="rounded-xl bg-slate-50 p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Booking Info</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[{ label: "Date", value: new Date(selectedReservation.reservationTime).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: timezone }) }, { label: "Time", value: formatTime(selectedReservation.reservationTime, locale, timezone) }, { label: "Table", value: selectedReservation.tableName }, { label: "Guests", value: selectedReservation.guestNo }, { label: "Duration", value: selectedReservation.duration }, { label: "Occasion", value: selectedReservation.occasion }, { label: "Seating", value: selectedReservation.seating }].map((field) => <div key={field.label}><p className="mb-0.5 text-[10px] text-slate-400">{field.label}</p><p className="font-semibold text-slate-800">{field.value}</p></div>)}
                </div>
              </section>

              <section>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Contact</p>
                <div className="space-y-2"><p className="flex items-center gap-2 text-sm text-slate-700"><Phone className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.8} />{selectedReservation.cellNumber || "-"}</p><p className="flex items-center gap-2 text-sm text-slate-700"><Mail className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.8} />{selectedReservation.email || "-"}</p></div>
              </section>

              <section className="rounded-lg border border-amber-100 bg-amber-50 p-3"><p className="text-sm text-slate-700">{selectedReservation.customRequest || "No special requests recorded."}</p></section>

              <section>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Activity Timeline</p>
                {[{ label: "Reservation created", time: selectedReservation.createdAt }, { label: `Current status: ${statusConfig[selectedReservation.statusKey].label}`, time: selectedReservation.updatedAt }].map((event, index, arr) => <div key={event.label} className="flex items-start gap-3 pb-3"><div className="flex flex-col items-center"><span className="mt-1 h-2 w-2 rounded-full bg-[#0055FE]" />{index < arr.length - 1 && <span className="mt-1 min-h-4 w-px bg-slate-200" />}</div><div><p className="text-xs font-medium text-slate-700">{event.label}</p><p className="text-[10px] text-slate-400">{event.time ? relativeTime(event.time) : "-"}</p></div></div>)}
              </section>
            </div>
          </aside>
        </div>
      )}

      {createMode === "walk_in" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Close quick walk-in backdrop" onClick={() => setCreateMode(null)} className="absolute inset-0 bg-black/60" />
          <section role="dialog" aria-modal="true" aria-labelledby="quick-walk-in-title" className="relative z-10 w-full max-w-[440px] rounded-[14px] border border-slate-200 bg-white px-7 pb-7 pt-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-amber-500" strokeWidth={2} />
                  <h2 id="quick-walk-in-title" className="text-lg font-bold text-slate-900">Quick Walk-in</h2>
                </div>
                <p className="mt-1 text-sm text-slate-400">Seat a customer immediately</p>
              </div>
              <button type="button" aria-label="Close quick walk-in" onClick={() => setCreateMode(null)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <div className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-slate-600">Table *</span>
                <span className="relative block">
                  <select value={createForm.tableId} onChange={(event) => updateCreateForm("tableId", event.target.value)} required className="h-12 w-full appearance-none rounded-[10px] border border-[#3478F6] bg-white px-3 pr-10 text-sm text-slate-700 outline-none ring-1 ring-[#3478F6]/30 focus:border-[#0055FE] focus:ring-[#0055FE]/30">
                    <option value="">Select available table</option>
                    {availableWalkInTables.map((device: any) => <option key={device.id} value={device.id}>{device.table_name || device.name || `Table ${device.id}`}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
                </span>
              </label>

              <div>
                <span className="mb-1 block text-[13px] font-medium text-slate-600">Guests *</span>
                <div className="grid grid-cols-[38px_minmax(0,1fr)_38px] gap-2">
                  <button
                    type="button"
                    aria-label="Decrease guests"
                    onClick={() => updateCreateForm("guestCount", String(Math.max(1, (Number(createForm.guestCount) || 1) - 1)))}
                    disabled={(Number(createForm.guestCount) || 1) <= 1}
                    className="h-12 rounded-[10px] border border-slate-700 bg-white text-lg text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    −
                  </button>
                  <div className="flex h-12 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm">{Math.max(1, Number(createForm.guestCount) || 1)}</div>
                  <button
                    type="button"
                    aria-label="Increase guests"
                    onClick={() => updateCreateForm("guestCount", String((Number(createForm.guestCount) || 1) + 1))}
                    className="h-12 rounded-[10px] border border-slate-700 bg-white text-lg text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    +
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-slate-600">Name (optional)</span>
                <input value={createForm.customerName} onChange={(event) => updateCreateForm("customerName", event.target.value)} placeholder="Leave blank if not given" className="h-12 w-full rounded-[10px] border border-slate-200 px-3 text-sm text-slate-700 shadow-sm outline-none placeholder:text-slate-400 focus:border-[#0055FE]" />
              </label>

              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-slate-600">Duration</span>
                <span className="relative block">
                  <select value={createForm.durationMinutes} onChange={(event) => updateCreateForm("durationMinutes", event.target.value)} className="h-12 w-full appearance-none rounded-[10px] border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-700 shadow-sm outline-none focus:border-[#0055FE]">
                    {[30, 45, 60, 75, 90, 120, 150, 180].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.8} />
                </span>
              </label>
            </div>

            <button type="button" onClick={submitCreateReservation} disabled={actionLoading} className="mt-7 inline-flex h-12 w-full items-center justify-center gap-4 rounded-[10px] bg-[#7EDCB8] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#69D3AA] disabled:cursor-not-allowed disabled:opacity-60">
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
              {actionLoading ? "Seating..." : "Seat Immediately"}
            </button>
          </section>
        </div>
      )}

      {createMode === "reservation" && (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close create reservation backdrop" onClick={() => setCreateMode(null)} className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
          <div className="absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">New Reservation</h2>
                <p className="text-xs text-slate-400">Creates a confirmed dashboard reservation.</p>
              </div>
              <button type="button" aria-label="Close create reservation" onClick={() => setCreateMode(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700"><X className="h-4 w-4" strokeWidth={1.8} /></button>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600">Customer name <span className="text-red-500">*</span></span>
                <input required aria-required="true" value={createForm.customerName} onChange={(event) => updateCreateForm("customerName", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Phone <span className="text-red-500">*</span></span>
                <input required aria-required="true" value={createForm.phone} onChange={(event) => updateCreateForm("phone", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Email <span className="text-slate-400">(optional)</span></span>
                <input type="email" value={createForm.email} onChange={(event) => updateCreateForm("email", event.target.value)} placeholder="guest@example.com" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Table <span className="text-red-500">*</span></span>
                <select required aria-required="true" value={createForm.tableId} onChange={(event) => updateCreateForm("tableId", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]">
                  <option value="">Select table</option>
                  {(allDevices || []).map((device: any) => <option key={device.id} value={device.id}>{device.table_name || device.name || `Table ${device.id}`}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Guests <span className="text-red-500">*</span></span>
                <input required aria-required="true" type="number" min="1" value={createForm.guestCount} onChange={(event) => updateCreateForm("guestCount", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Date <span className="text-red-500">*</span></span>
                <input required aria-required="true" type="date" value={createForm.date} onChange={(event) => updateCreateForm("date", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">Time <span className="text-red-500">*</span></span>
                <input required aria-required="true" type="time" value={createForm.time} onChange={(event) => updateCreateForm("time", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600">Duration minutes <span className="text-red-500">*</span></span>
                <input required aria-required="true" type="number" min="15" step="15" value={createForm.durationMinutes} onChange={(event) => updateCreateForm("durationMinutes", event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0055FE]" />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600">Special request</span>
                <textarea value={createForm.customRequest} onChange={(event) => updateCreateForm("customRequest", event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0055FE]" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" onClick={() => setCreateMode(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={submitCreateReservation} disabled={actionLoading} className="h-9 rounded-lg bg-[#0055FE] px-4 text-sm font-semibold text-white hover:bg-[#0047D1] disabled:opacity-60">
                {actionLoading ? "Saving..." : "Create Reservation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenRestaurantReservations;
