import { FormEvent, useState, useEffect, useMemo, useRef } from "react";
import { Bot, Mic, Send, Wifi, Instagram, Star, User } from "lucide-react";
import { Footer } from "../components/Footer";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";
import { useWebSocket } from "@/components/WebSocketContext";
import { cn } from "clsx-for-tailwind";
import { motion } from "motion/react";
import { useBrandConfig } from "@/lib/useBrandConfig";
import { getTableIdentity } from "@/lib/tableIdentity";
import { cachedGet } from "@/lib/requestCache";

const ScreenMessage = () => {
  return <MessagingUI />;
};

function MessagingUI() {
  // Consume global state from Context
  const { ws, sendMessage, setNewMessageFlag, messages, setMessages, connectionStatus, retryConnection } = useWebSocket();

  const [inputValue, setInputValue] = useState("");
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);

  const userInfo = localStorage.getItem("userInfo");
  const userInfoContent = userInfo ? JSON.parse(userInfo) : null;
  const device_id = userInfoContent?.user?.restaurants?.[0]?.device_id || null;
  const restaurant_id = userInfoContent?.user?.restaurants?.[0]?.id || null;
  const brand = useBrandConfig(restaurant_id);
  const hasWifiDetails = Boolean(brand.wifiName || brand.wifiPassword);
  const tableIdentity = useMemo(() => getTableIdentity(), []);
  const openExternalLink = (url: string | null, label: string) => {
    if (!url) {
      toast.error(`${label} link is not configured`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const startVoiceInput = () => {
    const SpeechRecognition =
      (window as typeof window & {
        SpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
          onerror: (() => void) | null;
          start: () => void;
        };
        webkitSpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
          onerror: (() => void) | null;
          start: () => void;
        };
      }).SpeechRecognition ||
      (window as typeof window & {
        webkitSpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
          onerror: (() => void) | null;
          start: () => void;
        };
      }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Voice input is not supported by this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) setInputValue(transcript);
    };
    recognition.onerror = () => toast.error("Could not capture voice input");
    recognition.start();
  };

  // Removed local WebSocket event listener because Context handles it now.

  useEffect(() => {
    if (window.location.pathname === "/dashboard/message") {
      setNewMessageFlag(false);
    }
  }, [setNewMessageFlag]);

  // Fetch History ONLY if messages are empty (or on initial load check)
  // We can optimize this to only fetch if length is 0 to avoid overwrite on tab switch
  useEffect(() => {
    if (!userInfo) return; // Always fetch to sync latest state from Canonical Backend

    const fetchMessages = async () => {
      try {
        const guestToken = localStorage.getItem("guest_session_token");
        console.log(`DEBUG: Fetching messages. Device: ${device_id}, Rest: ${restaurant_id}, Token: ${guestToken ? 'Present' : 'MISSING'}`);

        const headers: Record<string, string> = {};
        if (guestToken) {
          headers["X-Guest-Session-Token"] = guestToken;
        }

        const response = await cachedGet(
          `/message/chat/?device_id=${device_id}&restaurant_id=${restaurant_id}`,
          { headers },
          { ttlMs: 2_000 },
        );

        type ApiMessage = {
          id: number;
          is_from_device: boolean;
          message: string;
          timestamp?: string;
        };
        const mapped = (response.data || []).map((msg: ApiMessage) => ({
          id: msg.id,
          is_from_device: msg.is_from_device,
          text: msg.message || "",
          timestamp: msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
          hasActions: !msg.is_from_device && (msg.message || "").includes("Welcome")
        }));

        // Update Context State
        setMessages(mapped);
      } catch {
        console.error("Failed to load previous messages");
      }
    };

    if (device_id && restaurant_id) {
      fetchMessages();
    }
  }, [device_id, restaurant_id, userInfo, setMessages]); // Fixed: Removed messages.length to prevent stale overwrite loop

  useEffect(() => {
    const messageList = messagesScrollRef.current;
    if (messageList) {
      messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
    }
  }, [messages]); // Scrolls whenever global messages update

  const persistTableMessage = (text: string, type: "chat" | "assistance") => {
    axiosInstance.post("/api/table-messages", {
      tableNumber: tableIdentity.tableNumber,
      tableName: tableIdentity.tableName,
      type,
      message: text,
      status: "pending",
    }).catch(() => {
      // WebSocket already queued the message. Do not block or roll back the customer bubble.
    });
  };

  const handleSend = (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    const type = /assist|waiter|call/i.test(cleanText) ? "assistance" : "chat";
    try {
      sendMessage(cleanText, type);
      // Optimistically add message to Global State
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          is_from_device: true,
          text: cleanText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
      ]);
      setInputValue("");
      persistTableMessage(cleanText, type);
    } catch {
      toast.error("Failed to send message");
    }
  };

  const handleSubmit = (e: FormEvent<HTMLElement>) => {
    e.preventDefault();
    handleSend(inputValue);
  };

  const presetMessages = [
    "I need assistance",
    "Where is my order?",
    "Call waiter",
    "Water please"
  ];

  const handlePresetClick = (msg: string) => {
    handleSend(msg);
  };

  return (
    <div className="flex h-[calc(100dvh-60px-env(safe-area-inset-bottom))] flex-col overflow-hidden bg-background text-foreground">
      {/* 1. Header Section (Static in Flex) */}
      <div className="z-30 flex shrink-0 items-center gap-3 border-b border-border/30 bg-background/80 p-4 shadow-sm shadow-black/20 backdrop-blur-md">
        <div className="flex w-full items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                <Bot size={24} className="text-muted-foreground" strokeWidth={1.8} />
              </div>
              <div className={cn(
                "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white transition-colors duration-300",
                ws?.readyState === WebSocket.OPEN ? "bg-green-500" : "bg-red-500"
              )}></div>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-foreground leading-none">Assistant</span>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-medium transition-colors duration-300",
                  connectionStatus === "connected" ? "text-green-600" : "text-red-500"
                )}>
                  {connectionStatus === "connected" ? "Online" : connectionStatus === "reconnecting" ? "Reconnecting..." : "Disconnected"}
                </span>
                {connectionStatus !== "connected" && (
                  <button
                    onClick={retryConnection}
                    className="text-[10px] bg-secondary hover:bg-white/10 px-2 py-0.5 rounded text-secondary-foreground border border-border"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{tableIdentity.tableName || tableIdentity.tableNumber || ""}</span>
        </div>
      </div>

      {/* 2. Message Area (Flex Grow) */}
      <div ref={messagesScrollRef} className="flex-1 overflow-y-auto bg-background p-4 scroll-smooth">
        <div className="flex flex-col space-y-4">
          {hasWifiDetails && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm shadow-black/20">
              <div className="mb-2 flex items-center gap-2">
                <Wifi className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
                <span className="text-sm font-semibold text-foreground">Guest WiFi</span>
              </div>
              {brand.wifiName && (
                <div className="flex items-center justify-between gap-3 py-1">
                  <span className="text-xs text-muted-foreground">Network</span>
                  <span className="truncate text-xs font-semibold font-mono text-foreground">
                    {brand.wifiName}
                  </span>
                </div>
              )}
              {brand.wifiPassword && (
                <div className="flex items-center justify-between gap-3 py-1">
                  <span className="text-xs text-muted-foreground">Password</span>
                  <span className="truncate text-xs font-semibold font-mono text-foreground">
                    {brand.wifiPassword}
                  </span>
                </div>
              )}
            </div>
          )}

          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center opacity-50 mt-10">
              <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mb-4">
                <Send size={24} className="text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">No messages yet.<br />Start the conversation!</p>
            </div>
          ) : (
            messages
              .filter((message) => message.text && message.text.trim() !== "")
              .map((message) => (
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
                    <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center">
                      {message.is_from_device ? (
                        <User size={16} className="text-muted-foreground" strokeWidth={1.8} />
                      ) : (
                        <Bot size={16} className="text-muted-foreground" strokeWidth={1.8} />
                      )}
                    </div>

                    {/* Message Content Area */}
                    <div className={cn(
                      "flex flex-col space-y-2 max-w-[85%]",
                      message.is_from_device ? "items-end" : "items-start"
                    )}>
                      {/* Text Bubble */}
                      <div className={cn(
                        "whitespace-pre-wrap rounded-2xl p-3 text-sm leading-relaxed shadow-sm",
                        message.is_from_device
                          ? "bg-primary text-white rounded-tr-sm"
                          : "bg-card text-foreground border border-border rounded-2xl rounded-tl-sm"
                      )}>
                        {message.text}
                      </div>

                      {/* Action Cards (Only for Assistant messages with hasActions) */}
                      {!message.is_from_device && message.hasActions && (
                        <div className="flex flex-col gap-2 w-full">
                          {hasWifiDetails && (
                            <div className="bg-primary/10 rounded-xl p-2 flex items-center gap-2 border border-primary/20">
                              <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-primary shadow-sm shrink-0">
                                <Wifi size={16} />
                              </div>
                              <div className="min-w-0">
                                <span className="text-primary font-medium text-xs">WiFi</span>
                                <div className="font-mono font-bold text-foreground text-xs truncate">
                                  {[brand.wifiName, brand.wifiPassword].filter(Boolean).join(" / ")}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Social & Rating Buttons */}
                          <div className="flex gap-2 w-full">
                            <button
                              type="button"
                              onClick={() => openExternalLink(brand.instagramUrl, "Instagram")}
                              className="flex-1 bg-card rounded-xl px-3 py-2 flex items-center justify-center gap-2 border border-border shadow-sm hover:border-pink-500 hover:text-pink-400 transition-colors"
                            >
                              <Instagram size={14} />
                              <span className="text-xs font-bold text-secondary-foreground group-hover:text-pink-400">Instagram</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openExternalLink(brand.googleReviewUrl, "Google review")}
                              className="flex-1 bg-card rounded-xl px-3 py-2 flex items-center justify-center gap-2 border border-border shadow-sm hover:border-yellow-500 hover:text-yellow-400 transition-colors"
                            >
                              <Star size={14} />
                              <span className="text-xs font-bold text-secondary-foreground group-hover:text-yellow-400">Rate Us</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
          )}
        </div>
      </div>

      {/* 3. Footer / Input Area (Static in Flex - No Fixed) */}
      <div className="z-40 w-full shrink-0 border-t border-border bg-background/90 pb-[max(env(safe-area-inset-bottom),0px)] backdrop-blur-md">
        <div className="flex w-full flex-col">
          {/* Preset Messages */}
          <div className="w-full overflow-x-auto hide-scrollbar border-b border-border p-3">
            <div className="flex min-w-max gap-2">
              {presetMessages.map((msg) => (
                <button
                  key={msg}
                  onClick={() => handlePresetClick(msg)}
                  className="whitespace-nowrap rounded-full border border-border bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  {msg}
                </button>
              ))}
            </div>
          </div>

          {/* Input Field Group */}
          <div className="p-4 pt-3">
            <form
              onSubmit={handleSubmit}
              className="flex w-full items-center gap-2 rounded-full border border-border bg-secondary p-1 transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20"
            >


              <input
                type="text"
                placeholder="Type a message..."
                className="h-10 flex-1 appearance-none border-none bg-transparent px-4 text-sm text-foreground shadow-none outline-none placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />

              <button
                type="button"
                onClick={startVoiceInput}
                aria-label="Start voice input"
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10"
              >
                <Mic size={16} strokeWidth={1.8} />
              </button>

              <button
                type="submit"
                disabled={!inputValue.trim()}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200",
                  inputValue.trim()
                    ? "bg-primary text-white shadow-md hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <Send size={16} strokeWidth={1.8} className={inputValue.trim() ? "ml-0.5" : ""} />
              </button>
            </form>
            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScreenMessage;
