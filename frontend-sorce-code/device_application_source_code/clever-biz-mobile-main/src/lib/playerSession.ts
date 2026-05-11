export type PlayerSession = {
  name: string;
  phone: string;
};

const PLAYER_SESSION_KEY = "cb_player_session";

export const getPlayerSession = (): PlayerSession | null => {
  try {
    const raw = localStorage.getItem(PLAYER_SESSION_KEY) || localStorage.getItem("playerSession");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const name = String(parsed?.name || parsed?.playerName || "").trim();
    const phone = String(parsed?.phone || parsed?.phoneNumber || "").trim();
    if (!name || !phone) return null;
    return { name, phone };
  } catch {
    return null;
  }
};

export const setPlayerSession = (session: PlayerSession) => {
  localStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify(session));
};

export const clearPlayerSession = () => {
  localStorage.removeItem(PLAYER_SESSION_KEY);
};
