import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from "react";
import toast from "react-hot-toast";

// Create a WebSocket context
export const WebSocketContext = createContext(null);

// Cross-tab sync channel
const BROADCAST_CHANNEL_NAME = 'cleverdining-unread-sync';

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
  const reconnectTimeoutRef = useRef<any>(null);
  const reconnectAttemptRef = useRef(0);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // 1. Get User & Token
  const parseUser = JSON.parse(localStorage.getItem("userInfo") || "{}");
  const accessToken = localStorage.getItem("accessToken");

  // 2. Robust ID Extraction
  let restaurantId = parseUser.restaurant_id || localStorage.getItem("restaurantId");
  if (!restaurantId && parseUser.restaurants && parseUser.restaurants.length > 0) {
    restaurantId = parseUser.restaurants[0].id;
  }

  const id = restaurantId;
  const wsUrl = `${import.meta.env.VITE_WS_URL || "ws://localhost:8000"}/ws/alldatalive/${id}/?token=${accessToken}`;

  // Cross-tab sync via BroadcastChannel
  useEffect(() => {
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannelRef.current = channel;

      channel.onmessage = (event) => {
        if (event.data && typeof event.data.unreadCount === 'number') {
          setUnreadCount(event.data.unreadCount);
          updateAppBadge(event.data.unreadCount);
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

  // Sync unread count changes to other tabs and app badge
  const syncUnreadCount = useCallback((count: number) => {
    setUnreadCount(count);
    updateAppBadge(count);
    try {
      broadcastChannelRef.current?.postMessage({ unreadCount: count });
    } catch (e) { }
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
          syncUnreadCount(data.unread_count || 0);
        } else {
          console.warn("Unread count returned non-OK status:", res.status);
          syncUnreadCount(0);
        }
      } catch (error) {
        console.warn("Failed to fetch unread count (non-blocking):", error);
        syncUnreadCount(0);
      }
    };

    fetchUnreadCount();
  }, [accessToken]);

  useEffect(() => {
    if (!id || !accessToken) {
      console.error(
        "Missing user ID or access token, WebSocket connection won't be established."
      );
      return;
    }

    // Close existing if any
    if (ws) {
      ws.close();
    }

    const connectWebSocket = () => {
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
              setUnreadCount((prev) => {
                const newCount = prev + 1;
                updateAppBadge(newCount);
                try {
                  broadcastChannelRef.current?.postMessage({ unreadCount: newCount });
                } catch (e) { }
                return newCount;
              });
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

      return socket;
    };

    const socket = connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [wsUrl, id, accessToken]);

  return (
    <WebSocketContext.Provider value={{ ws, messages, response, unreadCount, setUnreadCount: syncUnreadCount }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);

export default WebSocketProvider;
