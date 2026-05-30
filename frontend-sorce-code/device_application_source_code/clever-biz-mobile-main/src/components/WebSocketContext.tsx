import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from "react";
import { captureWebSocketFailure } from "../monitoring/sentry";
import { getTableIdentity, removeLocalStorageSynced, setLocalStorageSynced } from "../lib/tableIdentity";

type WebSocketContextType = {
  ws: WebSocket | null;
  hasNewMessage: boolean;
  sendMessage: (message: string, type?: string) => void;
  setNewMessageFlag: (value: boolean) => void;
  messages: any[];
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  connectionStatus: "connecting" | "connected" | "reconnecting" | "disconnected";
  retryConnection: () => void;
};

const WebSocketContext = createContext<WebSocketContextType | undefined>(
  undefined
);

const isLocalHost = () =>
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
}) => {
  const tableIdentity = React.useMemo(() => getTableIdentity(), []);
  const chatStorageKey = tableIdentity.chatStorageKey;
  // We use a Ref for the active socket to avoid stale closure issues in callbacks (like connect/handleVisibilityChange)
  const wsRef = React.useRef<WebSocket | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);

  const [hasNewMessage, setHasNewMessageState] = useState<boolean>(() => {
    return localStorage.getItem("newMessage") === "true";
  });
  const reconnectTimeout = React.useRef<NodeJS.Timeout | null>(null);
  const reconnectDelay = React.useRef<number>(3000); // Start at 3s, exponential backoff
  const reconnectAttempts = React.useRef<number>(0);
  const pendingMessagesRef = React.useRef<Array<{ message: string; type: string }>>([]);
  const MAX_RECONNECT_ATTEMPTS = 8;
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "reconnecting" | "disconnected">("connecting");

  // Function to set the newMessage flag
  const setNewMessageFlag = (value: boolean) => {
    localStorage.setItem("newMessage", value ? "true" : "false");
    setHasNewMessageState(value);
  };

  // Initialize from LocalStorage
  const [messages, setMessages] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(chatStorageKey) || localStorage.getItem("chat_messages_cache");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Persist on Change
  useEffect(() => {
    try {
      setLocalStorageSynced(chatStorageKey, JSON.stringify(messages));
    } catch (e) {
      console.warn("Failed to persist chat messages", e);
    }
  }, [chatStorageKey, messages]);

  const connect = React.useCallback(() => {
    const accessToken = localStorage.getItem("accessToken");
    const guestSessionToken = localStorage.getItem("guest_session_token");

    // Use Guest Token if found (Priority: Guest > User for Table Mode)
    // This ensures owners scanning a QR code chat as "Guest" not "Staff"
    let tokenToUse = guestSessionToken;

    if (!tokenToUse && accessToken && accessToken !== "guest_token") {
      tokenToUse = accessToken;
    }

    console.log("DEBUG: WS Token Decision:", {
      accessToken: accessToken ? accessToken.substring(0, 10) + "..." : "null",
      guestToken: guestSessionToken ? guestSessionToken.substring(0, 10) + "..." : "null",
      FINAL_DECISION: tokenToUse ? tokenToUse.substring(0, 10) + "..." : "null"
    });

    const userInfo = localStorage.getItem("userInfo");
    const parsedUserInfo = userInfo ? JSON.parse(userInfo) : null;

    // Robust ID Extraction (Supports Owner User structure AND Guest/Table Session structure)
    let device_id = parsedUserInfo?.user?.restaurants?.[0]?.device_id || parsedUserInfo?.device_id || parsedUserInfo?.table_id;
    let restaurant_id = parsedUserInfo?.user?.restaurants?.[0]?.id || parsedUserInfo?.restaurant_id || localStorage.getItem("restaurant_id");

    // Fallback for Guest/Table Session (where structure is flat or different)
    if (!device_id) {
      device_id = parsedUserInfo?.table_id || parsedUserInfo?.device_id || parsedUserInfo?.user?.device_id;
    }
    if (!restaurant_id) {
      restaurant_id = parsedUserInfo?.restaurant_id || parsedUserInfo?.user?.restaurant_id;
    }

    if (!device_id || !restaurant_id) {
      setConnectionStatus("disconnected");
      captureWebSocketFailure("WebSocket skipped: missing device_id or restaurant_id", {
        feature: "websocket",
      });
      return;
    }

    // Check against the Ref, which is always current
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return; // Already connecting or connected
    }

    if (isLocalHost() && !import.meta.env.VITE_WS_URL) {
      setConnectionStatus("disconnected");
      captureWebSocketFailure("WebSocket skipped locally: VITE_WS_URL is not configured", {
        feature: "websocket",
      });
      return;
    }

    const toWsBase = (input: string): string => {
      if (!input) return "wss://cleverdining-2.onrender.com";
      if (input.startsWith("ws://") || input.startsWith("wss://")) return input;
      if (input.startsWith("http://")) return input.replace("http://", "ws://");
      if (input.startsWith("https://")) return input.replace("https://", "wss://");
      return `wss://${input.replace(/^\/+/, "")}`;
    };
    const wsBaseUrl = toWsBase(import.meta.env.VITE_WS_URL || "wss://cleverdining-2.onrender.com");

    // Safety Check: If we are a guest (no accessToken) and have no guestSessionToken, do NOT connect.
    if ((!accessToken || accessToken === "guest_token") && !tokenToUse) {
      console.warn("WebSocket Context: Missing Guest Token, aborting connection to prevent history loss.");
      setConnectionStatus("disconnected");
      captureWebSocketFailure("WebSocket skipped: missing guest token", {
        feature: "websocket",
      });
      return;
    }

    // UNIFIED CHAT URL: Connect to the Restaurant Room
    // If we have a restaurant ID, connect to the unified room.
    let wsUrl = "";
    if (restaurant_id && tokenToUse) {
      wsUrl = `${wsBaseUrl}/ws/chat/restaurant/${restaurant_id}/?token=${tokenToUse}`;
    } else {
      console.warn("Missing restaurant_id, cannot connect to Unified Chat Room.");
      setConnectionStatus("disconnected");
      captureWebSocketFailure("WebSocket skipped: missing restaurant_id", {
        feature: "websocket",
      });
      return;
    }

    setConnectionStatus(reconnectAttempts.current > 0 ? "reconnecting" : "connecting");
    console.log(`Connecting to WebSocket: ${wsUrl}`);
    const socket = new WebSocket(wsUrl);

    // Update both Ref and State
    wsRef.current = socket;
    setWs(socket);

    socket.onopen = () => {
      console.log("WebSocket connected");
      // Reset backoff on successful connection
      reconnectDelay.current = 3000;
      reconnectAttempts.current = 0;
      setConnectionStatus("connected");
      // Clear any pending reconnect attempts
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }

      // Flush queued messages that were created while disconnected.
      if (pendingMessagesRef.current.length > 0) {
        const queued = [...pendingMessagesRef.current];
        pendingMessagesRef.current = [];
        queued.forEach((entry) => {
          socket.send(JSON.stringify(entry));
        });
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if ((data.type === 'order_status_update' && data.session_ended) || data.type === 'session_closed') {
          console.log("Session Ended via WebSocket");
          localStorage.removeItem("userInfo");
          localStorage.removeItem("guest_session_token");
          localStorage.removeItem("accessToken");
          localStorage.removeItem("pending_order_id");
          removeLocalStorageSynced(chatStorageKey);
          localStorage.removeItem("chat_messages_cache");
          window.location.href = "/login";
          return;
        }

        if (data.type === 'chat_cleared') {
          // Check if this clearance is for ME
          if (String(data.device_id) === String(device_id)) {
            console.log("Chat cleared by remote admin");
            setMessages([]);
            removeLocalStorageSynced(chatStorageKey);
            localStorage.removeItem("chat_messages_cache");
            return;
          }
        }

        if (data.message && typeof data.message === "string") {
          // Set the newMessage flag when a new message arrives
          setNewMessageFlag(true);

          // PERSISTENCE FIX: Update Global Message State
          setMessages(prev => {
            // Improved Deduplication: Check last 10 messages for exact text match
            // This handles optimistic UI adding message before WS echo arrives
            const isDuplicate = prev.slice(-10).some(m =>
              m.text === data.message &&
              m.is_from_device === (data.is_from_device === true || data.is_from_device === "true")
            );

            if (isDuplicate) {
              console.log("DEBUG: Duplicate message filtered:", data.message);
              return prev;
            }

            return [...prev, {
              id: Date.now(), // Use timestamp for unique ID
              is_from_device: data.is_from_device === true || data.is_from_device === "true",
              text: data.message,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              hasActions: false
            }];
          });
        }
      } catch (e) {
        console.error("WS Message Error", e);
        captureWebSocketFailure("WebSocket message parse failed", {
          endpoint: wsUrl,
          feature: "websocket",
        });
      }
    };

    socket.onclose = () => {
      const delay = reconnectDelay.current;
      console.log(`WebSocket disconnected. Reconnecting in ${delay / 1000}s...`);
      wsRef.current = null;
      setWs(null);
      if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        setConnectionStatus("disconnected");
        return;
      }
      setConnectionStatus("reconnecting");
      reconnectAttempts.current += 1;
      // Exponential backoff: 3s → 6s → 12s → 24s → max 30s
      reconnectDelay.current = Math.min(delay * 2, 30000);
      // Attempt reconnect
      if (!reconnectTimeout.current) {
        reconnectTimeout.current = setTimeout(() => {
          reconnectTimeout.current = null;
          connect();
        }, delay);
      }
    };

    socket.onerror = (err) => {
      console.warn("WebSocket error:", err);
      captureWebSocketFailure("WebSocket socket error", {
        endpoint: wsUrl,
        feature: "websocket",
      });
      // onclose will fire after onerror, so reconnect is handled there
    };
  }, []);

  const sendMessage = (message: string, type: string = "message") => {
    const payload = { message, type };

    // Use Ref for immediate check
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log(`DEBUG: Mobile Sending WS Payload: ${JSON.stringify(payload)}`);
      wsRef.current.send(JSON.stringify(payload));
    } else {
      // Queue message so actions like "Call Assistance" are not dropped.
      const queue = pendingMessagesRef.current;
      if (queue.length >= 20) {
        queue.shift();
      }
      queue.push(payload);

      console.warn("DEBUG: Mobile WS not ready. Queued message and triggering reconnect.");
      reconnectAttempts.current = 0;
      setConnectionStatus("reconnecting");
      connect();
    }
  };

  const retryConnection = React.useCallback(() => {
    reconnectAttempts.current = 0;
    reconnectDelay.current = 3000;
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const socket = wsRef.current;
        if (!socket || socket.readyState === WebSocket.CLOSED) {
          console.log("App visible, reconnecting socket...");
          reconnectAttempts.current = 0;
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wsRef.current) {
        // We typically don't strictly close on unmount of Provider unless app is closing, 
        // to prevent churn, but here we can clean up if completely unmounting.
        wsRef.current.onclose = null; // Prevent reconnect loop on unmount
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, []);

  return (
    <WebSocketContext.Provider
      value={{ ws, hasNewMessage, setNewMessageFlag, sendMessage, messages, setMessages, connectionStatus, retryConnection }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
};
