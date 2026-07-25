import { resetUpsellSession } from "./upsellSession";

const SESSION_KEYS = [
  "userInfo",
  "guest_session_token",
  "guest_session_id",
  "accessToken",
  "refreshToken",
  "pending_order_id",
  "bulk_checkout",
  "chat_messages_cache",
  "newMessage",
  "cart",
  "restaurant_id",
  "device_id",
  "table_name",
];

const SESSION_KEY_PREFIXES = [
  "cb:cart:",
  "cleverbiz_orders_",
  "cleverbiz_chat_",
  "cb_treat_",
];

export const clearGuestSessionStorage = () => {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  Object.keys(localStorage)
    .filter((key) => SESSION_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)))
    .forEach((key) => localStorage.removeItem(key));
  resetUpsellSession();
};
