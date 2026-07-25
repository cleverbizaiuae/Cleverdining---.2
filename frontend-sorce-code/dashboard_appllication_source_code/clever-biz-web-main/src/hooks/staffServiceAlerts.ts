export type StaffServiceAlertLike = {
  id?: string | number;
  type?: string;
  status?: string;
};

export type DashboardRestaurantRowLike = {
  restaurant?: string | number;
  restaurant_id?: string | number;
};

const ASSISTANCE_TYPES = new Set(["assistance", "call_waiter"]);
const ACTIVE_ASSISTANCE_STATUSES = new Set(["pending", "queued", "acknowledged"]);
const ACTIONABLE_ASSISTANCE_STATUSES = new Set(["pending", "acknowledged"]);

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export const isStaffAlertRole = (role: unknown) => normalize(role) === "staff";

export const getFirstDashboardRestaurantId = (
  rows: DashboardRestaurantRowLike[],
) => {
  const row = rows.find((candidate) => (
    candidate?.restaurant_id !== undefined
    || candidate?.restaurant !== undefined
  ));
  return row?.restaurant_id ?? row?.restaurant ?? null;
};

export const isActiveAssistanceAlert = (alert: StaffServiceAlertLike) => (
  ASSISTANCE_TYPES.has(normalize(alert?.type))
  && ACTIVE_ASSISTANCE_STATUSES.has(normalize(alert?.status))
);

export const isActionableAssistanceAlert = (alert: StaffServiceAlertLike) => (
  ASSISTANCE_TYPES.has(normalize(alert?.type))
  && ACTIONABLE_ASSISTANCE_STATUSES.has(normalize(alert?.status))
);

export const isQueuedAssistanceAlert = (alert: StaffServiceAlertLike) => (
  ASSISTANCE_TYPES.has(normalize(alert?.type))
  && normalize(alert?.status) === "queued"
);

export const upsertStaffServiceAlert = <T extends StaffServiceAlertLike>(
  alerts: T[],
  incoming: T,
) => {
  if (incoming?.id === undefined || incoming?.id === null) return alerts;
  return [
    ...alerts.filter((alert) => String(alert.id) !== String(incoming.id)),
    incoming,
  ];
};
