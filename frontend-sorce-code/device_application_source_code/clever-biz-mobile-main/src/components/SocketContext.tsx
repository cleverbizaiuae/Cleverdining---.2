import { createContext, useState, useEffect, ReactNode } from "react";

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
  const accessToken = localStorage.getItem("accessToken"); // Access token as a string

  // Use optional chaining to safely access the user ID
  const id = parseUser.user?.restaurants[0]?.id;

  const [ws, setWs] = useState<WebSocket | null>(null); // Type WebSocket
  const [messages, setMessages] = useState<Message[]>([]); // Type messages as an array of Message objects

  // Use environment variable or fallback to production WebSocket URL
  const WS_BASE_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";
  const wsUrl = `${WS_BASE_URL}/ws/alldatalive/${id}/?token=${accessToken}`;
  const [response, setResponse] = useState<Message | {}>({}); // Type response as Message or an empty object

  useEffect(() => {
    if (!id || !accessToken) {
      // User not logged in yet - WebSocket will connect after login
      // This is normal behavior, not an error
      return; // Prevent connection if no data
    }

    const socket = new WebSocket(wsUrl);
    setWs(socket); // Store the WebSocket connection

    socket.onopen = () => {
      console.log("WebSocket connected");
    };

    socket.onmessage = (event) => {
      setResponse(JSON.parse(event.data)); // Log raw message
      try {
        const parsedMessage = JSON.parse(event.data); // assuming it's JSON
        console.log("Parsed message:", parsedMessage); // Log parsed message
        setMessages((prevMessages) => [...prevMessages, parsedMessage]);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
        setMessages((prevMessages) => [...prevMessages, event.data]); // fallback to raw message
      }
    };
    console.log(response);
    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [wsUrl, id, accessToken]);

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
