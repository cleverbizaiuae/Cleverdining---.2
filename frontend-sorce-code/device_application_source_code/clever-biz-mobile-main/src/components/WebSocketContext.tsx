import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from "react";

type WebSocketContextType = {
  ws: WebSocket | null;
  hasNewMessage: boolean;
  sendMessage: (message: string, type?: string) => void;
  setNewMessageFlag: (value: boolean) => void;
};

const WebSocketContext = createContext<WebSocketContextType | undefined>(
  undefined
);

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
}) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [hasNewMessage, setHasNewMessageState] = useState<boolean>(() => {
    return localStorage.getItem("newMessage") === "true";
  });
  const reconnectTimeout = React.useRef<NodeJS.Timeout | null>(null);

  // Function to set the newMessage flag
  const setNewMessageFlag = (value: boolean) => {
    localStorage.setItem("newMessage", value ? "true" : "false");
    setHasNewMessageState(value);
  };

  const connect = React.useCallback(() => {
    const accessToken = localStorage.getItem("accessToken");
    const guestSessionToken = localStorage.getItem("guest_session_token");

    // Use Guest Token if Access Token is "guest_token" marker or missing
    let tokenToUse = accessToken;
    if (!accessToken || accessToken === "guest_token") {
      tokenToUse = guestSessionToken || "";
    }

    const userInfo = localStorage.getItem("userInfo");
    const parsedUserInfo = userInfo ? JSON.parse(userInfo) : null;
    const device_id = parsedUserInfo?.user?.restaurants?.[0]?.device_id;
    const restaurant_id = parsedUserInfo?.user?.restaurants?.[0]?.id;

    if (!device_id) return;

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return; // Already connecting or connected
    }

    const wsUrl = `${import.meta.env.VITE_WS_URL || "ws://localhost:8000"}/ws/chat/${device_id}/?token=${tokenToUse}&restaurant_id=${restaurant_id}`;
    console.log("Connecting to WebSocket:", wsUrl);
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("WebSocket connected");
      // Clear any pending reconnect attempts
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'order_status_update' && data.session_ended) {
        console.log("Session Ended via WebSocket");
        localStorage.removeItem("userInfo");
        localStorage.removeItem("guest_session_token");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("pending_order_id");
        window.location.href = "/dashboard/success";
        return;
      }

      if (data.message && typeof data.message === "string") {
        // Set the newMessage flag when a new message arrives
        setNewMessageFlag(true);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected. Attempting reconnect in 3s...");
      setWs(null);
      // Attempt reconnect
      if (!reconnectTimeout.current) {
        reconnectTimeout.current = setTimeout(() => {
          reconnectTimeout.current = null;
          connect();
        }, 3000);
      }
    };

    setWs(socket);
  }, []); // Dependencies intentionaly empty to avoid recreating loop

  const sendMessage = (message: string, type: string = "message") => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ message, type }));
    } else {
      // Try to reconnect if trying to send and disconnected
      connect();
    }
  };

  useEffect(() => {
    connect();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const socket = ws;
        if (!socket || socket.readyState === WebSocket.CLOSED) {
          console.log("App visible, reconnecting socket...");
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (ws) {
        // We typically don't strictly close on unmount of Provider unless app is closing, 
        // to prevent churn, but here we can clean up if completely unmounting.
        ws.onclose = null; // Prevent reconnect loop on unmount
        ws.close();
      }
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, []);

  return (
    <WebSocketContext.Provider
      value={{ ws, hasNewMessage, setNewMessageFlag, sendMessage }}
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