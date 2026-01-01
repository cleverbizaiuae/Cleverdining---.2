import { useEffect, useState, useRef, useContext } from "react";
import { useRole } from "@/hooks/useRole";
import { WebSocketContext } from "@/hooks/WebSocketProvider";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import {
  Search,
  Send,
  Bell,
  CheckCircle2,
  Clock,
  MoreVertical,
  ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface ChatRoomItem {
  id: string;
  table_name: string;
  user_id: string;
  restaurant_id: string;
  restaurant?: string | number;
  unread_count?: number;
  active_guest_session_id?: string | number;
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
  const { setUnreadCount } = useContext(WebSocketContext) || {};
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
        let endpoint;
        const role = userInfo?.role; // userInfo from useRole hook

        if (role === "owner") {
          endpoint = "/owners/devicesall/";
        } else if (role === "staff") {
          endpoint = "/api/staff/devicesall/";
        } else if (role === "chef") {
          endpoint = "/api/chef/devicesall/";
        } else {
          endpoint = "/owners/devicesall/"; // Fallback
        }

        const { data } = await axiosInstance.get(endpoint);
        setChatList(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load chat list", error);
      }
    };
    fetchChats();
  }, []);

  // 2. Unified WebSocket Connection (With Auto-Reconnect)
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!userInfo || !selectedChat) return;

    const jwt = localStorage.getItem("accessToken");
    if (!jwt || jwt === "guest_token") return;

    const restaurantId = selectedChat.restaurant_id || selectedChat.restaurant;
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const wsBaseUrl = import.meta.env.VITE_WS_URL || baseUrl.replace(/^http/, "ws");
    const wsUrl = `${wsBaseUrl}/ws/chat/restaurant/${restaurantId}/?token=${jwt}`;

    const connect = () => {
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      console.log(`Connecting to Unified Chat Room: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setSocket(ws);

      ws.onopen = () => {
        console.log("Unified Chat WS Connected");
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        // ... (Same Message Logic) ...
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'chat_message') {
            console.log("Dashboard Received WS Data:", data);

            const isRelevant =
              (data.guest_session_id && String(data.guest_session_id) === String(selectedChat.active_guest_session_id)) ||
              (data.device_id && String(data.device_id) === String(selectedChat.id));

            if (isRelevant || data.sender === "You") {
              setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.message === data.message && (Date.now() - new Date(lastMsg.timestamp).getTime() < 2000)) {
                  return prev;
                }

                // Bulletproof boolean conversion
                const isFromDevice = data.is_from_device === true || data.is_from_device === "true" || data.is_from_device === "True";

                return [...prev, {
                  message: data.message,
                  sender: data.sender || "unknown",
                  timestamp: data.timestamp || Date.now(),
                  is_from_device: isFromDevice
                }];
              });
            } else {
              console.log("Dashboard Message Filtered Out:", {
                relevant: isRelevant,
                msgDeviceId: data.device_id,
                chatId: selectedChat.id
              });
            }
          }
        } catch (e) {
          console.error("Dashboard WS Error:", e);
        }
      };

      ws.onerror = (e) => console.error("WS Error", e);

      ws.onclose = () => {
        console.log("Unified Chat WS Closed. Reconnecting in 3s...");
        wsRef.current = null;
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [selectedChat, userInfo]);

  // 3. Global WebSocket Listener for Real-time List Updates
  const { messages: globalMessages } = useContext(WebSocketContext) || {};

  useEffect(() => {
    if (!globalMessages || globalMessages.length === 0) return;

    const lastMsg = globalMessages[globalMessages.length - 1];

    if (lastMsg && lastMsg.type === 'chat_message') {
      // Only process INCOMING messages (from device/customer)
      const isIncoming = lastMsg.is_from_device === true || lastMsg.is_from_device === "true";

      // 1. Update Chat List (Badges) - only for incoming messages
      if (isIncoming && lastMsg.device_id) {
        setChatList(prevList => {
          return prevList.map(chat => {
            if (String(chat.id) === String(lastMsg.device_id)) {
              const isCurrentlyOpen = selectedChat?.id === chat.id;
              // If this chat is currently open, don't increment badge
              if (isCurrentlyOpen) return chat;

              return {
                ...chat,
                unread_count: (chat.unread_count || 0) + 1,
              };
            }
            return chat;
          });
        });
      }

      // 2. Redundancy: If this message belongs to the CURRENT OPEN chat, append it to 'messages' locally
      if (selectedChat && String(selectedChat.id) === String(lastMsg.device_id)) {
        setMessages(prev => {
          // Dedup check
          const alreadyExists = prev.some(m =>
            m.message === lastMsg.message &&
            Math.abs(new Date(m.timestamp).getTime() - new Date(lastMsg.timestamp).getTime()) < 2000
          );
          if (alreadyExists) return prev;

          // Bulletproof boolean conversion
          const isFromDevice = lastMsg.is_from_device === true || lastMsg.is_from_device === "true" || lastMsg.is_from_device === "True";

          return [...prev, {
            message: lastMsg.message,
            sender: lastMsg.sender,
            timestamp: lastMsg.timestamp,
            is_from_device: isFromDevice
          }];
        });
      }
    }
  }, [globalMessages, selectedChat]); // Re-run when globalMessages changes

  // 4. Fetch History on Selection + Clear Badge
  useEffect(() => {
    if (!selectedChat) return;

    // IMMEDIATELY clear local badge for this chat (optimistic UI)
    const currentUnread = chatList.find(c => c.id === selectedChat.id)?.unread_count || 0;
    setChatList(prev => prev.map(c => c.id === selectedChat.id ? { ...c, unread_count: 0 } : c));

    // Also decrement global count immediately
    if (currentUnread > 0 && setUnreadCount) {
      setUnreadCount((prev: number) => Math.max(0, prev - currentUnread));
    }

    const fetchHistory = async () => {
      try {
        const restaurantId = selectedChat.restaurant_id || selectedChat.restaurant;
        const { data } = await axiosInstance.get(`/message/chat/?device_id=${selectedChat.id}&restaurant_id=${restaurantId}`);
        setMessages(Array.isArray(data) ? data : []);

        // Mark all as read on server (fire and forget, badge already cleared locally)
        axiosInstance.post(`/message/chat/mark-all-read/?device_id=${selectedChat.id}`).catch(err => {
          console.warn("mark-all-read failed (non-blocking):", err);
        });
      } catch (error) {
        console.error("Failed to fetch history", error);
      }
    };
    fetchHistory();
  }, [selectedChat, userInfo, setUnreadCount]);

  // 4. Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim() || !socket || socket.readyState !== WebSocket.OPEN || !selectedChat) return;

    const payload = {
      type: "message",
      message: inputText,
      device_id: selectedChat.id, // Target device
      guest_session_id: selectedChat.active_guest_session_id // Target session
    };
    console.log("Dashboard Sending WS Payload:", payload);
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
      {/* Spec: Blue/Indigo Gradient - Light Theme */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[#0055FE]/10 flex items-center justify-center">
            <Bell size={20} className="text-[#0055FE]" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-[#0055FE]">New Messages</h3>
            <p className="text-slate-600 text-sm">You have unread requests. Check table list.</p>
          </div>
        </div>
        <button
          onClick={() => toast.success("All messages acknowledged")}
          className="px-4 py-2 bg-[#0055FE] text-white font-semibold rounded-lg text-sm hover:bg-[#0047D1] transition-colors shadow-md shadow-blue-500/10"
        >
          Acknowledge
        </button>
      </div>

      {/* CHAT INTERFACE */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex overflow-hidden relative">

        {/* LEFT SIDEBAR (Chat List) */}
        <div className={cn(
          "w-full md:w-80 border-r border-slate-200 flex flex-col bg-slate-50 h-full absolute md:relative z-10",
          selectedChat ? "hidden md:flex" : "flex"
        )}>
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
                    "w-full p-3 flex items-center gap-3 transition-colors text-left relative overflow-hidden rounded-r-lg", // Modified rounded
                    isActive ? "bg-[#0055FE]/5 border-l-2 border-l-[#0055FE]" : "hover:bg-slate-100 border-l-2 border-transparent"
                  )}
                >

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
                      {/* Unread Badge */}
                      {!!chat.unread_count && chat.unread_count > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2">
                          {chat.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] text-slate-500 truncate">Tap to view conversation</p>
                      <span className="text-[10px] text-slate-400">12:30 PM</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT AREA (Chat Window) */}
        <div className={cn(
          "flex-1 flex flex-col relative bg-white h-full",
          !selectedChat ? "hidden md:flex" : "flex"
        )}>
          {selectedChat ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-full">
                    <ArrowLeft size={20} />
                  </button>
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
                <div className="flex items-center gap-2 relative">
                  {/* Dropdown Menu */}
                  <div className="relative group">
                    <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors focus:outline-none">
                      <MoreVertical size={18} />
                    </button>
                    {/* Dropdown Content */}
                    <div className="absolute right-0 mt-2 w-36 bg-white border border-slate-100 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                      <button
                        onClick={async () => {
                          if (!selectedChat) return;
                          if (window.confirm("Are you sure you want to clear this chat history?")) {
                            try {
                              await axiosInstance.post('/message/chat/clear-chat/', { device_id: selectedChat.id });
                              setMessages([]); // Clear locally
                              toast.success("Chat history cleared");
                            } catch (err) {
                              console.error(err);
                              toast.error("Failed to clear chat");
                            }
                          }
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg block"
                      >
                        Clear Chat
                      </button>
                    </div>
                  </div>
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