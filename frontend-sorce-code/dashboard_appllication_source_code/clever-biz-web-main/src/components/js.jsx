import React, { useEffect, useMemo, useRef, useState } from "react";
import { IoCall } from "react-icons/io";
import { IconSend } from "@tabler/icons-react";
import { cn } from "@/lib/utils"; // adjust if your cn helper lives elsewhere
import { axiosInstance } from "@/lib/axios"; // adjust your path
import { useRole } from "@/hooks/useRole"; // adjust your path
import { toast } from "react-hot-toast";
import TextSearchBoxCompact from "@/components/common/TextSearchBoxCompact"; // adjust path
import ModalCallConfirm from "@/components/modals/ModalCallConfirm"; // adjust path
import ModalCall from "@/components/modals/ModalCall"; // adjust path

/**
 * ✅ Features covered
 *  - Red dot with unread count (shows "9+" at 10+)
 *  - Real-time updates via WebSocket
 *  - Clears when chat is opened/read
 *  - Works across chat switching and reconnections (auto-retry)
 *  - Handles large numbers gracefully
 */

// ===== Types =====
export type ChatRoomItem = {
  id: number | string;
  table_name: string;
  user_id: number | string;
  last_message_at?: string;
  unread_count?: number; // optional from server
  /** frontend managed unread counter */
  unread?: number;
};

// ===== Utils =====
const formatTimestamp = (ts?: string | number | Date) => {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const safeId = (id: string | number | undefined | null) => String(id ?? "");

// Persist unread counts across refresh
const loadUnreadMap = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem("unreadCounts");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveUnreadMap = (map: Record<string, number>) => {
  try {
    localStorage.setItem("unreadCounts", JSON.stringify(map));
  } catch {}
};

// Merge current list with persisted counts, preferring server unread_count if provided
const mergeUnread = (list: ChatRoomItem[]): ChatRoomItem[] => {
  const stored = loadUnreadMap();
  return list.map((c) => {
    const id = safeId(c.id);
    const fromServer = typeof c.unread_count === "number" ? c.unread_count : undefined;
    const fromStore = typeof stored[id] === "number" ? stored[id] : undefined;
    return { ...c, unread: fromServer ?? fromStore ?? 0 };
  });
};

const persistFromList = (list: ChatRoomItem[]) => {
  const map: Record<string, number> = {};
  list.forEach((c) => (map[safeId(c.id)] = Math.max(0, c.unread ?? 0)));
  saveUnreadMap(map);
};

// ===== Reconnecting WebSocket hook =====
// Lightweight, dependency-aware reconnect with exponential backoff.
function useReconnectingWebSocket(
  urlFactory: () => string | null,
  handlers: {
    onOpen?: (ws: WebSocket) => void;
    onMessage?: (evt: MessageEvent) => void;
    onClose?: (evt: CloseEvent) => void;
    onError?: (evt: Event) => void;
  },
  deps: React.DependencyList,
  options: { maxDelayMs?: number; minDelayMs?: number } = {}
) {
  const { maxDelayMs = 10000, minDelayMs = 500 } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const triesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const connect = () => {
      const url = urlFactory();
      if (!url) return; // if auth not ready
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          triesRef.current = 0;
          handlers.onOpen?.(ws);
        };
        ws.onmessage = (evt) => handlers.onMessage?.(evt);
        ws.onclose = (evt) => {
          handlers.onClose?.(evt);
          // schedule reconnect
          const t = triesRef.current++;
          const delay = Math.min(maxDelayMs, minDelayMs * Math.pow(2, t));
          timerRef.current = setTimeout(connect, delay);
        };
        ws.onerror = (evt) => {
          handlers.onError?.(evt);
          try { ws.close(); } catch {}
        };
      } catch (e) {
        const t = triesRef.current++;
        const delay = Math.min(maxDelayMs, minDelayMs * Math.pow(2, t));
        timerRef.current = setTimeout(connect, delay);
      }
    };

    connect();

    const handleOnline = () => {
      // Try immediate reconnect when network returns
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        triesRef.current = 0;
        if (timerRef.current) clearTimeout(timerRef.current);
        connect();
      }
    };

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return wsRef;
}

// ===== Component =====
export const ChatSection: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<ChatRoomItem | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [chatData, setChatData] = useState<ChatRoomItem[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { userInfo } = useRole();

  // UI refs
  const chatBodyRef = useRef<HTMLDivElement | null>(null);

  // Call / WebRTC refs
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "in_call" | "ended">("idle");

  // ===== Derived =====
  const accessToken = useMemo(() => {
    try { return localStorage.getItem("accessToken"); } catch { return null; }
  }, []);

  // ===== Fetch devices (chat list) =====
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const response = await axiosInstance.get(`/owners/devicesall/?search=${searchQuery}`);
        const list = Array.isArray(response.data) ? (response.data as ChatRoomItem[]) : [];
        const normalized = list.map((c) => ({ ...c }));
        const merged = mergeUnread(normalized);
        setChatData(merged);
        persistFromList(merged);
        if (merged.length > 0 && !selectedChat) setSelectedChat(merged[0]);
      } catch (error) {
        toast.error("Failed to load devices.");
        setChatData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // ===== Helpers to mutate unread =====
  const setUnread = (chatId: ChatRoomItem["id"], value: number) => {
    setChatData((prev) => {
      const updated = prev.map((c) => (c.id === chatId ? { ...c, unread: Math.max(0, value) } : c));
      persistFromList(updated);
      return updated;
    });
  };

  const incUnread = (chatId: ChatRoomItem["id"], by = 1) => {
    setChatData((prev) => {
      const updated = prev.map((c) => (c.id === chatId ? { ...c, unread: Math.max(0, (c.unread ?? 0) + by) } : c));
      persistFromList(updated);
      return updated;
    });
  };

  const markChatAsRead = async (chatId: ChatRoomItem["id"]) => {
    // Optimistic clear
    setUnread(chatId, 0);
    // Optional backend notify
    try {
      const restaurant_id = userInfo?.restaurants?.[0]?.id;
      await axiosInstance.post(`/message/mark_read/`, { device_id: chatId, restaurant_id });
    } catch (e) {
      console.warn("mark_read failed; keeping optimistic state", e);
    }
  };

  // ===== Select chat: clear unread + fetch messages =====
  const handleSelectChat = (chat: ChatRoomItem) => {
    setSelectedChat(chat);
    markChatAsRead(chat.id);
  };

  // ===== Fetch previous messages when selectedChat changes =====
  useEffect(() => {
    if (!selectedChat) return;
    const device_id = selectedChat.id;
    const restaurant_id = userInfo?.restaurants?.[0]?.id;
    const fetchMessages = async () => {
      try {
        const response = await axiosInstance.get(
          `/message/chat/?device_id=${device_id}&restaurant_id=${restaurant_id}`
        );
        setMessages(response.data || []);
        // Treat as read on load
        markChatAsRead(device_id);
      } catch (error) {
        toast.error("Failed to load previous messages.");
        setMessages([]);
      }
    };
    fetchMessages();
  }, [selectedChat, userInfo]);

  // ===== Room-scoped chat socket (selectedChat) =====
  const roomWsRef = useReconnectingWebSocket(
    () => {
      if (!selectedChat || !accessToken) return null;
      return `wss://abc.winaclaim.com/ws/chat/${selectedChat.id}/?token=${accessToken}`; // adjust path if needed
    },
    {
      onOpen: () => {},
      onMessage: (event) => {
        const data = JSON.parse(event.data);
        // Only messages for the open room arrive here
        setMessages((prev) => [...prev, data]);
        // Open room => considered read
        if (selectedChat) markChatAsRead(selectedChat.id);
        if (data.type === "answer") setCallStatus("in_call");
        if (data.action === "call_ended") setCallStatus("ended");
      },
    },
    [selectedChat?.id, accessToken]
  );

  // ===== Global notifications socket (all rooms) =====
  // Adjust endpoint name to your backend; this expects events for any room: { room_id | device_id, ... }
  const globalWsRef = useReconnectingWebSocket(
    () => {
      if (!accessToken) return null;
      return `wss://abc.winaclaim.com/ws/notify/?token=${accessToken}`; // <-- UPDATE if your backend uses a different global WS path
    },
    {
      onMessage: (event) => {
        try {
          const data = JSON.parse(event.data);
          const roomId = data.room_id ?? data.device_id ?? data.chat_id;
          if (!roomId) return;
          // If message belongs to the currently open chat, ignore here (room socket handles it)
          if (safeId(roomId) === safeId(selectedChat?.id)) return;
          incUnread(roomId, 1);
        } catch {}
      },
    },
    [selectedChat?.id, accessToken]
  );

  // ===== Auto-scroll on new messages / chat switch =====
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages, selectedChat]);

  // ===== Send message =====
  const handleSend = () => {
    if (!inputMessage.trim()) return;
    const ws = roomWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error("Connection lost. Please try again.");
      return;
    }
    try {
      ws.send(JSON.stringify({ type: "message", message: inputMessage }));
      setInputMessage("");
      // Your own message should not increase unread for anyone locally.
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
    }
  };

  // ===== Call handling =====
  const startConnection = async () => {
    if (!selectedChat) return;
    const device_id = selectedChat.id;
    const user_id = selectedChat.user_id;
    const ws = new WebSocket(`wss://abc.winaclaim.com/ws/call/${device_id}/?token=${accessToken}`);

    ws.onopen = async () => {
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (localAudioRef.current) localAudioRef.current.srcObject = localStream;

      const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
      };

      peer.ontrack = (event) => {
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      ws.send(
        JSON.stringify({ action: "start_call", receiver_id: user_id, device_id, type: "offer", offer })
      );

      let remoteCandidatesQueue: RTCIceCandidateInit[] = [];

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "answer") {
          await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
          for (const cand of remoteCandidatesQueue) {
            try { await peer.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) { console.error("Error adding queued ICE candidate", e); }
          }
          remoteCandidatesQueue = [];
          setCallStatus("in_call");
        } else if (data.type === "candidate") {
          if (peer.remoteDescription && peer.remoteDescription.type) {
            try { await peer.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) { console.error("Error adding ICE candidate", e); }
          } else {
            remoteCandidatesQueue.push(data.candidate);
          }
        } else if (data.action === "call_ended") {
          peer.close();
          ws.close();
          setCallStatus("ended");
        }
      };

      socketRef.current = ws;
      peerRef.current = peer;
      localStreamRef.current = localStream;
    };
  };

  const confirmToCall = () => setIsConfirmOpen(true);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-white">Loading devices...</div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col border-2 border-sidebar rounded-xl">
        <h2 className="text-primary-text bg-chat-sender/20 p-4 rounded-t-xl">Customer Message</h2>

        <div className="flex flex-row items-center">
          <div className="w-92 p-4">
            <TextSearchBoxCompact
              className="h-12"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by table name..."
            />
          </div>

          {/* Header (current chat identity + call btn) */}
          <div className="flex-1 flex items-center justify-between p-4 border-[#2B2A40] text-primary-text">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-full bg-[#292758] flex items-center justify-center">
                <span>{selectedChat?.id || "N/A"}</span>
              </div>
              <span className="font-medium">{selectedChat?.table_name || "Select a table"}</span>
            </div>
            <button
              onClick={confirmToCall}
              className="button-primary bg-sidebar rounded-lg text-base flex items-center space-x-2"
              disabled={!selectedChat}
            >
              <IoCall className="w-4 h-4" />
              <span>Call to customer</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex h-full text-white border-t-2 border-chat-sender/20 overflow-hidden">
          {/* Left Chat List */}
          <div className="w-92 bg-sidebar p-2 overflow-y-auto scrollbar-hide flex-shrink-0">
            <div className="divide-y divide-chat-sender/10">
              {Array.isArray(chatData) &&
                chatData.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    data={chat}
                    isSelected={selectedChat?.id === chat.id}
                    onClick={() => handleSelectChat(chat)}
                  />
                ))}
            </div>
          </div>

          {/* Right Chat Window */}
          <div className="flex-1 flex flex-col bg-chat-container/60 border-l-2 border-blue-900/10">
            {/* Chat Body */}
            <div className="flex-1 px-6 py-4 space-y-2 overflow-y-auto scrollbar-hide" ref={chatBodyRef}>
              {selectedChat ? (
                messages?.map((msg, index) => {
                  const isSameSenderAsPrev = index > 0 && messages[index - 1].sender === msg.sender;
                  const isSameSenderAsNext = index < messages.length - 1 && messages[index + 1].sender === msg.sender;

                  const isSingleMessage = !isSameSenderAsPrev && !isSameSenderAsNext;
                  const isMiddleMessage = isSameSenderAsPrev && isSameSenderAsNext;
                  const isFirstInGroup = !isSameSenderAsPrev && isSameSenderAsNext;
                  const isLastInGroup = isSameSenderAsPrev && !isSameSenderAsNext;

                  const isUser = msg.is_from_device === false; // todo: reverse in production

                  return (
                    <div key={index} className={cn("flex", { "justify-end": isUser, "justify-start": !isUser })}>
                      <div
                        className={cn(
                          "max-w-xs py-2 px-3 text-primary-text flex flex-col",
                          isUser ? "bg-chat-sender" : "bg-chat-receiver/40",
                          {
                            "rounded-xl": isSingleMessage,
                            "rounded-l-xl": isMiddleMessage,
                            [isUser ? "rounded-t-xl rounded-l-xl" : "rounded-t-xl rounded-r-xl"]: isFirstInGroup,
                            [isUser ? "rounded-b-xl rounded-l-xl" : "rounded-b-xl rounded-r-xl"]: isLastInGroup,
                          }
                        )}
                      >
                        <span>{msg.message}</span>
                        <span className="text-[10px] text-primary-text/40 self-end mt-1">{formatTimestamp(msg.timestamp)}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex items-center justify-center h-full text-white/60">Select a table to view messages</div>
              )}
            </div>

            {/* Footer Input */}
            <div className="p-2 border-t border-blue-800/10 ">
              <div className="flex items-center relative min-h-16">
                <textarea
                  placeholder="Type a message"
                  className="flex-1 h-full min-h-16 bg-dashboard px-4 py-2 rounded text-sm placeholder:text-white/40 outline-none resize-none me-14"
                  rows={2}
                  disabled={!selectedChat}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button className="absolute right-2 bg-sidebar p-2 rounded" disabled={!selectedChat} onClick={handleSend}>
                  <IconSend className="text-white w-6 h-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Call confirm + modal */}
      <ModalCallConfirm
        isOpen={isConfirmOpen}
        confirm={() => {
          setIsConfirmOpen(false);
          setIsCallOpen(true);
          setCallStatus("calling");
          startConnection();
        }}
        close={() => setIsConfirmOpen(false)}
      />

      <ModalCall
        socketRef={socketRef}
        peerRef={peerRef}
        localStreamRef={localStreamRef}
        isOpen={isCallOpen}
        callStatus={callStatus}
        close={() => setIsCallOpen(false)}
      />

      {/* Audio */}
      <audio ref={localAudioRef} autoPlay muted style={{ display: "none" }} />
      <audio ref={remoteAudioRef} autoPlay style={{ display: "none" }} />
    </>
  );
};

// ===== ChatListItem (with red dot + count with 9+ cap) =====
interface ChatListItemProps {
  data: ChatRoomItem;
  isSelected: boolean;
  onClick: () => void;
}

export const ChatListItem: React.FC<ChatListItemProps> = ({ isSelected, data, onClick }) => {
  const count = Math.max(0, data.unread ?? 0);
  const label = count >= 10 ? "9+" : String(count);
  return (
    <div
      className={cn(
        "px-3 py-2 cursor-pointer flex justify-between items-center rounded my-1",
        { "bg-chat-sender/20": isSelected },
        { "hover:bg-[#1B1A30]": !isSelected }
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <p className="h-10 w-10 bg-[#292758]/50 rounded-full flex justify-center items-center">
          <span className="text-xl">{data.table_name}</span>
        </p>
        <div className="flex flex-col">
          <span className="text-sm text-white/80">Table #{data.table_name}</span>
          <span className="text-xs text-white/40">ID: {data.id}</span>
        </div>
      </div>

      {/* right side: unread badge */}
      <div className="flex items-center gap-x-2">
        {count > 0 ? (
          <span
            aria-label="unread"
            title={`${count} unread`}
            className="min-w-[1.25rem] h-5 px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-[11px] font-semibold text-white"
          >
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
};

/* ==========================================================
  NOTES / Integration tips
  ----------------------------------------------------------
  1) Unread state lives in `data.unread`. We seed it from server `unread_count`
     if available, or from localStorage (key: unreadCounts).
  2) A global notifications WS (update URL to match your backend) increments
     counts for rooms that are NOT currently open.
  3) The room-scoped WS for the selected chat appends messages and clears its
     unread immediately (chat is considered read when opened).
  4) Both sockets auto-reconnect with exponential backoff, and reconnect when
     the browser comes back online.
  5) The badge caps at "9+" for any count >= 10.
========================================================== */
