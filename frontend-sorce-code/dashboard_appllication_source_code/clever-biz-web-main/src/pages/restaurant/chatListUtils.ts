export type TimestampedChat = {
  last_message_time?: string;
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
