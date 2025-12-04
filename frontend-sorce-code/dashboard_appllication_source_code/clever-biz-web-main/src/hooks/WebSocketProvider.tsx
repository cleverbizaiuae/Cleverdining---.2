import React, { createContext, useState, useEffect, useContext } from "react";

// Create a WebSocket context
export const WebSocketContext = createContext(null);

const WebSocketProvider = ({ children }) => {
  const parseUser = JSON.parse(localStorage.getItem("userInfo") || "{}");
  const accessToken = localStorage.getItem("accessToken"); // Access token as a string

  const id = parseUser.restaurants?.[0]?.id; // safer optional chaining
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const wsUrl = `${import.meta.env.VITE_WS_URL || "ws://localhost:8000"}/ws/alldatalive/${id}/?token=${accessToken}`;
  const [response, setResponse] = useState({});

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!accessToken) return;

    const fetchUnreadCount = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/message/chat/unread-count/`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        const data = await res.json();
        setUnreadCount(data.unread_count || 0);
      } catch (error) {
        console.error("Failed to fetch unread count:", error);
      }
    };

    fetchUnreadCount();
  }, [accessToken]);

  useEffect(() => {
    if (!id || !accessToken) {
      console.error(
        "Missing user ID or access token, WebSocket connection won't be established."
      );
      return; // Prevent connection if no data
    }

    const socket = new WebSocket(wsUrl);
    setWs(socket); // Store the WebSocket connection

    socket.onopen = () => {
      console.log("WebSocket connected");
    };

    socket.onmessage = (event) => {
      console.log(event);
      setResponse(JSON.parse(event.data)); // Log raw message
      try {
        const parsedMessage = JSON.parse(event.data); // assuming it's JSON
        console.log("Parsed message:", parsedMessage); // Log parsed message
        setMessages((prevMessages) => [...prevMessages, parsedMessage]);

        if (parsedMessage.type === "chat_message") {
          // If message is NOT from me (assuming 'sender' field exists and differs from current user)
          // For now, just increment. Ideally check sender.
          // But wait, if I am the sender, I shouldn't increment.
          // parsedMessage.sender is the username.
          // parseUser.username is available?
          if (parsedMessage.sender !== parseUser.username) {
            setUnreadCount((prev) => prev + 1);
          }
        }

      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
        setMessages((prevMessages) => [...prevMessages, event.data]); // fallback to raw message
      }
    };

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
  }, [wsUrl, id, accessToken, setResponse, parseUser.username]);

  return (
    <WebSocketContext.Provider value={{ ws, messages, response, unreadCount, setUnreadCount }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);

export default WebSocketProvider;
