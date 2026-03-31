import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from "react";
import toast from "react-hot-toast";

// Create a WebSocket context
export const WebSocketContext = createContext(null);

// Cross-tab sync channel
const BROADCAST_CHANNEL_NAME = 'cleverdining-unread-sync';

type UnreadTable = {
  deviceId: string;
  tableName: string;
  unreadCount: number;
};

// PWA App Badge helpers
function updateAppBadge(count: number) {
  try {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  } catch (e) {
    // Gracefully fail if not supported
  }
}

const WebSocketProvider = ({ children }) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [response, setResponse] = useState({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadTables, setUnreadTables] = useState<UnreadTable[]>([]);
  const reconnectTimeoutRef = useRef<any>(null);
  const reconnectAttemptRef = useRef(0);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // 1. Get User & Token
  const parseUser = JSON.parse(localStorage.getItem("userInfo") || "{}");
  const accessToken = localStorage.getItem("accessToken");

  // 2. Robust ID Extraction
  let restaurantId =
    parseUser.restaurant_id ||
    parseUser.restaurants_id ||
    parseUser.restaurant?.id ||
    parseUser.restaurant ||
    localStorage.getItem("restaurantId") ||
    localStorage.getItem("selectedRestaurantId");

  if (!restaurantId && parseUser.restaurants && parseUser.restaurants.length > 0) {
    restaurantId = parseUser.restaurants[0]?.id;
  }

  const id = restaurantId;
  const wsUrl = `${import.meta.env.VITE_WS_URL || "ws://localhost:8000"}/ws/alldatalive/${id}/?token=${accessToken}`;

  // Cross-tab sync via BroadcastChannel
  useEffect(() => {
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannelRef.current = channel;

      channel.onmessage = (event) => {
        if (!event.data) return;
        if (typeof event.data.unreadCount === 'number') {
          setUnreadCount(event.data.unreadCount);
          updateAppBadge(event.data.unreadCount);
        }
        if (Array.isArray(event.data.unreadTables)) {
          setUnreadTables(
            event.data.unreadTables
              .filter((t: any) => t && t.deviceId)
              .map((t: any) => ({
                deviceId: String(t.deviceId),
                tableName: String(t.tableName || `Table ${t.deviceId}`),
                unreadCount: Number(t.unreadCount || 0),
              }))
              .filter((t: UnreadTable) => t.unreadCount > 0)
          );
        }
      };

      return () => {
        channel.close();
        broadcastChannelRef.current = null;
      };
    } catch (e) {
      // BroadcastChannel not supported in some browsers
    }
  }, []);

  const syncUnreadState = useCallback((count: number, tables?: UnreadTable[]) => {
    const safeCount = Math.max(0, Number(count) || 0);
    setUnreadCount(safeCount);
    if (tables) {
      setUnreadTables(tables.filter((t) => t.unreadCount > 0));
    }
    updateAppBadge(safeCount);
    try {
      broadcastChannelRef.current?.postMessage({
        unreadCount: safeCount,
        unreadTables: tables,
      });
    } catch (e) { }
  }, []);

  const setUnreadCountSafe = useCallback((next: number | ((prev: number) => number)) => {
    setUnreadCount((prev) => {
      const resolved = typeof next === "function" ? (next as (p: number) => number)(prev) : next;
      const safeCount = Math.max(0, Number(resolved) || 0);
      const nextTables = safeCount === 0 ? [] : unreadTables;
      if (safeCount === 0) {
        setUnreadTables([]);
      }
      updateAppBadge(safeCount);
      try {
        broadcastChannelRef.current?.postMessage({
          unreadCount: safeCount,
          unreadTables: nextTables
        });
      } catch (e) { }
      return safeCount;
    });
  }, [unreadTables]);

  const clearUnreadForTable = useCallback((deviceId: string | number) => {
    const key = String(deviceId);
    setUnreadTables((prev) => {
      const existing = prev.find((t) => String(t.deviceId) === key);
      const next = prev.filter((t) => String(t.deviceId) !== key);
      if (existing && existing.unreadCount > 0) {
        setUnreadCount((prevCount) => {
          const safeCount = Math.max(0, prevCount - existing.unreadCount);
          updateAppBadge(safeCount);
          try {
            broadcastChannelRef.current?.postMessage({
              unreadCount: safeCount,
              unreadTables: next,
            });
          } catch (e) { }
          return safeCount;
        });
      } else {
        try {
          broadcastChannelRef.current?.postMessage({
            unreadCount,
            unreadTables: next,
          });
        } catch (e) { }
      }
      return next;
    });
  }, [unreadCount]);

  const incrementUnreadForTable = useCallback((deviceId: string | number, tableName?: string) => {
    const key = String(deviceId);
    setUnreadTables((prev) => {
      const existing = prev.find((t) => String(t.deviceId) === key);
      const next = existing
        ? prev.map((t) =>
          String(t.deviceId) === key
            ? { ...t, unreadCount: t.unreadCount + 1, tableName: tableName || t.tableName }
            : t
        )
        : [...prev, { deviceId: key, tableName: tableName || `Table ${key}`, unreadCount: 1 }];

      setUnreadCount((prevCount) => {
        const safeCount = Math.max(0, prevCount + 1);
        updateAppBadge(safeCount);
        try {
          broadcastChannelRef.current?.postMessage({
            unreadCount: safeCount,
            unreadTables: next,
          });
        } catch (e) { }
        return safeCount;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const fetchUnreadCount = async () => {
      try {
        const envApiUrl = import.meta.env.VITE_API_URL;
        const baseUrl = envApiUrl && envApiUrl !== "/api"
          ? envApiUrl
          : "https://cleverdining-2.onrender.com";

        const res = await fetch(
          `${baseUrl}/message/chat/unread-count/`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          syncUnreadState(data.unread_count || 0);
        } else {
          console.warn("Unread count returned non-OK status:", res.status);
          syncUnreadState(0);
        }
      } catch (error) {
        console.warn("Failed to fetch unread count (non-blocking):", error);
        syncUnreadState(0);
      }
    };

    fetchUnreadCount();
  }, [accessToken, syncUnreadState]);

  useEffect(() => {
    if (!accessToken) return;

    const fetchUnreadTables = async () => {
      try {
        const role = parseUser?.role;
        let endpoint = "/owners/devicesall/";
        if (role === "staff") endpoint = "/api/staff/devicesall/";
        if (role === "chef") endpoint = "/api/chef/devicesall/";

        const envApiUrl = import.meta.env.VITE_API_URL;
        const baseUrl = envApiUrl && envApiUrl !== "/api"
          ? envApiUrl
          : "https://cleverdining-2.onrender.com";

        const res = await fetch(`${baseUrl}${endpoint}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;

        const rows: UnreadTable[] = data
          .map((row: any) => ({
            deviceId: String(row?.id ?? row?.device_id ?? ""),
            tableName: String(row?.table_name || `Table ${row?.id ?? row?.device_id ?? ""}`),
            unreadCount: Number(row?.unread_count || 0),
          }))
          .filter((row: UnreadTable) => !!row.deviceId && row.unreadCount > 0);

        const total = rows.reduce((sum, row) => sum + row.unreadCount, 0);
        syncUnreadState(total, rows);
      } catch (error) {
        console.warn("Failed to fetch unread table list (non-blocking):", error);
      }
    };

    fetchUnreadTables();
  }, [accessToken, parseUser?.role, syncUnreadState]);

  useEffect(() => {
    if (!id || !accessToken) {
      console.warn(
        "Missing restaurant ID or access token, WebSocket connection skipped.",
        { restaurantId: id, hasAccessToken: !!accessToken }
      );
      return;
    }

    // We will handle closing via setWs internally to avoid stale closures

    const connectWebSocket = () => {
      setWs((prevWs) => {
        if (prevWs) {
          prevWs.onclose = null; // Prevent reconnect loop on cleanup
          prevWs.close();
        }
        return null;
      });

      console.log(`Connecting to Global WS: ${wsUrl}`);
      const socket = new WebSocket(wsUrl);
      setWs(socket);

      socket.onopen = () => {
        console.log("Global WebSocket connected");
        reconnectAttemptRef.current = 0; // Reset on successful connect
      };

      socket.onmessage = (event) => {
        try {
          const parsedMessage = JSON.parse(event.data);

          setResponse(parsedMessage);
          setMessages((prevMessages) => [...prevMessages, parsedMessage]);

          if (parsedMessage.type === "chat_message") {
            // Only increment for INCOMING device messages (customer -> staff)
            const isFromDevice = parsedMessage.is_from_device === true || parsedMessage.is_from_device === "true";

            if (isFromDevice) {
              console.log("Incrementing Global Unread Count (Incoming Device Msg)");
              const deviceId = parsedMessage.device_id ?? parsedMessage.table_id;
              if (deviceId !== undefined && deviceId !== null) {
                incrementUnreadForTable(deviceId, parsedMessage.table_name);
              } else {
                setUnreadCountSafe((prev) => prev + 1);
              }
            }
          }

          if (parsedMessage.type === "chat_cleared" || parsedMessage.type === "session_closed") {
            const targetDeviceId = parsedMessage.device_id ?? parsedMessage.table_id;
            if (targetDeviceId !== undefined && targetDeviceId !== null) {
              clearUnreadForTable(targetDeviceId);
            }
          }

          if (parsedMessage.type === "cash_payment_alert") {
            // Play Sound
            try {
              const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
              audio.play().catch(e => console.log("Audio play failed", e));
            } catch (e) { console.log(e); }

            // Show Toast
            toast((t) => (
              <div onClick={() => {
                toast.dismiss(t.id);
                window.location.href = "/dashboard/orders";
              }} className="cursor-pointer">
                <p className="font-bold">🔔 Cash Payment Alert!</p>
                <p>Table {parsedMessage.table_number}</p>
                <p>Total: {parsedMessage.total_amount}</p>
                {Number(parsedMessage.order?.tip_amount) > 0 && (
                  <p className="text-sm text-yellow-800 font-semibold">
                    Includes Tip: AED {parsedMessage.order.tip_amount}
                  </p>
                )}
              </div>
            ), {
              duration: 10000,
              position: 'top-right',
              style: {
                border: '2px solid #EAB308',
                padding: '16px',
                color: '#713200',
                background: '#FEF9C3'
              },
            });
          }

          // Handle Assistance Request Alerts from Tables
          if (parsedMessage.type === "chat_message" && parsedMessage.message_type === "alert") {
            // Play Alert Sound
            try {
              const audio = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
              audio.play().catch(e => console.log("Audio play failed", e));
            } catch (e) { console.log(e); }

            // Extract table info from message
            const messageText = parsedMessage.message || "A table needs assistance";

            // Show Prominent Toast
            toast((t) => (
              <div onClick={() => {
                toast.dismiss(t.id);
                window.location.href = "/dashboard/messages";
              }} className="cursor-pointer">
                <p className="font-bold text-lg">🔔 Assistance Requested!</p>
                <p className="text-sm">{messageText}</p>
                <p className="text-xs text-gray-500 mt-1">Click to respond</p>
              </div>
            ), {
              duration: 30000,
              position: 'top-center',
              style: {
                border: '3px solid #EF4444',
                padding: '20px',
                color: '#991B1B',
                background: '#FEE2E2',
                fontSize: '16px',
                boxShadow: '0 10px 25px rgba(239, 68, 68, 0.3)'
              },
            });
          }

        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      socket.onclose = () => {
        console.log("WebSocket connection closed");
        // Auto-reconnect with exponential backoff
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30s
        console.log(`Reconnecting in ${delay}ms (attempt ${attempt + 1})`);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptRef.current = attempt + 1;
          connectWebSocket();
        }, delay);
      };

      // Do not return socket, setWs controls it
    };

    connectWebSocket();

    // Reconnect on visibility change (when PWA comes to foreground)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("Dashboard visible, checking WebSocket connection...");
        setWs((prevWs) => {
          if (!prevWs || prevWs.readyState === WebSocket.CLOSED || prevWs.readyState === WebSocket.CLOSING) {
            connectWebSocket();
          }
          return prevWs;
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      setWs((prevWs) => {
        if (prevWs) {
          prevWs.onclose = null;
          prevWs.close();
        }
        return null;
      });
    };
  }, [wsUrl, id, accessToken, clearUnreadForTable, incrementUnreadForTable, setUnreadCountSafe]);

  const unreadTableSummary = unreadTables
    .slice(0, 2)
    .map((t) => t.tableName)
    .join(", ");

  return (
    <WebSocketContext.Provider
      value={{
        ws,
        messages,
        response,
        unreadCount,
        unreadTables,
        unreadTableSummary,
        setUnreadCount: setUnreadCountSafe,
        clearUnreadForTable,
        incrementUnreadForTable,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);

export default WebSocketProvider;
