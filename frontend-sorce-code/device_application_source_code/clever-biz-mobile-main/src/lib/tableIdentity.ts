export const TABLE_NUMBER = 5;
export const TABLE_NAME = "Table 5";

export type TableIdentity = {
  tableNumber: number;
  tableName: string;
  tableLabel: string;
  storageId: string;
  deviceId: string | null;
  restaurantId: string | null;
  guestSessionId: string | null;
  ordersStorageKey: string;
  chatStorageKey: string;
  treatStorageKey: string;
};

const parseJson = (value: string | null): any => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

const extractNumber = (value: string, fallback = TABLE_NUMBER) => {
  const match = value.match(/\d+/);
  if (!match) return fallback;
  const number = Number(match[0]);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export const getTableIdentity = (): TableIdentity => {
  const parsed = parseJson(localStorage.getItem("userInfo"));
  const restaurant = parsed?.user?.restaurants?.[0] || parsed?.restaurants?.[0] || {};

  const explicitTableName = firstString(
    restaurant?.table_name,
    parsed?.table_name,
    parsed?.tableName,
    localStorage.getItem("table_name"),
  );
  const deviceId = firstString(
    restaurant?.device_id,
    parsed?.table_id,
    parsed?.device_id,
    parsed?.user?.device_id,
    localStorage.getItem("device_id"),
  );
  const restaurantId = firstString(
    restaurant?.id,
    parsed?.restaurant_id,
    parsed?.user?.restaurant_id,
    localStorage.getItem("restaurant_id"),
  );
  const guestSessionId = firstString(
    restaurant?.guest_session_id,
    parsed?.guest_session_id,
    localStorage.getItem("guest_session_id"),
  );
  const guestSessionToken = firstString(localStorage.getItem("guest_session_token"));

  const tableName = explicitTableName || (deviceId ? `Table ${extractNumber(deviceId)}` : TABLE_NAME);
  const tableNumber = extractNumber(tableName || deviceId, TABLE_NUMBER);
  const storageId = String(tableNumber);
  const sessionIdentity = guestSessionId || guestSessionToken;
  const storageScope = sessionIdentity
    ? `session_${sessionIdentity.replace(/[^a-zA-Z0-9_-]/g, "_")}`
    : `unbound_${restaurantId || "restaurant"}_${deviceId || storageId}`;

  return {
    tableNumber,
    tableName,
    tableLabel: tableName,
    storageId,
    deviceId: deviceId || null,
    restaurantId: restaurantId || null,
    guestSessionId: guestSessionId || null,
    ordersStorageKey: `cleverbiz_orders_${storageScope}`,
    chatStorageKey: `cleverbiz_chat_${storageScope}`,
    treatStorageKey: `cb_treat_${storageScope}`,
  };
};

export const dispatchStorageUpdate = (key: string, newValue: string | null) => {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
};

export const setLocalStorageSynced = (key: string, value: string) => {
  localStorage.setItem(key, value);
  dispatchStorageUpdate(key, value);
};

export const removeLocalStorageSynced = (key: string) => {
  localStorage.removeItem(key);
  dispatchStorageUpdate(key, null);
};
