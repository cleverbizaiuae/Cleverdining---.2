import { TABLE_NUMBER } from "./tableIdentity";

export type PlayerSession = {
  name: string;
  phone?: string;
  customerId?: string;
};

const PLAYER_SESSION_KEY = `cb_player_t${TABLE_NUMBER}`;
const LEGACY_KEYS = ["cb_player_session", "playerSession"];

const parseSession = (raw: string | null): PlayerSession | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const name = String(parsed?.name || parsed?.playerName || "").trim();
    const phone = String(parsed?.phone || parsed?.phoneNumber || "").trim();
    const customerId = String(parsed?.customerId || parsed?.customer_id || "").trim();
    if (!name) return null;
    return {
      name,
      ...(phone ? { phone } : {}),
      ...(customerId ? { customerId } : {}),
    };
  } catch {
    return null;
  }
};

const persistSession = (session: PlayerSession) => {
  const serialized = JSON.stringify(session);
  localStorage.setItem(PLAYER_SESSION_KEY, serialized);
  sessionStorage.setItem(PLAYER_SESSION_KEY, serialized);
};

export const getPlayerSession = (): PlayerSession | null => {
  const current = parseSession(localStorage.getItem(PLAYER_SESSION_KEY)) || parseSession(sessionStorage.getItem(PLAYER_SESSION_KEY));
  if (current) {
    persistSession(current);
    return current;
  }

  // One-time compatibility read for older unscoped arcade sessions.
  for (const key of LEGACY_KEYS) {
    const legacy = parseSession(localStorage.getItem(key) || sessionStorage.getItem(key));
    if (legacy) {
      persistSession(legacy);
      return legacy;
    }
  }

  return null;
};

export const setPlayerSession = (session: PlayerSession) => {
  const name = String(session.name || "").trim();
  if (!name) return;
  const normalized: PlayerSession = {
    name,
    ...(session.phone ? { phone: String(session.phone).trim() } : {}),
    ...(session.customerId ? { customerId: String(session.customerId).trim() } : {}),
  };
  persistSession(normalized);
};

export const clearPlayerSession = () => {
  localStorage.removeItem(PLAYER_SESSION_KEY);
  sessionStorage.removeItem(PLAYER_SESSION_KEY);
};
