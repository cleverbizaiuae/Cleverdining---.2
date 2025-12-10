/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef } from "react";
import { useRole } from "@/hooks/useRole";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import {
  Search,
  Send,
  Bell,
  CheckCircle2,
  Clock,
  MoreVertical,
  Phone,
  Video
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface ChatRoomItem {
  id: string;
  table_name: string;
  user_id: string;
  restaurant_id: string;
}

interface Message {
  message: string;
  sender: string;
  timestamp: string | number;
  is_from_device: boolean;
}

// Utility for formatting time
const formatTime = (ts: string | number) => {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const ScreenRestaurantChat = () => {
  const { userInfo } = useRole();
  const [chatList, setChatList] = useState<ChatRoomItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatRoomItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Chat List (Tables)
  useEffect(() => {
    const fetchChats = async () => {
      try {
        const { data } = await axiosInstance.get("/owners/devicesall/");
        setChatList(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load chat list", error);
      }
    };
    fetchChats();
  }, []);

  // 2. WebSocket Connection for Selected Chat
  useEffect(() => {
    if (!selectedChat) return;

    const jwt = localStorage.getItem("accessToken");
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const wsBaseUrl = import.meta.env.VITE_WS_URL || baseUrl.replace(/^http/, "ws");
    // WebSocket URL pattern based on utilities.tsx analysis: /ws/call/{device_id}/
    const wsUrl = `${wsBaseUrl}/ws/call/${selectedChat.id}/?token=${jwt}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log("Chat WS Connected:", selectedChat.table_name);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.message) {
        setMessages(prev => [...prev, {
          message: data.message,
          sender: data.sender || "unknown",
          timestamp: Date.now(),
          is_from_device: true // Received messages are from device
        }]);
      }
    };

    ws.onerror = (e) => console.error("WS Error", e);
    ws.onclose = () => console.log("Chat WS Closed");

    setSocket(ws);

    return () => ws.close();
  }, [selectedChat]);

  // 3. Fetch History on Selection
  useEffect(() => {
    if (!selectedChat) return;
    const fetchHistory = async () => {
      try {
        // Endpoint pattern from utilities.tsx: /message/chat/?device_id=...&restaurant_id=...
        const restaurantId = userInfo?.restaurants?.[0]?.id;
        const { data } = await axiosInstance.get(`/message/chat/?device_id=${selectedChat.id}&restaurant_id=${restaurantId}`);
        setMessages(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to fetch history", error);
      }
    };
    fetchHistory();
  }, [selectedChat, userInfo]);

  // 4. Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim() || !socket || socket.readyState !== WebSocket.OPEN) return;

    const payload = { type: "message", message: inputText };
    socket.send(JSON.stringify(payload));

    // Optimistic UI update
    setMessages(prev => [...prev, {
      message: inputText,
      sender: "me",
      timestamp: Date.now(),
      is_from_device: false
    }]);
    setInputText("");
  };

  const filteredChats = chatList.filter(c =>
    c.table_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-6rem)]">

      {/* ALERT BANNER */}
      {/* Spec: Blue/Indigo Gradient */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 shadow-lg text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <Bell size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg">New Messages</h3>
            <p className="text-indigo-100 text-sm">You have 0 unread messages from customers.</p>
          </div>
        </div>
        <button className="px-4 py-2 bg-white text-indigo-600 font-semibold rounded-lg text-sm hover:bg-indigo-50 transition-colors">
          Mark All Read
        </button>
      </div>

      {/* CHAT INTERFACE */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex overflow-hidden">

        {/* LEFT SIDEBAR (Chat List) */}
        <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50">
          <div className="p-4 border-b border-slate-200">
            <h3 className="font-bold text-slate-900 mb-3">Messages</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Search tables..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-[#0055FE]"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredChats.map(chat => {
              const isActive = selectedChat?.id === chat.id;
              return (
                <button
                  key={chat.id}
                  onClick={() => setSelectedChat(chat)}
                  className={cn(
                    "w-full p-3 rounded-lg flex items-center gap-3 transition-colors text-left relative overflow-hidden",
                    isActive ? "bg-white shadow border border-slate-100 ring-1 ring-[#0055FE]/20" : "hover:bg-slate-100 border border-transparent"
                  )}
                >
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#0055FE]" />}
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                    isActive ? "bg-blue-50 text-[#0055FE]" : "bg-slate-200 text-slate-600"
                  )}>
                    {chat.table_name.substring(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className={cn("text-xs font-bold truncate", isActive ? "text-[#0055FE]" : "text-slate-900")}>
                        {chat.table_name}
                      </span>
                      {/* Mock Time */}
                      <span className="text-[10px] text-slate-400">12:30 PM</span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">Tap to view conversation</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT AREA (Chat Window) */}
        <div className="flex-1 flex flex-col relative bg-white">
          {selectedChat ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0055FE]/10 flex items-center justify-center text-[#0055FE] font-bold">
                    {selectedChat.table_name.substring(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{selectedChat.table_name}</h3>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                      <span className="text-xs text-slate-500">Online</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 text-slate-400 hover:text-[#0055FE] hover:bg-blue-50 rounded-lg transition-colors">
                    <Phone size={18} />
                  </button>
                  <button className="p-2 text-slate-400 hover:text-[#0055FE] hover:bg-blue-50 rounded-lg transition-colors">
                    <Video size={18} />
                  </button>
                  <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                    <MoreVertical size={18} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50" ref={scrollRef}>
                {messages.map((msg, idx) => {
                  const isCustomer = msg.is_from_device;
                  return (
                    <div key={idx} className={cn("flex w-full", isCustomer ? "justify-start" : "justify-end")}>
                      <div className={cn(
                        "max-w-[70%] rounded-2xl p-4 text-sm relative shadow-sm",
                        isCustomer
                          ? "bg-white text-slate-800 rounded-tl-none border border-slate-100"
                          : "bg-[#0055FE] text-white rounded-tr-none"
                      )}>
                        <p>{msg.message}</p>
                        <p className={cn(
                          "text-[10px] mt-1 text-right",
                          isCustomer ? "text-slate-400" : "text-blue-200"
                        )}>
                          {formatTime(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input Area */}
              <div className="p-4 border-t border-slate-200 bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type your message..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 transition-all"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim()}
                    className="bg-[#0055FE] hover:bg-[#0047D1] disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 rounded-lg flex items-center justify-center transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-slate-50/30">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Search size={32} className="text-slate-300" />
              </div>
              <h3 className="text-slate-900 font-semibold mb-1">No Chat Selected</h3>
              <p className="text-sm">Select a table from the sidebar to start messaging.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ScreenRestaurantChat;