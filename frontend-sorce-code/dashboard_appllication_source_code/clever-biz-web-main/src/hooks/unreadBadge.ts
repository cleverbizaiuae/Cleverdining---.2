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
