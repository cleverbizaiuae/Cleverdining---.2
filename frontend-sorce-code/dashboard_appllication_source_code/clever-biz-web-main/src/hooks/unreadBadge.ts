export function normalizeUnreadDeviceId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function isUnreadMessageForActiveChat(
  messageDeviceId: unknown,
  activeChatDeviceId: unknown,
): boolean {
  const messageId = normalizeUnreadDeviceId(messageDeviceId);
  const activeId = normalizeUnreadDeviceId(activeChatDeviceId);
  return messageId !== null && activeId !== null && messageId === activeId;
}

export function getUnreadSyncChannelName(
  restaurantId: unknown,
  dashboardRole: unknown,
): string | null {
  const normalizedRestaurantId = normalizeUnreadDeviceId(restaurantId);
  const normalizedRole = String(dashboardRole || "").trim().toLowerCase();
  if (!normalizedRestaurantId || !normalizedRole) return null;

  return `cleverdining-unread-sync:${normalizedRestaurantId}:${normalizedRole}`;
}

type UnreadTableIdentityRow = {
  id?: string | number;
  device_id?: string | number;
  table_name?: string;
};

export function resolveUnreadTableName(
  deviceId: unknown,
  eventTableName: unknown,
  tables: UnreadTableIdentityRow[],
): string {
  const normalizedDeviceId = normalizeUnreadDeviceId(deviceId);
  const explicitName = String(eventTableName || "").trim();
  const generatedName = normalizedDeviceId ? `Table ${normalizedDeviceId}` : "";
  if (
    explicitName
    && explicitName.toLowerCase() !== generatedName.toLowerCase()
  ) {
    return explicitName;
  }

  const matchingTable = normalizedDeviceId
    ? tables.find((table) => (
      normalizeUnreadDeviceId(table.id ?? table.device_id) === normalizedDeviceId
    ))
    : undefined;
  const storedName = String(matchingTable?.table_name || "").trim();

  return storedName || explicitName || generatedName || "Table";
}

export type UnreadTableSnapshot = {
  deviceId: string;
  tableName: string;
  unreadCount: number;
};

export function mergeUnreadTableSnapshots(
  serverRows: UnreadTableSnapshot[],
  liveRows: UnreadTableSnapshot[],
): UnreadTableSnapshot[] {
  const merged = new Map<string, UnreadTableSnapshot>();

  serverRows.forEach((row) => {
    const deviceId = normalizeUnreadDeviceId(row.deviceId);
    const unreadCount = Math.max(0, Number(row.unreadCount || 0));
    if (!deviceId || unreadCount === 0) return;
    merged.set(deviceId, {
      deviceId,
      tableName: String(row.tableName || `Table ${deviceId}`),
      unreadCount,
    });
  });

  liveRows.forEach((row) => {
    const deviceId = normalizeUnreadDeviceId(row.deviceId);
    const unreadCount = Math.max(0, Number(row.unreadCount || 0));
    if (!deviceId || unreadCount === 0) return;

    const existing = merged.get(deviceId);
    const liveName = String(row.tableName || "").trim();
    const fallbackName = `Table ${deviceId}`;
    merged.set(deviceId, {
      deviceId,
      tableName: existing?.tableName
        || (liveName && liveName.toLowerCase() !== fallbackName.toLowerCase() ? liveName : fallbackName),
      unreadCount: Math.max(existing?.unreadCount || 0, unreadCount),
    });
  });

  return Array.from(merged.values());
}

export function isUnreadSnapshotCurrent(
  requestRevision: number,
  currentRevision: number,
): boolean {
  return requestRevision === currentRevision;
}

type UnreadTableCountRow = {
  deviceId?: string | number;
  tableName?: string;
  unreadCount?: number;
};

export function getUnreadTableCount(tables: UnreadTableCountRow[]): number {
  const unreadTableIds = new Set<string>();

  tables.forEach((table) => {
    if (Number(table?.unreadCount || 0) <= 0) return;

    const tableName = String(table?.tableName || "").trim().toLowerCase();
    const deviceId = normalizeUnreadDeviceId(table?.deviceId);
    const tableId = tableName.replace(/\s+/g, " ") || (deviceId ? `device-${deviceId}` : "");
    if (tableId) unreadTableIds.add(tableId);
  });

  return unreadTableIds.size;
}
