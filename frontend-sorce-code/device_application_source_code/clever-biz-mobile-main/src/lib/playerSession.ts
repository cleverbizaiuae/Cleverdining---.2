import { TABLE_NUMBER } from "./tableIdentity";

export type PlayerSession = {
  name: string;
  phone?: string;
  customerId?: string;
};

const PLAYER_SESSION_KEY = `cb_player_t${TABLE_NUMBER}`;

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

export const getPlayerSession = (): PlayerSession | null => {
  const current = parseSession(sessionStorage.getItem(PLAYER_SESSION_KEY));
  if (current) return current;

  // One-time compatibility read for tabs opened before the session-based fix.
  const legacy = parseSession(localStorage.getItem("cb_player_session") || localStorage.getItem("playerSession"));
  if (!legacy) return null;
  sessionStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify(legacy));
  return legacy;
};

export const setPlayerSession = (session: PlayerSession) => {
  const name = String(session.name || "").trim();
  if (!name) return;
  const normalized: PlayerSession = {
    name,
    ...(session.phone ? { phone: String(session.phone).trim() } : {}),
    ...(session.customerId ? { customerId: String(session.customerId).trim() } : {}),
  };
  sessionStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify(normalized));
};

export const clearPlayerSession = () => {
  sessionStorage.removeItem(PLAYER_SESSION_KEY);
};
