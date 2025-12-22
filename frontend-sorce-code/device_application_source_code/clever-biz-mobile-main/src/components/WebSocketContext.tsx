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

  // Function to set the newMessage flag
  const setNewMessageFlag = (value: boolean) => {
    localStorage.setItem("newMessage", value ? "true" : "false");
    setHasNewMessageState(value);
  };

  const connect = () => {
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

    const wsUrl = `${import.meta.env.VITE_WS_URL || "ws://localhost:8000"}/ws/chat/${device_id}/?token=${tokenToUse}&restaurant_id=${restaurant_id}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("WebSocket connected");
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
      console.log("WebSocket disconnected");
    };

    setWs(socket);
  };

  const sendMessage = (message: string, type: string = "message") => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ message, type }));
    }
  };

  useEffect(() => {
    connect();
    return () => {
      if (ws) {
        ws.close();
      }
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