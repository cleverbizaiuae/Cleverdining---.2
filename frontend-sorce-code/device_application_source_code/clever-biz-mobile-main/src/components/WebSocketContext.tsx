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
  // We use a Ref for the active socket to avoid stale closure issues in callbacks (like connect/handleVisibilityChange)
  const wsRef = React.useRef<WebSocket | null>(null);
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
    let device_id = parsedUserInfo?.user?.restaurants?.[0]?.device_id;
    let restaurant_id = parsedUserInfo?.user?.restaurants?.[0]?.id;

    // Fallback for Guest/Table Session (where structure is flat or different)
    if (!device_id) {
      device_id = parsedUserInfo?.table_id || parsedUserInfo?.device_id || parsedUserInfo?.user?.device_id;
    }
    if (!restaurant_id) {
      restaurant_id = parsedUserInfo?.restaurant_id || parsedUserInfo?.user?.restaurant_id;
    }

    if (!device_id) return;

    // Check against the Ref, which is always current
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return; // Already connecting or connected
    }

    // Use WSS for production fallback
    const defaultWsUrl = "wss://cleverdining-2.onrender.com";
    const wsBaseUrl = import.meta.env.VITE_WS_URL || defaultWsUrl;

    // Safety Check: If we are a guest (no accessToken) and have no guestSessionToken, do NOT connect.
    // This prevents connecting as an anonymous "ghost" with no session, which leads to lost messages.
    if ((!accessToken || accessToken === "guest_token") && !tokenToUse) {
      console.warn("WebSocket Context: Missing Guest Token, aborting connection to prevent history loss.");
      return;
    }

    const wsUrl = `${wsBaseUrl}/ws/chat/${device_id}/?token=${tokenToUse}&restaurant_id=${restaurant_id}`;

    console.log("Connecting to WebSocket:", wsUrl);
    const socket = new WebSocket(wsUrl);

    // Update both Ref and State
    wsRef.current = socket;
    setWs(socket);

    socket.onopen = () => {
      console.log("WebSocket connected");
      // Clear any pending reconnect attempts
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      // Force update state to trigger re-renders
      setWs(socket);
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
      wsRef.current = null;
      setWs(null);
      // Attempt reconnect
      if (!reconnectTimeout.current) {
        reconnectTimeout.current = setTimeout(() => {
          reconnectTimeout.current = null;
          connect();
        }, 3000);
      }
    };
  }, []); // Dependencies intentionaly empty to avoid recreating loop

  const sendMessage = (message: string, type: string = "message") => {
    // Use Ref for immediate check
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log(`DEBUG: Mobile Sending WS Payload: ${JSON.stringify({ message, type })}`);
      wsRef.current.send(JSON.stringify({ message, type }));
    } else {
      console.warn("DEBUG: Mobile WS not ready. Triggering reconnect.");
      // Try to reconnect if trying to send and disconnected
      connect();
    }
  };

  useEffect(() => {
    connect();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const socket = wsRef.current;
        if (!socket || socket.readyState === WebSocket.CLOSED) {
          console.log("App visible, reconnecting socket...");
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