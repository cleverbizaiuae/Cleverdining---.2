import React, { createContext, useState, useEffect, useContext } from "react";
import toast from "react-hot-toast";

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
          if (parsedMessage.sender !== parseUser.username) {
            setUnreadCount((prev) => prev + 1);
          }
        }

        if (parsedMessage.type === "cash_payment_alert") {
          // Play Sound
          try {
            const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg"); // Or local/base64
            // Fallback to a simple beep if external fails? 
            // Using a reliable URL or base64 is safer. Let's use a short beep base64.
            // Simple Beep Base64
            const beepBase64 = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"; // Truncated for brevity, let's use a real URL or ignore if complex.
            // Let's use the google sound for now, usually safe. Or just a standard browser beep isn't possible from JS.
            audio.src = "https://www.soundjay.com/buttons/sounds/beep-07.mp3";
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
