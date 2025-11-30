/* eslint-disable @typescript-eslint/no-unused-vars */
import { FormEvent, useState, useEffect, useRef } from "react";
import { Send, User, Phone, ChevronLeft, Wifi, Instagram, Star, Mic } from "lucide-react";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";
import { useMediaQuery } from "@uidotdev/usehooks";
import { useNavigate } from "react-router";
import { cn } from "clsx-for-tailwind";
import { motion } from "motion/react";

type Message = {
  id: number;
  is_from_device: boolean;
  text: string;
  timestamp?: string;
};

const ScreenMessage = () => {
  return <MessagingUI />;
};

function MessagingUI() {
  const navigate = useNavigate();
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

    // Robust WS URL resolution
    let wsBaseUrl = import.meta.env.VITE_WS_URL;
    if (!wsBaseUrl) {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      wsBaseUrl = apiUrl.replace(/^http/, 'ws');
    }

    const wsUrl = `${wsBaseUrl}/ws/chat/${device_id}/?token=${accessToken}&restaurant_id=${restaurant_id}`;

    try {
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

      ws.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        // toast.error("Connection error. Retrying...");
      };

      ws.current.onclose = () => {
        console.log("WebSocket closed");
      };
    } catch (e) {
      console.error("Failed to create WebSocket:", e);
    }

    return () => {
      ws.current?.close();
    };
  }, [device_id, restaurant_id, userInfo]);

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

  const presetMessages = [
    "I need assistance",
    "Where is my order?",
    "Call waiter",
    "Water please"
  ];

  const handlePresetClick = (msg: string) => {
    setInputValue(msg);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 relative overflow-hidden">
      {/* 1. Header Section (Sticky Top) */}
      <div className={cn(
        "fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 h-[80px] flex items-center",
        isLargeDevice ? 'absolute' : 'fixed'
      )}>
        <div className="flex items-center justify-between px-4 w-full max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1 -ml-2 rounded-full hover:bg-gray-100 text-gray-600"
            >
              <ChevronLeft size={24} />
            </button>

            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <User size={20} className="text-blue-600" />
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-gray-900 leading-tight">Assistant</span>
              <span className="text-xs font-medium text-green-600">Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Message Area (Main Content) */}
      <div className={cn(
        "flex-1 overflow-y-auto w-full mx-auto bg-gray-50",
        isLargeDevice ? 'pt-[80px] pb-[140px] px-4' : 'pt-[80px] pb-[160px] px-4'
      )}>
        <div className="flex flex-col space-y-4 max-w-3xl mx-auto py-4">
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
              .map((message, index) => (
                <motion.div
                  key={message.id}
                  className="flex flex-col w-full gap-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div
                    className={cn(
                      "flex w-full gap-3",
                      message.is_from_device ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {/* Avatar */}
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                      message.is_from_device ? "bg-gray-200" : "bg-blue-100"
                    )}>
                      {message.is_from_device ? (
                        <User size={16} className="text-gray-600" />
                      ) : (
                        <User size={16} className="text-blue-600" />
                      )}
                    </div>

                    {/* Bubble */}
                    <div className={cn(
                      "max-w-[85%] px-4 py-3 text-sm shadow-sm",
                      message.is_from_device
                        ? "bg-blue-600 text-white rounded-2xl rounded-tr-none"
                        : "bg-white text-gray-800 rounded-2xl rounded-tl-none"
                    )}>
                      {message.text}
                    </div>
                  </div>

                  {/* Welcome Message Actions - Only for first bot message */}
                  {!message.is_from_device && index === 0 && (
                    <div className="ml-11 flex flex-col gap-2 max-w-[85%]">
                      {/* WiFi Card */}
                      <div className="bg-blue-50 rounded-xl p-3 flex items-center gap-3 border border-blue-100">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-blue-600 shadow-sm">
                          <Wifi size={16} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs text-blue-600 font-medium">WiFi Password</span>
                          <span className="text-sm font-mono font-bold text-gray-800">Guest123</span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <button className="flex-1 bg-white rounded-xl p-2 flex items-center justify-center gap-2 border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">
                          <Instagram size={16} className="text-pink-600" />
                          <span className="text-xs font-medium text-gray-700">Instagram</span>
                        </button>
                        <button className="flex-1 bg-white rounded-xl p-2 flex items-center justify-center gap-2 border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">
                          <Star size={16} className="text-yellow-500 fill-yellow-500" />
                          <span className="text-xs font-medium text-gray-700">Rate Us</span>
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 3. Footer / Input Area (Fixed Bottom) */}
      <div className={cn(
        "z-40 w-full bg-white border-t border-gray-200",
        isLargeDevice
          ? 'absolute bottom-0'
          : 'fixed bottom-0 left-0 right-0'
      )}>
        <div className="max-w-3xl mx-auto w-full flex flex-col">
          {/* Preset Messages */}
          <div className="w-full overflow-x-auto no-scrollbar py-3 px-4 border-b border-gray-50">
            <div className="flex gap-2 min-w-max">
              {presetMessages.map((msg, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePresetClick(msg)}
                  className="px-4 py-2 rounded-full bg-gray-50 text-gray-600 text-xs font-medium hover:bg-blue-50 hover:text-blue-600 transition-colors whitespace-nowrap border border-gray-100"
                >
                  {msg}
                </button>
              ))}
            </div>
          </div>

          {/* Input Field Group */}
          <div className="p-4 pt-2 pb-6">
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 w-full bg-gray-50 rounded-full border border-gray-200 p-1 pr-2"
            >
              <button
                type="button"
                className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <Mic size={20} />
              </button>

              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-2 py-2 placeholder:text-gray-400"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />

              <button
                type="submit"
                disabled={!inputValue.trim()}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                  inputValue.trim()
                    ? "bg-blue-600 text-white shadow-md hover:bg-blue-700"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                <Send size={14} className={inputValue.trim() ? "ml-0.5" : ""} />
              </button>
            </form>

            {/* Branding */}
            <div className="text-center mt-3">
              <span className="text-[10px] uppercase text-gray-400 font-medium tracking-wider">
                Powered by Cleverbiz AI
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScreenMessage;
