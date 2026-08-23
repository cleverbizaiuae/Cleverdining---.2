type ChatEventTarget = {
  type?: unknown;
  guest_session_id?: unknown;
  session_id?: unknown;
  device_id?: unknown;
  table_id?: unknown;
};

type CurrentTableTarget = {
  guestSessionId?: unknown;
  deviceId?: unknown;
};

const normalized = (value: unknown) => String(value || "").trim();

export const isChatMessageForCurrentTable = (
  event: ChatEventTarget,
  currentTable: CurrentTableTarget,
) => {
  if (event.type !== "chat_message") return true;

  const eventSessionId = normalized(event.guest_session_id || event.session_id);
  const currentSessionId = normalized(currentTable.guestSessionId);
  if (eventSessionId && currentSessionId) {
    return eventSessionId === currentSessionId;
  }

  const eventDeviceId = normalized(event.device_id || event.table_id);
  const currentDeviceId = normalized(currentTable.deviceId);
  return Boolean(eventDeviceId && currentDeviceId && eventDeviceId === currentDeviceId);
};
