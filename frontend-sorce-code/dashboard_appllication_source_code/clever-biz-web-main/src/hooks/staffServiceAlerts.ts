export type StaffServiceAlertLike = {
  id?: string | number;
  deviceId?: string | number;
  device_id?: string | number;
  tableNumber?: string | number;
  table_number?: string | number;
  tableName?: string;
  table_name?: string;
  type?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
};

export type DashboardRestaurantRowLike = {
  restaurant?: string | number;
  restaurant_id?: string | number;
};

export type StaffReadyOrderLike = {
  status?: string;
};

export type StaffOrderRecord = Record<string, unknown> & {
  id?: string | number;
  status?: string;
};

export type StaffCashOrderAlert = {
  id: string;
  tableName: string;
  amount: number;
  currency: string;
  total?: number;
  alreadyPaid?: number;
  orderIds: number[];
};

export type StaffReadyOrderAlert = {
  id: number;
  tableName: string;
  amount: number;
  order: StaffOrderRecord;
};

export type StaffOrderViewState = {
  viewOrder?: StaffOrderRecord;
};

const ASSISTANCE_TYPES = new Set(["assistance", "call_waiter"]);
const ACTIVE_ASSISTANCE_STATUSES = new Set(["pending", "queued", "acknowledged"]);
const ACTIONABLE_ASSISTANCE_STATUSES = new Set(["pending", "acknowledged"]);

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export const isStaffAlertRole = (role: unknown) => normalize(role) === "staff";

export const isReadyToServeOrder = (order: StaffReadyOrderLike) => {
  const status = normalize(order?.status);
  return status === "ready" || status === "served";
};

const getStaffOrdersFromPayload = (payload: unknown): StaffOrderRecord[] => {
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const results = record.results;
  if (Array.isArray(results)) return results as StaffOrderRecord[];
  if (results && typeof results === "object") {
    const nestedOrders = (results as Record<string, unknown>).orders;
    if (Array.isArray(nestedOrders)) return nestedOrders as StaffOrderRecord[];
  }
  return Array.isArray(record.orders) ? record.orders as StaffOrderRecord[] : [];
};

const asFiniteMoney = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const buildStaffOrderAlerts = (
  payload: unknown,
  fallbackCurrency: string,
) => {
  const groupedCashAlerts = new Map<string, StaffCashOrderAlert>();
  const readyOrderAlerts: StaffReadyOrderAlert[] = [];

  getStaffOrdersFromPayload(payload).forEach((order) => {
    const status = normalize(order.status);
    const paymentStatus = normalize(order.payment_status);
    if (status === "cancelled" || status === "canceled") return;

    if (isReadyToServeOrder(order)) {
      const orderId = Number(order.id);
      if (Number.isInteger(orderId) && orderId > 0) {
        readyOrderAlerts.push({
          id: orderId,
          tableName: String(order.device_name || order.device_table_name || order.tableNo || "Table"),
          amount: asFiniteMoney(order.total_price),
          order,
        });
      }
    }

    if (status !== "awaiting_cash" && paymentStatus !== "pending_cash") return;

    const tableName = String(order.device_name || order.device_table_name || order.tableNo || "Table");
    const currency = String(order.currency || fallbackCurrency || "AED").trim().toUpperCase();
    const groupKey = String(order.device_id || order.device || tableName);
    const total = asFiniteMoney(order.total_price);
    const paid = asFiniteMoney(order.amount_paid || order.amountPaid);
    const remaining = asFiniteMoney(
      order.remaining_amount ?? order.remainingAmount ?? Math.max(0, total - paid),
    );
    const orderId = Number(order.id);
    const existing = groupedCashAlerts.get(groupKey);

    if (existing) {
      existing.amount += Math.max(0, remaining);
      existing.total = Number(existing.total || 0) + Math.max(0, total);
      existing.alreadyPaid = Number(existing.alreadyPaid || 0) + Math.max(0, paid);
      if (Number.isInteger(orderId) && orderId > 0) existing.orderIds.push(orderId);
      return;
    }

    groupedCashAlerts.set(groupKey, {
      id: `cash-table-${groupKey}`,
      tableName,
      amount: Math.max(0, remaining),
      currency,
      total: Math.max(0, total),
      alreadyPaid: Math.max(0, paid),
      orderIds: Number.isInteger(orderId) && orderId > 0 ? [orderId] : [],
    });
  });

  return {
    cashAlerts: Array.from(groupedCashAlerts.values()),
    readyOrderAlerts,
  };
};

export const getStaffOrdersPath = (pathname: string) => (
  pathname.startsWith("/staffadmindashboard")
    ? "/staffadmindashboard/orders"
    : "/staff/orders"
);

export const createStaffOrderViewState = (
  order: StaffOrderRecord,
): StaffOrderViewState => ({
  viewOrder: {
    ...order,
    tableNo: order.tableNo || order.device_name || "N/A",
    timeOfOrder: order.timeOfOrder || order.created_time,
  },
});

export const getStaffOrderFromViewState = (
  state: unknown,
): StaffOrderRecord | null => {
  if (!state || typeof state !== "object") return null;
  const order = (state as StaffOrderViewState).viewOrder;
  if (!order || typeof order !== "object" || order.id === undefined) return null;
  return order;
};

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

const compareAssistanceQueueOrder = (
  first: StaffServiceAlertLike,
  second: StaffServiceAlertLike,
) => {
  const firstTimestamp = Date.parse(String(first.createdAt ?? first.created_at ?? ""));
  const secondTimestamp = Date.parse(String(second.createdAt ?? second.created_at ?? ""));
  const firstHasTimestamp = Number.isFinite(firstTimestamp);
  const secondHasTimestamp = Number.isFinite(secondTimestamp);

  if (firstHasTimestamp && secondHasTimestamp && firstTimestamp !== secondTimestamp) {
    return firstTimestamp - secondTimestamp;
  }
  if (firstHasTimestamp !== secondHasTimestamp) return firstHasTimestamp ? -1 : 1;

  return String(first.id ?? "").localeCompare(String(second.id ?? ""), undefined, {
    numeric: true,
  });
};

export const getStaffAssistanceQueue = <T extends StaffServiceAlertLike>(
  alerts: T[],
  visibleLimit = 3,
) => {
  const safeVisibleLimit = Math.max(0, Math.floor(visibleLimit));
  const actionableAlerts = alerts
    .filter(isActionableAssistanceAlert)
    .sort(compareAssistanceQueueOrder);
  const serverQueuedAlerts = alerts
    .filter(isQueuedAssistanceAlert)
    .sort(compareAssistanceQueueOrder);
  const overflowAlerts = actionableAlerts.slice(safeVisibleLimit);

  return {
    visibleAlerts: actionableAlerts.slice(0, safeVisibleLimit),
    queuedAlerts: [...overflowAlerts, ...serverQueuedAlerts].sort(compareAssistanceQueueOrder),
  };
};

const getServiceAlertIdentityParts = (alert: StaffServiceAlertLike) => ({
  deviceId: normalize(alert?.deviceId ?? alert?.device_id),
  tableNumber: normalize(alert?.tableNumber ?? alert?.table_number),
  tableName: normalize(alert?.tableName ?? alert?.table_name).replace(/\s+/g, " "),
});

const isSameServiceTable = (
  first: StaffServiceAlertLike,
  second: StaffServiceAlertLike,
) => {
  const firstIdentity = getServiceAlertIdentityParts(first);
  const secondIdentity = getServiceAlertIdentityParts(second);

  if (firstIdentity.deviceId && secondIdentity.deviceId) {
    return firstIdentity.deviceId === secondIdentity.deviceId;
  }
  if (firstIdentity.tableNumber && secondIdentity.tableNumber) {
    return firstIdentity.tableNumber === secondIdentity.tableNumber;
  }
  return Boolean(
    firstIdentity.tableName
    && secondIdentity.tableName
    && firstIdentity.tableName === secondIdentity.tableName,
  );
};

export const getActiveAssistanceAlertIdsForTable = (
  alerts: StaffServiceAlertLike[],
  target: StaffServiceAlertLike,
) => {
  const targetIdentity = getServiceAlertIdentityParts(target);
  if (!targetIdentity.deviceId && !targetIdentity.tableNumber && !targetIdentity.tableName) {
    return target?.id === undefined || target?.id === null ? [] : [target.id];
  }

  const ids = alerts
    .filter((alert) => (
      isActiveAssistanceAlert(alert)
      && isSameServiceTable(alert, target)
    ))
    .map((alert) => alert.id)
    .filter((id): id is string | number => id !== undefined && id !== null);

  if (ids.length > 0) return ids;
  return target?.id === undefined || target?.id === null ? [] : [target.id];
};

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
