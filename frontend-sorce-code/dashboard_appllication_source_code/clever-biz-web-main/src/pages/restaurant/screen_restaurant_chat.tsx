import { useEffect, useState, useRef, useContext } from "react";
import { useRole } from "@/hooks/useRole";
import { WebSocketContext } from "@/hooks/WebSocketProvider";
import axiosInstance from "@/lib/axios";
import { cachedGet } from "@/lib/requestCache";
import toast from "react-hot-toast";
import {
  Search,
  Send,
  CheckCircle2,
  MoreVertical,
  ArrowLeft
} from "lucide-react";
import { cn, getActiveRestaurantLocale, getActiveRestaurantTimezone } from "@/lib/utils";
import {
  getUnreadTableMessageIds,
  isActiveAssistanceStatus,
  isUnreadTableMessageStatus,
  mergeStaffTableChats,
  resetClearedChatHistory,
  sortChatsByLatestMessage,
} from "./chatListUtils";

// Types
interface ChatRoomItem {
  id: string;
  table_name: string;
  user_id: string;
  restaurant_id: string;
  restaurant?: string | number;
  unread_count?: number;
  active_guest_session_id?: string | number;
  last_message_time?: string;
  has_alert?: boolean;
  device_has_alert?: boolean;
  device_unread_count?: number;
  table_message_unread_count?: number;
  table_message_key?: string;
  source?: "device" | "table-message";
}

interface Message {
  id?: string | number;
  message: string;
  sender: string;
  timestamp: string | number;
  is_from_device: boolean;
  status?: string;
  type?: string;
}

interface TableMessage {
  id: string | number;
  restaurantId?: string | number;
  restaurant_id?: string | number;
  tableNumber?: number;
  table_number?: number;
  tableName?: string;
  table_name?: string;
  type?: string;
  message?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
}

type DeviceChatRow = Partial<ChatRoomItem> & {
  id?: string | number;
  device_id?: string | number;
  restaurant?: string | number;
  active_session_id?: string | number;
};

const normalizeDeviceChats = (rows: DeviceChatRow[]): ChatRoomItem[] =>
  rows.map((row) => {
    const unreadCount = Number(row?.unread_count || 0);
    const hasAlert = Boolean(row?.has_alert);

    return {
      ...row,
      id: String(row?.id ?? row?.device_id ?? ""),
      table_name: String(row?.table_name || `Table ${row?.id ?? row?.device_id ?? ""}`),
      user_id: String(row?.user_id ?? ""),
      restaurant_id: String(row?.restaurant_id ?? row?.restaurant ?? ""),
      active_guest_session_id: row?.active_guest_session_id ?? row?.active_session_id,
      unread_count: unreadCount,
      device_unread_count: unreadCount,
      has_alert: hasAlert,
      device_has_alert: hasAlert,
      source: "device" as const,
    };
  });

const combineMessages = (...messageGroups: Message[][]) => {
  const seen = new Set<string>();

  return messageGroups
    .flat()
    .filter((message) => {
      const key = [
        message.id ?? "",
        message.timestamp,
        message.message,
        message.type ?? "",
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (first, second) =>
        new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime(),
    );
};

// Utility for formatting time in Gulf Standard Time (GMT+4)
const formatTime = (ts: string | number) => {
  const date = new Date(ts);
  return date.toLocaleTimeString(getActiveRestaurantLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: getActiveRestaurantTimezone()
  });
};

const ScreenRestaurantChat = () => {
  const { userInfo } = useRole();
  const {
    clearUnreadForTable,
    messages: globalMessages,
    dashboardTables,
  } = useContext(WebSocketContext) || {};
  const [chatList, setChatList] = useState<ChatRoomItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatRoomItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const selectedChatRef = useRef<ChatRoomItem | null>(null);
  const tableMessageChatsRef = useRef<ChatRoomItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showClearChatModal, setShowClearChatModal] = useState(false);
  const isStaff = String(userInfo?.role || "").toLowerCase() === "staff";

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  useEffect(() => {
    if (!Array.isArray(dashboardTables)) return;
    const deviceChats = normalizeDeviceChats(dashboardTables as DeviceChatRow[]);
    const selectedId = isStaff ? selectedChatRef.current?.id : undefined;
    setChatList(
      isStaff
        ? mergeStaffTableChats(deviceChats, tableMessageChatsRef.current, selectedId)
        : deviceChats,
    );
  }, [dashboardTables, isStaff]);

  const mergeTableMessages = (rows: TableMessage[]) => {
    const grouped = new Map<string, { chat: ChatRoomItem; messages: Message[] }>();

    rows.forEach((row) => {
      const tableNumber = Number(row.tableNumber ?? row.table_number ?? 0);
      const tableName = String(row.tableName || row.table_name || (tableNumber ? `Table ${tableNumber}` : "Table"));
      const key = tableNumber ? `table-${tableNumber}` : `table-${tableName}`;
      const createdAt = row.createdAt || row.created_at || new Date().toISOString();
      const status = String(row.status || "").toLowerCase();
      const type = String(row.type || "chat").toLowerCase();
      const restaurantId = String(
        row.restaurantId
        ?? row.restaurant_id
        ?? userInfo?.restaurants?.[0]?.id
        ?? localStorage.getItem("restaurantId")
        ?? "",
      );

      if (!grouped.has(key)) {
        grouped.set(key, {
          chat: {
            id: key,
            table_name: tableName,
            user_id: "",
            restaurant_id: restaurantId,
            unread_count: 0,
            last_message_time: createdAt,
            has_alert: false,
            source: "table-message",
          },
          messages: [],
        });
      }

      const entry = grouped.get(key)!;
      entry.messages.push({
        id: row.id,
        message: String(row.message || ""),
        sender: "customer",
        timestamp: createdAt,
        is_from_device: true,
        status,
        type,
      });

      if (isUnreadTableMessageStatus(status)) {
        entry.chat.unread_count = Number(entry.chat.unread_count || 0) + 1;
      }
      if (
        (type === "assistance" || type === "call_waiter")
        && isActiveAssistanceStatus(status)
      ) {
        entry.chat.has_alert = true;
      }
      if (new Date(createdAt).getTime() > new Date(entry.chat.last_message_time || 0).getTime()) {
        entry.chat.last_message_time = createdAt;
      }
    });

    const tableMessageChats = Array.from(grouped.values()).map((entry) => entry.chat);
    tableMessageChatsRef.current = tableMessageChats;

    setMessageCache((prev) => {
      const next = { ...prev };
      grouped.forEach((entry, key) => {
        next[key] = entry.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });
      return next;
    });

    setChatList((prev) => {
      const deviceChats = prev.filter(
        (chat) => chat.source !== "table-message" && !String(chat.id).startsWith("table-"),
      );
      const selectedId = selectedChatRef.current?.id;
      return mergeStaffTableChats(deviceChats, tableMessageChats, selectedId);
    });
  };

  useEffect(() => {
    if (String(userInfo?.role || "").toLowerCase() !== "staff") {
      setChatList((previous) => previous.filter((chat) => chat.source !== "table-message"));
      return;
    }
    let cancelled = false;

    const fetchTableMessages = async () => {
      try {
        const { data } = await cachedGet("/api/table-messages", {}, { ttlMs: 1_500 });
        if (cancelled) return;
        const rows: TableMessage[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.messages)
            ? data.messages
            : Array.isArray(data?.data)
              ? data.data
              : [];
        mergeTableMessages(rows);
      } catch {
        // Existing WebSocket chat remains primary if this compatibility endpoint is unavailable.
      }
    };

    fetchTableMessages();
    const interval = window.setInterval(fetchTableMessages, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [userInfo?.role]);

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

        const { data } = await cachedGet(endpoint, {}, { ttlMs: 20_000 });
        if (!Array.isArray(data)) return;
        const deviceChats = normalizeDeviceChats(data);
        const selectedId = isStaff ? selectedChatRef.current?.id : undefined;
        setChatList(
          isStaff
            ? mergeStaffTableChats(deviceChats, tableMessageChatsRef.current, selectedId)
            : deviceChats,
        );
      } catch (error) {
        console.error("Failed to load chat list", error);
      }
    };
    fetchChats();
  }, [userInfo?.role, isStaff]);

  // 2. Unified WebSocket Connection (With Auto-Reconnect)
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!userInfo || !selectedChat) return;

    const jwt = localStorage.getItem("accessToken");
    if (!jwt || jwt === "guest_token") return;

    const restaurantId = selectedChat.restaurant_id
      || selectedChat.restaurant
      || userInfo?.restaurants?.[0]?.id
      || localStorage.getItem("restaurantId");
    if (!restaurantId) return;
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

  // Track processed messages to avoid double counting
  const processedMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!globalMessages || globalMessages.length === 0) return;

    const lastMsg = globalMessages[globalMessages.length - 1];

    if (!lastMsg) return;

    if (lastMsg.type === 'session_closed') {
      const affectedDeviceId = lastMsg.device_id ?? lastMsg.table_id;
      if (!affectedDeviceId) return;
      const normalizedId = String(affectedDeviceId);

      setChatList((prev) => prev.filter((chat) => String(chat.id) !== normalizedId));
      setMessageCache((prev) => {
        const next = { ...prev };
        delete next[normalizedId];
        return next;
      });

      if (selectedChatRef.current && String(selectedChatRef.current.id) === normalizedId) {
        setSelectedChat(null);
        setMessages([]);
      }

      if (clearUnreadForTable) {
        clearUnreadForTable(normalizedId);
      }
      return;
    }

    if (lastMsg.type === 'chat_cleared') {
      const affectedDeviceId = lastMsg.device_id ?? lastMsg.table_id;
      if (!affectedDeviceId) return;
      const normalizedId = String(affectedDeviceId);

      setChatList((prev) => resetClearedChatHistory(prev, [normalizedId]));
      setMessageCache((prev) => {
        const next = { ...prev };
        delete next[normalizedId];
        return next;
      });

      if (selectedChatRef.current && String(selectedChatRef.current.id) === normalizedId) {
        setSelectedChat((current) => (
          current
            ? resetClearedChatHistory([current], [normalizedId])[0]
            : current
        ));
        setMessages([]);
      }

      if (clearUnreadForTable) {
        clearUnreadForTable(normalizedId);
      }
      return;
    }

    if (lastMsg.type === 'chat_message') {
      // Generate a unique ID for the message if not present
      const msgId = lastMsg.id || `${lastMsg.device_id}-${lastMsg.timestamp}-${lastMsg.message}`;

      // If we already processed this message, skip
      if (processedMessageIdsRef.current.has(msgId)) {
        return;
      }
      processedMessageIdsRef.current.add(msgId);

      // Clean up old IDs to prevent memory leak (keep last 100)
      if (processedMessageIdsRef.current.size > 100) {
        const it = processedMessageIdsRef.current.values();
        processedMessageIdsRef.current.delete(it.next().value);
      }

      // Only process INCOMING messages (from device/customer)
      const isIncoming = lastMsg.is_from_device === true || lastMsg.is_from_device === "true";

      // 1. Update Chat List (Badges + Time)
      if (lastMsg.device_id) {
        setChatList(prevList => {
          const updatedChats = prevList.map(chat => {
            if (String(chat.id) === String(lastMsg.device_id)) {
              // Use REF to check current selection to avoid stale closure or dependency re-run issues
              const currentSelectedId = selectedChatRef.current?.id;
              const isCurrentlyOpen = String(currentSelectedId) === String(chat.id);

              // Increment badge only if incoming and not currently open
              const shouldIncrement = isIncoming && !isCurrentlyOpen;
              const tableUnread = Number(chat.table_message_unread_count || 0);
              const deviceUnread = Number(
                chat.device_unread_count
                ?? Math.max(0, Number(chat.unread_count || 0) - tableUnread),
              );
              const nextDeviceUnread = shouldIncrement ? deviceUnread + 1 : deviceUnread;

              return {
                ...chat,
                unread_count: isCurrentlyOpen ? 0 : nextDeviceUnread + tableUnread,
                device_unread_count: isCurrentlyOpen ? 0 : nextDeviceUnread,
                last_message_time: lastMsg.timestamp
              };
            }
            return chat;
          });
          return isStaff ? sortChatsByLatestMessage(updatedChats) : updatedChats;
        });
      }

      // 2. Redundancy: If this message belongs to the CURRENT OPEN chat, append it to 'messages' locally
      // Check against REF
      if (selectedChatRef.current && String(selectedChatRef.current.id) === String(lastMsg.device_id)) {
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
  }, [globalMessages, clearUnreadForTable, isStaff]); // selectedChat stays in a ref to avoid recounting on switch

  // Cache for chat messages: { [deviceId]: Message[] }
  const [messageCache, setMessageCache] = useState<Record<string, Message[]>>({});
  const messageCacheRef = useRef<Record<string, Message[]>>({});

  useEffect(() => {
    messageCacheRef.current = messageCache;
  }, [messageCache]);

  // 4. Fetch History on Selection + Clear Badge
  useEffect(() => {
    if (!selectedChat) return;

    // IMMEDIATELY clear local badge for this chat (optimistic UI)
    setChatList(prev => prev.map(c => c.id === selectedChat.id ? {
      ...c,
      unread_count: 0,
      device_unread_count: 0,
      table_message_unread_count: 0,
    } : c));
    if (clearUnreadForTable) {
      clearUnreadForTable(selectedChat.id);
    }

    const tableMessageKey = selectedChat.source === "table-message"
      ? selectedChat.id
      : selectedChat.table_message_key;
    const tableMessages = tableMessageKey
      ? messageCacheRef.current[tableMessageKey] || []
      : [];

    // LOAD FROM CACHE FIRST (Instant Load)
    if (messageCacheRef.current[selectedChat.id]) {
      console.log(`Loaded ${selectedChat.id} from cache`);
      setMessages(combineMessages(messageCacheRef.current[selectedChat.id], tableMessages));
    } else if (tableMessages.length > 0) {
      setMessages(tableMessages);
    } else {
      setMessages([]); // Clear if no cache to prevent showing wrong chat
    }

    if (tableMessageKey) {
      const messageIds = getUnreadTableMessageIds(
        tableMessages,
      );
      if (messageIds.length > 0) {
        axiosInstance.patch("/api/table-messages", {
          ids: messageIds,
          status: "acknowledged",
        }).catch((err) => {
          console.warn("table-message acknowledge failed (non-blocking):", err);
        });
      }
    }

    if (selectedChat.source === "table-message") {
      return;
    }

    const fetchHistory = async () => {
      try {
        const restaurantId = selectedChat.restaurant_id || selectedChat.restaurant;
        const { data } = await cachedGet(
          `/message/chat/?device_id=${selectedChat.id}&restaurant_id=${restaurantId}`,
          {},
          { ttlMs: 1_500, force: true },
        );
        const fetchedMessages = Array.isArray(data) ? data : [];

        const combinedMessages = combineMessages(fetchedMessages, tableMessages);
        setMessages(combinedMessages);

        // Update Cache
        setMessageCache(prev => ({
          ...prev,
          [selectedChat.id]: combinedMessages
        }));

        // Mark all as read on server (fire and forget, badge already cleared locally)
        axiosInstance.post(`/message/chat/mark-all-read/?device_id=${selectedChat.id}`).catch(err => {
          console.warn("mark-all-read failed (non-blocking):", err);
        });
      } catch (error) {
        console.error("Failed to fetch history", error);
      }
    };
    fetchHistory();
  }, [selectedChat, userInfo, clearUnreadForTable]);

  // 4. Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim() || !selectedChat) return;

    if (selectedChat.source === "table-message") {
      const staffMessage: Message = {
        id: `staff-${Date.now()}`,
        message: inputText,
        sender: "me",
        timestamp: Date.now(),
        is_from_device: false,
      };
      setMessages(prev => [...prev, staffMessage]);
      setMessageCache(prev => ({
        ...prev,
        [selectedChat.id]: [...(prev[selectedChat.id] || []), staffMessage],
      }));
      setInputText("");
      return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) return;

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

    // Update List Timestamp
    setChatList(prev => {
      const updatedChats = prev.map(c =>
          c.id === selectedChat.id
            ? { ...c, last_message_time: new Date().toISOString() }
            : c,
        );
      return isStaff ? sortChatsByLatestMessage(updatedChats) : updatedChats;
    });
    setInputText("");
  };


  // 5. Bulk Selection Logic
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkClearModal, setShowBulkClearModal] = useState(false);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkAcknowledge = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    // Optimistic Update
    setChatList(prev => prev.map(c => ids.includes(c.id) ? { ...c, unread_count: 0 } : c));
    setIsSelectionMode(false);
    setSelectedIds(new Set());
    toast.success("Messages acknowledged");

    // API Calls
    for (const id of ids) {
      const chat = chatList.find((item) => item.id === id);
      const tableMessageKey = chat?.source === "table-message"
        ? id
        : chat?.table_message_key;
      if (tableMessageKey) {
        const messageIds = (messageCache[tableMessageKey] || [])
          .map((message) => message.id)
          .filter((messageId) => messageId !== undefined);
        if (messageIds.length > 0) {
          axiosInstance.patch("/api/table-messages", {
            ids: messageIds,
            status: "acknowledged",
          }).catch(console.error);
        }
      }
      if (chat?.source !== "table-message" && !String(id).startsWith("table-")) {
        axiosInstance.post(`/message/chat/mark-all-read/?device_id=${id}`).catch(console.error);
      }
    }
  };

  const handleBulkClear = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setShowBulkClearModal(false);

    // Clear only the conversation state. The underlying table/device must remain.
    setChatList(prev => resetClearedChatHistory(prev, ids));

    // Clear message cache for deleted chats
    setMessageCache(prev => {
      const next = { ...prev };
      ids.forEach(id => delete next[id]);
      return next;
    });

    // If currently selected chat was deleted, deselect it
    if (selectedChat && ids.includes(selectedChat.id)) {
      setSelectedChat(null);
      setMessages([]);
    }

    setIsSelectionMode(false);
    setSelectedIds(new Set());
    toast.success(`${ids.length} chat${ids.length > 1 ? 's' : ''} deleted`);

    // API Calls to clear chats on backend
    for (const id of ids) {
      const chat = chatList.find((item) => item.id === id);
      const tableMessageKey = chat?.source === "table-message"
        ? id
        : chat?.table_message_key;
      if (tableMessageKey) {
        const messageIds = (messageCache[tableMessageKey] || [])
          .map((message) => message.id)
          .filter((messageId) => messageId !== undefined);
        if (messageIds.length > 0) {
          await axiosInstance.delete("/api/table-messages", {
            data: { ids: messageIds },
          }).catch(console.error);
        }
      }
      if (chat?.source !== "table-message" && !String(id).startsWith("table-")) {
        await axiosInstance.post('/message/chat/clear-chat/', { device_id: id }).catch(console.error);
      }
    }
  };

  const matchingChats = chatList.filter(c =>
    c.table_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredChats = isStaff
    ? sortChatsByLatestMessage(matchingChats)
    : matchingChats;

  return (
    <>
      <div className="flex flex-col gap-6 h-[calc(100dvh-7rem)] min-h-[420px]">

        {/* CHAT INTERFACE */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex overflow-hidden relative">

          {/* LEFT SIDEBAR (Chat List) */}
          <div className={cn(
            "w-full md:w-80 border-r border-slate-200 flex flex-col bg-slate-50 h-full absolute md:relative z-10",
            selectedChat ? "hidden md:flex" : "flex"
          )}>
            <div className="p-4 border-b border-slate-200 transition-all duration-300">

              {!isSelectionMode ? (
                // NORMAL HEADER
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-slate-900">Messages</h3>
                  <button
                    onClick={() => setIsSelectionMode(true)}
                    className="text-xs font-semibold text-[#0055FE] hover:bg-blue-50 px-2 py-1 rounded-md transition-colors"
                  >
                    Select
                  </button>
                </div>
              ) : (
                // SELECTION HEADER
                <div className="flex justify-between items-center mb-3 bg-blue-50/50 -mx-4 -mt-4 p-4 border-b border-blue-100">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }} className="text-slate-500 hover:text-slate-800">
                      <ArrowLeft size={16} />
                    </button>
                    <span className="font-bold text-slate-900 text-sm">{selectedIds.size} Selected</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleBulkAcknowledge}
                      disabled={selectedIds.size === 0}
                      className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md disabled:opacity-50"
                      title="Mark Read"
                    >
                      <CheckCircle2 size={18} />
                    </button>
                    <button
                      onClick={() => setShowBulkClearModal(true)}
                      disabled={selectedIds.size === 0}
                      className="p-1.5 text-red-600 hover:bg-red-100 rounded-md disabled:opacity-50"
                      title="Clear Chat"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                    </button>
                  </div>
                </div>
              )}

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
                const isSelected = selectedIds.has(chat.id);

                return (
                  <button
                    key={chat.id}
                    onClick={() => {
                      if (isSelectionMode) {
                        toggleSelection(chat.id);
                      } else {
                        setSelectedChat(chat);
                      }
                    }}
                    className={cn(
                      "w-full p-3 flex items-center gap-3 transition-colors text-left relative overflow-hidden rounded-r-lg group", // Modified rounded
                      isActive && !isSelectionMode ? "bg-[#0055FE]/5 border-l-2 border-l-[#0055FE]" : "hover:bg-slate-100 border-l-2 border-transparent",
                      isSelected && isSelectionMode ? "bg-blue-50 border-l-2 border-l-[#0055FE]" : ""
                    )}
                  >
                    {isSelectionMode ? (
                      <div className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0",
                        isSelected ? "bg-[#0055FE] border-[#0055FE]" : "border-slate-300 bg-white"
                      )}>
                        {isSelected && <CheckCircle2 size={12} className="text-white" />}
                      </div>
                    ) : (
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                        isActive ? "bg-blue-50 text-[#0055FE]" : "bg-slate-200 text-slate-600"
                      )}>
                        {chat.table_name.substring(0, 2)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className={cn("text-xs font-bold truncate flex items-center gap-1.5", isActive && !isSelectionMode ? "text-[#0055FE]" : "text-slate-900")}>
                          {chat.has_alert && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                          {chat.table_name}
                        </span>
                        {/* Unread Badge */}
                        {!isSelectionMode && !!chat.unread_count && chat.unread_count > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2">
                            {chat.unread_count}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] text-slate-500 truncate">
                          {isSelectionMode ? (isSelected ? "Selected" : "Tap to select") : "Tap to view conversation"}
                        </p>
                        <span className="text-[10px] text-slate-400">
                          {chat.last_message_time ? formatTime(chat.last_message_time) : ""}
                        </span>
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
                          onClick={() => setShowClearChatModal(true)}
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
                          "max-w-[85%] sm:max-w-[70%] rounded-2xl p-4 text-sm relative shadow-sm",
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

      {/* Clear Chat Confirmation Modal */}
      {
        showClearChatModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Clear Chat History</h3>
              <p className="text-sm text-slate-500 mb-6">
                Are you sure you want to clear all messages for <strong>{selectedChat?.table_name || 'this table'}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowClearChatModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!selectedChat) return;
                    try {
                      await axiosInstance.post('/message/chat/clear-chat/', { device_id: selectedChat.id });
                      setChatList((prev) => resetClearedChatHistory(prev, [selectedChat.id]));
                      setSelectedChat((current) => (
                        current
                          ? resetClearedChatHistory([current], [selectedChat.id])[0]
                          : current
                      ));
                      setMessageCache((prev) => {
                        const next = { ...prev };
                        delete next[selectedChat.id];
                        return next;
                      });
                      setMessages([]); // Clear locally
                      toast.success("Chat history cleared");
                    } catch (err) {
                      console.error(err);
                      toast.error("Failed to clear chat");
                    } finally {
                      setShowClearChatModal(false);
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                >
                  Clear Chat
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Bulk Clear Chat Confirmation Modal */}
      {
        showBulkClearModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Selected Chats</h3>
              <p className="text-sm text-slate-500 mb-6">
                Are you sure you want to delete <strong>{selectedIds.size} selected chat{selectedIds.size > 1 ? 's' : ''}</strong> and all messages inside them? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowBulkClearModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkClear}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                >
                  Delete Chats
                </button>
              </div>
            </div>
          </div>
        )
      }
    </>
  );
};

export default ScreenRestaurantChat;
