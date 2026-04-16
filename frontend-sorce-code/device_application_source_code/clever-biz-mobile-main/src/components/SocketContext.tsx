import { createContext, useState, useEffect, ReactNode, useRef } from "react";
import { captureWebSocketFailure } from "../monitoring/sentry";

// Type definitions for the response and message data
interface Message {
  [key: string]: any; // Adjust this to the shape of your message data
}

interface WebSocketContextType {
  ws: WebSocket | null;
  messages: Message[];
  response: Message | {
    type: string,
    order: any
  };
}

// Create a WebSocket context
export const SocketContext = createContext<WebSocketContextType | null>(null);

interface SocketProviderProps {
  children: ReactNode;
}

const SocketProvider = ({ children }: SocketProviderProps) => {
  // Parse user info from localStorage with fallback to an empty object
  const parseUser = JSON.parse(localStorage.getItem("userInfo") || "{}");
  const accessToken = localStorage.getItem("accessToken");
  const guestSessionToken = localStorage.getItem("guest_session_token");

  // Use optional chaining to safely access the user ID. 
  // For guests, we might not have a typical user ID, but TableLanding sets user.restaurants[0].id
  // Also check localStorage for 'restaurant_id' which represents 'current restaurant' for guests
  const id = parseUser.user?.restaurants?.[0]?.id || localStorage.getItem("restaurant_id");

  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Use environment variable or fallback to production WebSocket URL
  const WS_BASE_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

  // Choose token: Access Token (Staff) > Guest Token (Customer)
  const tokenToUse = accessToken || guestSessionToken;
  const wsUrl = `${WS_BASE_URL}/ws/alldatalive/${id}/?token=${tokenToUse}`;

  const [response, setResponse] = useState<Message | {}>({});
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectWebSocket = () => {
    if (!id || !tokenToUse) {
      console.warn("WebSocket skipped: Missing ID or Token", { id, hasToken: !!tokenToUse });
      captureWebSocketFailure("WebSocket skipped: missing restaurant id or auth token", {
        feature: "websocket",
      });
      return;
    }

    // Close existing connection if any
    if (ws) {
      ws.close();
    }

    console.log("Connecting to WebSocket:", wsUrl);
    const socket = new WebSocket(wsUrl);
    setWs(socket);

    socket.onopen = () => {
      console.log("WebSocket connected");
      // Clear any pending reconnect timeout if connection succeeds
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    socket.onmessage = (event) => {
      setResponse(JSON.parse(event.data));
      try {
        const parsedMessage = JSON.parse(event.data);
        console.log("Parsed message:", parsedMessage);
        setMessages((prevMessages) => [...prevMessages, parsedMessage]);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
        setMessages((prevMessages) => [...prevMessages, event.data]);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      captureWebSocketFailure("WebSocket socket error", {
        endpoint: wsUrl,
        feature: "websocket",
      });
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed. Reconnecting in 3s...");
      // Auto-reconnect
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, 3000);
    };
  };

  useEffect(() => {
    connectWebSocket();

    // Reconnect on visibility change (when app comes to foreground)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("App visible, ensuring WebSocket connection...");
        // Only reconnect if socket is closed or null
        setWs(prevWs => {
          if (!prevWs || prevWs.readyState === WebSocket.CLOSED || prevWs.readyState === WebSocket.CLOSING) {
            connectWebSocket();
          }
          return prevWs;
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      // We don't close the socket here on unmount strictly because strict mode might close it prematurely 
      // but for production cleanliness:
      setWs(prevWs => {
        if (prevWs) prevWs.close();
        return null;
      });
    };
  }, [id, tokenToUse]); // Re-run only if ID or Token changes

  const value = {
    ws,
    messages,
    response,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};

export default SocketProvider;
