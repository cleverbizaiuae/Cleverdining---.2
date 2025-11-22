import React, { createContext, useState, useEffect } from "react";

// Create a WebSocket context
export const WebSocketContext = createContext(null);

const WebSocketProvider = ({ children }) => {
  const parseUser = JSON.parse(localStorage.getItem("userInfo") || "{}");
  const accessToken = localStorage.getItem("accessToken"); // Access token as a string

  const id = parseUser.restaurants?.[0]?.id; // safer optional chaining
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const wsUrl = `wss://abc.winaclaim.com/ws/alldatalive/${id}/?token=${accessToken}`;
  const [response, setResponse] = useState({});

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
  }, [wsUrl, id, accessToken, setResponse]);
 
  return (
    <WebSocketContext.Provider value={{ ws, messages, response }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketProvider;
