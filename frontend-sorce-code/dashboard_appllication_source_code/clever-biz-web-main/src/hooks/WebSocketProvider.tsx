import React, { createContext, useState, useEffect, useContext } from "react";
import toast from "react-hot-toast";

// Create a WebSocket context
export const WebSocketContext = createContext(null);

const WebSocketProvider = ({ children }) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [response, setResponse] = useState({});
  const [unreadCount, setUnreadCount] = useState(0);

  // 1. Get User & Token
  const parseUser = JSON.parse(localStorage.getItem("userInfo") || "{}");
  const accessToken = localStorage.getItem("accessToken");

  // 2. Robust ID Extraction
  let restaurantId = parseUser.restaurant_id || localStorage.getItem("restaurantId");
  if (!restaurantId && parseUser.restaurants && parseUser.restaurants.length > 0) {
    restaurantId = parseUser.restaurants[0].id;
  }
  // If still null, maybe fallback? For now, just log.

  const id = restaurantId;
  const wsUrl = `${import.meta.env.VITE_WS_URL || "ws://localhost:8000"}/ws/alldatalive/${id}/?token=${accessToken}`;

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
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.unread_count || 0);
        }
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
      return;
    }

    // Close existing if any
    if (ws) {
      ws.close();
    }

    console.log(`Connecting to Global WS: ${wsUrl}`);
    const socket = new WebSocket(wsUrl);
    setWs(socket);

    socket.onopen = () => {
      console.log("Global WebSocket connected");
    };

    socket.onmessage = (event) => {
      // console.log("Global WS Message:", event.data);
      try {
        const parsedMessage = JSON.parse(event.data);
        // console.log("Parsed Global Message:", parsedMessage);

        setResponse(parsedMessage);
        setMessages((prevMessages) => [...prevMessages, parsedMessage]);

        if (parsedMessage.type === "chat_message") {
          // Only increment for INCOMING device messages (customer -> staff)
          const isFromDevice = parsedMessage.is_from_device === true || parsedMessage.is_from_device === "true";

          if (isFromDevice) {
            console.log("Incrementing Global Unread Count (Incoming Device Msg)");
            setUnreadCount((prev) => prev + 1);
          }
        }

        if (parsedMessage.type === "cash_payment_alert") {
          // Play Sound
          try {
            const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
            // Fallback audio or logic
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
  }, [wsUrl, id, accessToken]); // Removed volatile deps like setResponse/parseUser

  return (
    <WebSocketContext.Provider value={{ ws, messages, response, unreadCount, setUnreadCount }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);

export default WebSocketProvider;
