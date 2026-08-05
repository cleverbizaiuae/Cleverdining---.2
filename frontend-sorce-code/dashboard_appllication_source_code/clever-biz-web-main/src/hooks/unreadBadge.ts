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

type UnreadTableSummaryRow = {
  tableName?: string;
  unreadCount?: number;
};

export function formatUnreadTableSummary(
  tables: UnreadTableSummaryRow[],
  limit = 2,
): string {
  return tables
    .filter((table) => Number(table?.unreadCount || 0) > 0)
    .slice(0, Math.max(0, limit))
    .map((table) => `${String(table.tableName || "Table")} - ${Number(table.unreadCount || 0)}`)
    .join(", ");
}
