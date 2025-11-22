import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from "react";

type WebSocketContextType = {
  ws: WebSocket | null;
  sendMessage: (message: string) => void;
  closeConnection: () => void;
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

  // Function to set the newMessage flag
  const setNewMessageFlag = (value: boolean) => {
    localStorage.setItem("newMessage", value ? "true" : "false");
    window.dispatchEvent(new Event("storage")); // Dispatch storage event for instant UI update
  };

  const connect = () => {
    const accessToken = localStorage.getItem("accessToken");
    const userInfo = localStorage.getItem("userInfo");
    const device_id = userInfo
      ? JSON.parse(userInfo).user?.restaurants[0].device_id
      : null;

    if (!device_id || !accessToken) return;

    const wsUrl = `wss://abc.winaclaim.com/ws/chat/${device_id}/?token=${accessToken}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("WebSocket connected");
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.message && typeof data.message === "string") {
        // Set the newMessage flag when a new message arrives
        setNewMessageFlag(true);
        console.log("New message received, notification set to true");
      }
    };

    socket.onclose = () => {
      console.log("WebSocket closed");
    };

    setWs(socket);
  };

  const sendMessage = (message: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "message", message }));
    }
  };

  const closeConnection = () => {
    if (ws) {
      ws.close();
    }
  };

  useEffect(() => {
    connect();
    return () => {
      closeConnection();
    };
  }, []);

  return (
    <WebSocketContext.Provider
      value={{ ws, sendMessage, closeConnection, setNewMessageFlag }}
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