export type TimestampedChat = {
  last_message_time?: string;
};

export type StaffTableChat = TimestampedChat & {
  id: string;
  table_name: string;
  source?: "device" | "table-message";
  unread_count?: number;
  device_unread_count?: number;
  table_message_unread_count?: number;
  table_message_key?: string;
  has_alert?: boolean;
  device_has_alert?: boolean;
  active_guest_session_id?: string | number;
};

const getLastMessageTimestamp = (chat: TimestampedChat) => {
  if (!chat.last_message_time) return 0;
  const timestamp = new Date(chat.last_message_time).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const sortChatsByLatestMessage = <T extends TimestampedChat>(chats: T[]) =>
  [...chats].sort(
    (first, second) =>
      getLastMessageTimestamp(second) - getLastMessageTimestamp(first),
  );

export const resetClearedChatHistory = <T extends StaffTableChat>(
  chats: T[],
  chatIds: Array<string | number>,
) => {
  const clearedIds = new Set(chatIds.map((id) => String(id)));

  return chats.map((chat) => {
    if (!clearedIds.has(String(chat.id))) return chat;

    return {
      ...chat,
      unread_count: 0,
      device_unread_count: 0,
      table_message_unread_count: 0,
      table_message_key: undefined,
      has_alert: false,
      device_has_alert: false,
      last_message_time: undefined,
    } as T;
  });
};

const getCanonicalTableIdentity = (tableName: string) => {
  return String(tableName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};

const preferDeviceChat = <T extends StaffTableChat>(first: T, second: T) => {
  const firstHasActiveSession = first.active_guest_session_id !== undefined
    && first.active_guest_session_id !== null;
  const secondHasActiveSession = second.active_guest_session_id !== undefined
    && second.active_guest_session_id !== null;

  if (firstHasActiveSession !== secondHasActiveSession) {
    return secondHasActiveSession ? second : first;
  }

  const firstTime = first.last_message_time
    ? new Date(first.last_message_time).getTime()
    : 0;
  const secondTime = second.last_message_time
    ? new Date(second.last_message_time).getTime()
    : 0;
  if (firstTime !== secondTime) {
    return secondTime > firstTime ? second : first;
  }

  const firstNumericId = Number(first.id);
  const secondNumericId = Number(second.id);
  if (Number.isFinite(firstNumericId) && Number.isFinite(secondNumericId)) {
    return secondNumericId > firstNumericId ? second : first;
  }

  return first;
};

const deduplicateDeviceChats = <T extends StaffTableChat>(deviceChats: T[]) => {
  const chatsByTable = new Map<string, T>();

  deviceChats.forEach((chat) => {
    const tableIdentity = getCanonicalTableIdentity(chat.table_name)
      || `device-${chat.id}`;
    const existing = chatsByTable.get(tableIdentity);
    chatsByTable.set(
      tableIdentity,
      existing ? preferDeviceChat(existing, chat) : chat,
    );
  });

  return Array.from(chatsByTable.values());
};

export const mergeStaffTableChats = <T extends StaffTableChat>(
  deviceChats: T[],
  tableMessageChats: T[],
  selectedChatId?: string,
) => {
  const merged: T[] = deduplicateDeviceChats(deviceChats).map((chat) =>
    ({
      ...chat,
      unread_count: Number(chat.device_unread_count ?? chat.unread_count ?? 0),
      table_message_unread_count: 0,
      table_message_key: undefined,
      has_alert: Boolean(chat.device_has_alert ?? chat.has_alert),
    }) as T,
  );

  tableMessageChats.forEach((tableChat) => {
    const tableIdentity = getCanonicalTableIdentity(tableChat.table_name);
    const deviceIndex = merged.findIndex(
      (chat) =>
        chat.source !== "table-message"
        && getCanonicalTableIdentity(chat.table_name) === tableIdentity,
    );

    if (deviceIndex < 0) {
      return;
    }

    const deviceChat = merged[deviceIndex];
    const deviceUnread = Number(
      deviceChat.device_unread_count ?? deviceChat.unread_count ?? 0,
    );
    const tableUnread = Number(tableChat.unread_count || 0);
    const isSelected = String(deviceChat.id) === String(selectedChatId || "");

    merged[deviceIndex] = {
      ...deviceChat,
      unread_count: isSelected ? 0 : deviceUnread + tableUnread,
      device_unread_count: isSelected ? 0 : deviceUnread,
      table_message_unread_count: isSelected ? 0 : tableUnread,
      table_message_key: tableChat.id,
      has_alert: Boolean(deviceChat.device_has_alert || tableChat.has_alert),
    } as T;
  });

  return sortChatsByLatestMessage(merged);
};

export const isUnreadTableMessageStatus = (status: string) =>
  status === "pending" || status === "unread";

export const isActiveAssistanceStatus = (status: string) =>
  ["pending", "queued", "acknowledged"].includes(status);

type ReadableTableMessage = {
  id?: string | number;
  status?: string;
};

export const getUnreadTableMessageIds = (
  messages: ReadableTableMessage[],
) =>
  messages
    .filter((message) =>
      isUnreadTableMessageStatus(String(message.status || "").toLowerCase()),
    )
    .map((message) => message.id)
    .filter((id): id is string | number => id !== undefined);
