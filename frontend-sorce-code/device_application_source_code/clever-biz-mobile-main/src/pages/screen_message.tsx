/* eslint-disable @typescript-eslint/no-unused-vars */
import { FormEvent, useState, useEffect, useRef } from "react";
import { Send, User, Phone } from "lucide-react";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";
import { useMediaQuery } from "@uidotdev/usehooks";

type Message = {
  id: number;
  is_from_device: boolean;
  text: string;
  timestamp?: string; // Added timestamp support if available
};

const ScreenMessage = () => {
  return <MessagingUI />;
};

function MessagingUI() {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const isLargeDevice = useMediaQuery("only screen and (min-width : 993px)");

  const ws = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const userInfo = localStorage.getItem("userInfo");
  const device_id = userInfo
    ? JSON.parse(userInfo).user.restaurants[0].device_id
    : null;
  const restaurant_id = userInfo
    ? JSON.parse(userInfo).user.restaurants[0].id
    : null;

  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken");
    if (!userInfo || !accessToken) return;

    const wsUrl = `${import.meta.env.VITE_WS_URL || "ws://localhost:8000"}/ws/chat/${device_id}/?token=${accessToken}&restaurant_id=${restaurant_id}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message && typeof data.message === "string") {
          setMessages((prev) => [
            ...prev,
            {
              id: prev.length + 1,
              is_from_device: data.is_from_device,
              text: data.message,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            },
          ]);
          localStorage.setItem("newMessage", "true");
          setHasNewMessage(true);
        }
      } catch (error) {
        console.error("Error processing message:", event.data);
      }
    };

    ws.current.onclose = () => {
      console.log("WebSocket closed");
    };

    return () => {
      ws.current?.close();
    };
  }, [device_id, userInfo]);

  useEffect(() => {
    if (window.location.pathname === "/dashboard/message") {
      localStorage.setItem("newMessage", "false");
      window.dispatchEvent(new Event("storage"));
    }
  }, []);

  useEffect(() => {
    if (!userInfo) return;

    const fetchMessages = async () => {
      try {
        const response = await axiosInstance.get(
          `/message/chat/?device_id=${device_id}&restaurant_id=${restaurant_id}`
        );
        type ApiMessage = {
          id: number;
          is_from_device: boolean;
          message: string;
          created_at?: string;
        };
        const mapped = (response.data || []).map((msg: ApiMessage) => ({
          id: msg.id,
          is_from_device: msg.is_from_device,
          text: msg.message,
          timestamp: msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined
        }));

        setMessages(mapped);
      } catch {
        toast.error("Failed to load previous messages.");
        setMessages([]);
      }
    };
    if (device_id && restaurant_id) fetchMessages();
  }, [device_id, restaurant_id, userInfo]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSubmit = (e: FormEvent<HTMLElement>) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      toast.error("Connection lost. Please refresh the page.");
      return;
    }
    try {
      ws.current.send(
        JSON.stringify({
          type: "message",
          message: inputValue,
        })
      );
      setInputValue("");
    } catch {
      toast.error("Failed to send message");
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 relative overflow-hidden">
      {/* 1. Header Section */}
      <div className={`
        fixed top-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm
        ${isLargeDevice ? 'absolute' : 'fixed'}
      `}>
        <div className="flex items-center justify-between px-4 py-3 max-w-3xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center border-2 border-white shadow-sm">
                <User size={20} className="text-blue-600" />
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-gray-900 text-sm leading-tight">Restaurant Support</span>
              <span className="text-xs text-green-600 font-medium">Online</span>
            </div>
          </div>
          {/* Optional: Call button or other actions */}
          {/* <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <Phone size={20} className="text-gray-500" />
          </button> */}
        </div>
      </div>

      {/* 2. Chat Area */}
      <div className={`
        flex-1 overflow-y-auto w-full mx-auto
        ${isLargeDevice ? 'pt-20 pb-20 px-4' : 'pt-20 pb-32 px-3'}
      `}>
        <div className="flex flex-col space-y-3 max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center opacity-50 mt-10">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <Send size={24} className="text-gray-400" />
              </div>
              <p className="text-gray-500 text-sm">No messages yet.<br />Start the conversation!</p>
            </div>
          ) : (
            messages
              .filter((message) => message.text && message.text.trim() !== "")
              .map((message) => (
                <div
                  key={message.id}
                  className={`flex w-full ${message.is_from_device ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`
                    flex flex-col max-w-[80%] 
                    ${message.is_from_device ? 'items-end' : 'items-start'}
                  `}>
                    <div
                      className={`
                        px-4 py-2.5 text-sm shadow-sm relative
                        ${message.is_from_device
                          ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                          : 'bg-white text-gray-800 border border-gray-100 rounded-2xl rounded-tl-sm'
                        }
                      `}
                    >
                      {message.text}
                    </div>
                    {/* Timestamp (Optional) */}
                    {/* <span className="text-[10px] text-gray-400 mt-1 px-1">
                      {message.timestamp || 'Just now'}
                    </span> */}
                  </div>
                </div>
              ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 3. Input Section */}
      <div className={`
        z-40 w-full
        ${isLargeDevice
          ? 'absolute bottom-0 bg-white border-t border-gray-100 p-4'
          : 'fixed bottom-[80px] left-0 right-0 px-4 pointer-events-none' // Floating above nav bar
        }
      `}>
        <form
          onSubmit={handleSubmit}
          className={`
            flex items-center gap-2 max-w-3xl mx-auto w-full pointer-events-auto
            ${!isLargeDevice && 'bg-white p-2 rounded-full shadow-lg border border-gray-100'}
          `}
        >
          <input
            type="text"
            placeholder="Type a message..."
            className={`
              flex-1 text-sm bg-transparent border-none focus:ring-0 px-4 py-2
              ${isLargeDevice && 'bg-gray-100 rounded-full'}
            `}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className={`
              p-2.5 rounded-full flex-shrink-0 transition-all duration-200
              ${inputValue.trim()
                ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700 transform hover:scale-105'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            <Send size={18} className={inputValue.trim() ? 'ml-0.5' : ''} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default ScreenMessage;
