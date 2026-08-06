import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { getActiveRestaurantCurrency } from "../lib/utils";
import { cachedGet } from "../lib/requestCache";
import axiosInstance from "../lib/axios";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Banknote, BellRing, Check, PackageCheck } from "lucide-react";
import { useNavigate } from "react-router";
import { useRole } from "./useRole";
import {
  buildStaffOrderAlerts,
  createStaffOrderViewState,
  getActiveAssistanceAlertIdsForTable,
  getFirstDashboardRestaurantId,
  getStaffAssistanceQueue,
  getStaffOrdersPath,
  isActiveAssistanceAlert,
  isStaffAlertRole,
  type StaffCashOrderAlert,
  type StaffReadyOrderAlert,
  upsertStaffServiceAlert,
} from "./staffServiceAlerts";
import {
  formatUnreadTableSummary,
  getUnreadSyncChannelName,
  isUnreadSnapshotCurrent,
  isUnreadMessageForActiveChat,
  normalizeUnreadDeviceId,
  resolveUnreadTableName,
} from "./unreadBadge";

// Create a WebSocket context
export const WebSocketContext = createContext(null);

type UnreadTable = {
  deviceId: string;
  tableName: string;
  unreadCount: number;
};

type DashboardTable = {
  id?: string | number;
  device_id?: string | number;
  restaurant?: string | number;
  restaurant_id?: string | number;
  table_name?: string;
  unread_count?: string | number;
  [key: string]: unknown;
};

type WsFailureContext = {
  feature?: string;
  endpoint?: string;
  status?: number | string;
};

type StaffServiceAlert = {
  id: string | number;
  deviceId?: string | number;
  device_id?: string | number;
  tableNumber?: number;
  table_number?: number;
  tableName?: string;
  table_name?: string;
  type?: string;
  message?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
};

function captureWebSocketFailure(message: string, context: WsFailureContext = {}) {
  if (import.meta.env.DEV) {
    console.warn("[WebSocket warning]", message, context);
  }
}

// PWA App Badge helpers
function updateAppBadge(count: number) {
  try {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  } catch (e) {
    // Gracefully fail if not supported
  }
}

const WebSocketProvider = ({ children }) => {
  const navigate = useNavigate();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [response, setResponse] = useState({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadTables, setUnreadTables] = useState<UnreadTable[]>([]);
  const [dashboardTables, setDashboardTables] = useState<DashboardTable[]>([]);
  const [staffServiceAlerts, setStaffServiceAlerts] = useState<StaffServiceAlert[]>([]);
  const [cashServiceAlerts, setCashServiceAlerts] = useState<StaffCashOrderAlert[]>([]);
  const [readyOrderAlerts, setReadyOrderAlerts] = useState<StaffReadyOrderAlert[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const reconnectAttemptRef = useRef(0);
  const staffAlertRefreshRef = useRef<Promise<void> | null>(null);
  const staffAlertScopeRef = useRef<string | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const activeChatDeviceIdRef = useRef<string | null>(null);
  const dashboardTablesRef = useRef<DashboardTable[]>([]);
  const unreadRevisionRef = useRef(0);
  const markReadTimeoutsRef = useRef<Map<string, number>>(new Map());
  const { userInfo: syncedUserInfo } = useRole();

  // 1. Get User & Token
  const storedUser = JSON.parse(localStorage.getItem("userInfo") || "{}");
  const parseUser = syncedUserInfo || storedUser;
  const accessToken = localStorage.getItem("accessToken");
  const dashboardRole = String(parseUser?.role || "").toLowerCase();
  const isChefDashboard = dashboardRole === "chef";
  const isStaffDashboard = isStaffAlertRole(dashboardRole);

  // 2. Robust ID Extraction
  let restaurantId =
    parseUser.restaurant_id ||
    parseUser.restaurants_id ||
    parseUser.restaurant?.id ||
    parseUser.restaurant ||
    localStorage.getItem("restaurantId") ||
    localStorage.getItem("selectedRestaurantId");

  if (!restaurantId && parseUser.restaurants && parseUser.restaurants.length > 0) {
    restaurantId = parseUser.restaurants[0]?.id;
  }
  if (!restaurantId && dashboardTables.length > 0) {
    restaurantId = getFirstDashboardRestaurantId(dashboardTables);
  }

  const id = restaurantId;
  const wsUrl = `${import.meta.env.VITE_WS_URL || "ws://localhost:8000"}/ws/alldatalive/${id}/?token=${accessToken}`;
  staffAlertScopeRef.current = isStaffDashboard && id ? String(id) : null;

  const refreshStaffServiceAlerts = useCallback(async () => {
    if (!isStaffDashboard || !id) {
      setStaffServiceAlerts([]);
      setCashServiceAlerts([]);
      setReadyOrderAlerts([]);
      return;
    }

    if (staffAlertRefreshRef.current) {
      await staffAlertRefreshRef.current;
      return;
    }

    const requestScope = String(id);
    const refreshRequest = (async () => {
      const [messageResult, orderResult] = await Promise.allSettled([
        axiosInstance.get("/api/table-messages", { params: { restaurant_id: id } }),
        axiosInstance.get("/api/staff/orders/", { params: { page: 1, page_size: 250 } }),
      ]);

      if (staffAlertScopeRef.current !== requestScope) return;

      if (messageResult.status === "fulfilled") {
        const rows = Array.isArray(messageResult.value.data) ? messageResult.value.data : [];
        setStaffServiceAlerts(rows.filter(isActiveAssistanceAlert));
      } else {
        console.warn("Failed to refresh staff assistance alerts (non-blocking):", messageResult.reason);
      }

      if (orderResult.status === "fulfilled") {
        const { cashAlerts, readyOrderAlerts: nextReadyOrderAlerts } = buildStaffOrderAlerts(
          orderResult.value.data,
          getActiveRestaurantCurrency(),
        );
        setCashServiceAlerts(cashAlerts);
        setReadyOrderAlerts(nextReadyOrderAlerts);
      } else {
        console.warn("Failed to refresh staff order alerts (non-blocking):", orderResult.reason);
      }
    })();

    staffAlertRefreshRef.current = refreshRequest;
    try {
      await refreshRequest;
    } finally {
      if (staffAlertRefreshRef.current === refreshRequest) {
        staffAlertRefreshRef.current = null;
      }
    }
  }, [id, isStaffDashboard]);

  useEffect(() => {
    if (!isStaffDashboard) {
      setStaffServiceAlerts([]);
      setCashServiceAlerts([]);
      setReadyOrderAlerts([]);
      return;
    }
    void refreshStaffServiceAlerts();
    const interval = window.setInterval(() => {
      void refreshStaffServiceAlerts();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [isStaffDashboard, refreshStaffServiceAlerts]);

  useEffect(() => {
    if (!isStaffDashboard || !id) return;
    const currentRestaurantId = localStorage.getItem("restaurantId");
    if (String(currentRestaurantId || "") !== String(id)) {
      localStorage.setItem("restaurantId", String(id));
    }
  }, [id, isStaffDashboard]);

  const handleServiceAttended = useCallback(async (alert: StaffServiceAlert) => {
    const alertIds = getActiveAssistanceAlertIdsForTable(staffServiceAlerts, alert);
    if (alertIds.length === 0) return;

    try {
      await axiosInstance.patch("/api/table-messages", {
        ids: alertIds,
        status: "resolved",
      });
      const resolvedIds = new Set(alertIds.map((alertId) => String(alertId)));
      setStaffServiceAlerts((previous) => previous.filter(
        (candidate) => !resolvedIds.has(String(candidate.id)),
      ));
      await refreshStaffServiceAlerts();
    } catch {
      toast.error("Could not mark the request as attended.");
    }
  }, [refreshStaffServiceAlerts, staffServiceAlerts]);

  const handleCashCollected = useCallback(async (alert: StaffCashOrderAlert) => {
    if (alert.orderIds.length === 0) {
      window.location.href = "/dashboard/orders";
      return;
    }
    try {
      await Promise.all(
        alert.orderIds.map((orderId) => axiosInstance.patch(`/owners/orders/confirm-cash/${orderId}/`)),
      );
      setCashServiceAlerts((previous) => previous.filter((entry) => entry.id !== alert.id));
      toast.success("Cash received and payment confirmed.");
    } catch {
      toast.error("Could not confirm the cash payment.");
    }
  }, []);

  // Cross-tab sync via BroadcastChannel
  useEffect(() => {
    const channelName = getUnreadSyncChannelName(id, dashboardRole);
    if (!channelName) return;

    try {
      const channel = new BroadcastChannel(channelName);
      broadcastChannelRef.current = channel;

      channel.onmessage = (event) => {
        if (!event.data) return;
        if (isChefDashboard) {
          setUnreadCount(0);
          setUnreadTables([]);
          updateAppBadge(0);
          return;
        }
        unreadRevisionRef.current += 1;
        if (typeof event.data.unreadCount === 'number') {
          setUnreadCount(event.data.unreadCount);
          updateAppBadge(event.data.unreadCount);
        }
        if (Array.isArray(event.data.unreadTables)) {
          setUnreadTables(
            event.data.unreadTables
              .filter((t: any) => t && t.deviceId)
              .map((t: any) => ({
                deviceId: String(t.deviceId),
                tableName: String(t.tableName || `Table ${t.deviceId}`),
                unreadCount: Number(t.unreadCount || 0),
              }))
              .filter((t: UnreadTable) => t.unreadCount > 0)
          );
        }
      };

      return () => {
        channel.close();
        broadcastChannelRef.current = null;
      };
    } catch (e) {
      // BroadcastChannel not supported in some browsers
    }
  }, [dashboardRole, id, isChefDashboard]);

  const syncUnreadState = useCallback((count: number, tables?: UnreadTable[]) => {
    const safeCount = Math.max(0, Number(count) || 0);
    setUnreadCount(safeCount);
    if (tables) {
      setUnreadTables(tables.filter((t) => t.unreadCount > 0));
    }
    updateAppBadge(safeCount);
    try {
      broadcastChannelRef.current?.postMessage({
        unreadCount: safeCount,
        unreadTables: tables,
      });
    } catch (e) { }
  }, []);

  const setUnreadCountSafe = useCallback((next: number | ((prev: number) => number)) => {
    unreadRevisionRef.current += 1;
    setUnreadCount((prev) => {
      const resolved = typeof next === "function" ? (next as (p: number) => number)(prev) : next;
      const safeCount = Math.max(0, Number(resolved) || 0);
      if (safeCount === 0) {
        setUnreadTables([]);
      }
      updateAppBadge(safeCount);
      try {
        broadcastChannelRef.current?.postMessage({
          unreadCount: safeCount,
          unreadTables: safeCount === 0 ? [] : undefined,
        });
      } catch (e) { }
      return safeCount;
    });
  }, []);

  const clearUnreadForTable = useCallback((deviceId: string | number) => {
    const key = String(deviceId);
    unreadRevisionRef.current += 1;
    setUnreadTables((prev) => {
      const next = prev.filter((t) => String(t.deviceId) !== key);
      const safeCount = next.reduce((sum, row) => sum + Number(row.unreadCount || 0), 0);
      setUnreadCount(safeCount);
      updateAppBadge(safeCount);
      try {
        broadcastChannelRef.current?.postMessage({
          unreadCount: safeCount,
          unreadTables: next,
        });
      } catch (e) { }
      return next;
    });
  }, []);

  const setActiveChatDeviceId = useCallback((deviceId: unknown) => {
    activeChatDeviceIdRef.current = normalizeUnreadDeviceId(deviceId);
  }, []);

  const markChatReadForTable = useCallback(async (deviceId: string | number) => {
    const key = normalizeUnreadDeviceId(deviceId);
    if (!key) return false;

    try {
      const { data } = await axiosInstance.post(
        `/message/chat/mark-all-read/?device_id=${encodeURIComponent(key)}`,
      );
      if (data?.status !== "marked all read") {
        console.warn("mark-all-read was not applied:", data);
        return false;
      }
      clearUnreadForTable(key);
      return true;
    } catch (error) {
      console.warn("mark-all-read failed (non-blocking):", error);
      return false;
    }
  }, [clearUnreadForTable]);

  const scheduleActiveChatReadSync = useCallback((deviceId: string | number) => {
    const key = normalizeUnreadDeviceId(deviceId);
    if (!key) return;

    const existingTimeout = markReadTimeoutsRef.current.get(key);
    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout);
    }

    const timeout = window.setTimeout(() => {
      markReadTimeoutsRef.current.delete(key);
      void markChatReadForTable(key);
    }, 250);
    markReadTimeoutsRef.current.set(key, timeout);
  }, [markChatReadForTable]);

  useEffect(() => () => {
    markReadTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    markReadTimeoutsRef.current.clear();
  }, []);

  const incrementUnreadForTable = useCallback((deviceId: string | number, tableName?: string) => {
    const key = String(deviceId);
    const resolvedTableName = resolveUnreadTableName(
      key,
      tableName,
      dashboardTablesRef.current,
    );
    unreadRevisionRef.current += 1;
    setUnreadTables((prev) => {
      const existing = prev.find((t) => String(t.deviceId) === key);
      const next = existing
        ? prev.map((t) =>
          String(t.deviceId) === key
            ? { ...t, unreadCount: t.unreadCount + 1, tableName: resolvedTableName || t.tableName }
            : t
        )
        : [...prev, { deviceId: key, tableName: resolvedTableName, unreadCount: 1 }];

      const safeCount = next.reduce((sum, row) => sum + Number(row.unreadCount || 0), 0);
      setUnreadCount(safeCount);
      updateAppBadge(safeCount);
      try {
        broadcastChannelRef.current?.postMessage({
          unreadCount: safeCount,
          unreadTables: next,
        });
      } catch (e) { }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const role = dashboardRole;
    let endpoint = "/owners/devicesall/";
    if (role === "staff") endpoint = "/api/staff/devicesall/";
    if (role === "chef") endpoint = "/api/chef/devicesall/";

    let cancelled = false;
    const fetchTablesAndUnreadState = async (force = false) => {
      const requestRevision = unreadRevisionRef.current;
      try {
        const { data } = await cachedGet<DashboardTable[]>(endpoint, {}, { ttlMs: 20_000, force });
        if (cancelled || !Array.isArray(data)) return;

        setDashboardTables(data);
        dashboardTablesRef.current = data;
        const rows: UnreadTable[] = isChefDashboard
          ? []
          : data
            .map((row) => ({
              deviceId: String(row?.id ?? row?.device_id ?? ""),
              tableName: String(row?.table_name || `Table ${row?.id ?? row?.device_id ?? ""}`),
              unreadCount: Number(row?.unread_count || 0),
            }))
            .filter((row: UnreadTable) => !!row.deviceId && row.unreadCount > 0);

        if (isUnreadSnapshotCurrent(requestRevision, unreadRevisionRef.current)) {
          const total = rows.reduce((sum, row) => sum + row.unreadCount, 0);
          syncUnreadState(total, rows);
        }
      } catch (error) {
        console.warn("Failed to refresh tables and unread state (non-blocking):", error);
      }
    };

    void fetchTablesAndUnreadState(true);
    const interval = window.setInterval(() => {
      void fetchTablesAndUnreadState(true);
    }, 4000);

    const handleFocus = () => {
      void fetchTablesAndUnreadState(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchTablesAndUnreadState(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [accessToken, dashboardRole, isChefDashboard, syncUnreadState]);

  useEffect(() => {
    if (!id || !accessToken) {
      console.warn(
        "Missing restaurant ID or access token, WebSocket connection skipped.",
        { restaurantId: id, hasAccessToken: !!accessToken }
      );
      captureWebSocketFailure(
        "Missing restaurant ID or access token, WebSocket connection skipped.",
        { endpoint: wsUrl, feature: "websocket" }
      );
      return;
    }

    let disposed = false;

    const connectWebSocket = () => {
      if (disposed) return;

      const existingSocket = wsRef.current;
      if (
        existingSocket
        && (
          existingSocket.readyState === WebSocket.OPEN
          || existingSocket.readyState === WebSocket.CONNECTING
        )
      ) {
        return;
      }

      if (existingSocket) {
        existingSocket.onclose = null;
        existingSocket.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      console.log(`Connecting to Global WS: ${wsUrl}`);
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;
      setWs(socket);

      socket.onopen = () => {
        if (disposed || wsRef.current !== socket) {
          socket.onclose = null;
          socket.close();
          return;
        }
        console.log("Global WebSocket connected");
        reconnectAttemptRef.current = 0; // Reset on successful connect
      };

      socket.onmessage = (event) => {
        if (disposed || wsRef.current !== socket) return;
        try {
          const parsedMessage = JSON.parse(event.data);

          setResponse(parsedMessage);
          setMessages((prevMessages) => [...prevMessages, parsedMessage]);

          if (parsedMessage.type === "chat_message") {
            // Only increment for INCOMING device messages (customer -> staff)
            const isFromDevice = parsedMessage.is_from_device === true || parsedMessage.is_from_device === "true";

            if (isFromDevice && !isChefDashboard) {
              const deviceId = parsedMessage.device_id ?? parsedMessage.table_id;
              if (isUnreadMessageForActiveChat(deviceId, activeChatDeviceIdRef.current)) {
                clearUnreadForTable(deviceId);
                scheduleActiveChatReadSync(deviceId);
              } else if (deviceId !== undefined && deviceId !== null) {
                console.log("Incrementing Global Unread Count (Incoming Device Msg)");
                incrementUnreadForTable(
                  deviceId,
                  parsedMessage.table_name || parsedMessage.sender,
                );
              } else {
                setUnreadCountSafe((prev) => prev + 1);
              }
            }
          }

          if (parsedMessage.type === "chat_cleared" || parsedMessage.type === "session_closed") {
            const targetDeviceId = parsedMessage.device_id ?? parsedMessage.table_id;
            if (targetDeviceId !== undefined && targetDeviceId !== null) {
              clearUnreadForTable(targetDeviceId);
            }
          }

          if (parsedMessage.type === "cash_payment_alert" && isStaffDashboard) {
            // Play Sound
            try {
              const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
              audio.play().catch(e => console.log("Audio play failed", e));
            } catch (e) { console.log(e); }

            const rawOrderIds = Array.isArray(parsedMessage.order_ids)
              ? parsedMessage.order_ids
              : [parsedMessage.order?.id];
            const orderIds = rawOrderIds
              .map((value: unknown) => Number(value))
              .filter((value: number) => Number.isInteger(value) && value > 0);
            const alertId = String(
              parsedMessage.session_id
                ? `cash-session-${parsedMessage.session_id}`
                : `cash-order-${orderIds[0] || Date.now()}`,
            );
            const amount = Number(parsedMessage.total_amount || 0);
            const total = Number(parsedMessage.order_total || parsedMessage.order?.total_price || amount || 0);
            const alreadyPaid = Number(
              parsedMessage.already_paid ?? Math.max(0, total - amount),
            );
            setCashServiceAlerts((previous) => {
              const next: StaffCashOrderAlert = {
                id: alertId,
                tableName: String(parsedMessage.table_number || parsedMessage.order?.device_name || "Table"),
                amount,
                currency: String(
                  parsedMessage.currency
                  || parsedMessage.order?.currency
                  || getActiveRestaurantCurrency()
                ).trim().toUpperCase(),
                total,
                alreadyPaid,
                orderIds,
              };
              return [...previous.filter((entry) => entry.id !== alertId), next];
            });
          }

          if (parsedMessage.type === "cash_payment_confirmed" && isStaffDashboard) {
            const confirmedOrderId = Number(parsedMessage.order_id);
            setCashServiceAlerts((previous) =>
              previous.filter((alert) => !alert.orderIds.includes(confirmedOrderId)),
            );
          }

          if (parsedMessage.type === "service_alert" && isStaffDashboard) {
            const incomingAlert = parsedMessage.alert as StaffServiceAlert | undefined;
            if (incomingAlert && isActiveAssistanceAlert(incomingAlert)) {
              setStaffServiceAlerts((previous) =>
                upsertStaffServiceAlert(previous, incomingAlert),
              );
            }
            void refreshStaffServiceAlerts();
          }

          if (
            isStaffDashboard
            && (
              parsedMessage.type === "new_order"
              || parsedMessage.type === "order_created"
              || parsedMessage.type === "order_updated"
              || parsedMessage.type === "order_status_update"
            )
          ) {
            void refreshStaffServiceAlerts();
          }

          // Handle Assistance Request Alerts from Tables
          if (
            parsedMessage.type === "chat_message"
            && parsedMessage.message_type === "alert"
            && isStaffDashboard
          ) {
            // Play Alert Sound
            try {
              const audio = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
              audio.play().catch(e => console.log("Audio play failed", e));
            } catch (e) { console.log(e); }

            // Extract table info from message
            const messageText = parsedMessage.message || "A table needs assistance";

            // Show Prominent Toast
            toast((t) => (
              <div onClick={() => {
                toast.dismiss(t.id);
                window.location.href = "/dashboard/messages";
              }} className="cursor-pointer">
                <p className="font-bold text-lg">🔔 Assistance Requested!</p>
                <p className="text-sm">{messageText}</p>
                <p className="text-xs text-gray-500 mt-1">Click to respond</p>
              </div>
            ), {
              duration: 30000,
              position: 'top-center',
              style: {
                border: '3px solid #EF4444',
                padding: '20px',
                color: '#991B1B',
                background: '#FEE2E2',
                fontSize: '16px',
                boxShadow: '0 10px 25px rgba(239, 68, 68, 0.3)'
              },
            });
          }

        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
          captureWebSocketFailure("WebSocket message parsing failed", {
            endpoint: wsUrl,
            feature: "websocket",
          });
        }
      };

      socket.onerror = (error) => {
        console.warn("WebSocket error:", error);
        captureWebSocketFailure("WebSocket socket error", {
          endpoint: wsUrl,
          feature: "websocket",
        });
      };

      socket.onclose = () => {
        if (wsRef.current === socket) {
          wsRef.current = null;
          setWs(null);
        }
        if (disposed) return;

        console.log("WebSocket connection closed");
        // Auto-reconnect with exponential backoff
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30s
        console.log(`Reconnecting in ${delay}ms (attempt ${attempt + 1})`);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (disposed) return;
          reconnectAttemptRef.current = attempt + 1;
          connectWebSocket();
        }, delay);
      };
    };

    const initialConnectTimer = window.setTimeout(connectWebSocket, 400);

    // Reconnect on visibility change (when PWA comes to foreground)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("Dashboard visible, checking WebSocket connection...");
        const currentSocket = wsRef.current;
        if (
          !currentSocket
          || currentSocket.readyState === WebSocket.CLOSED
          || currentSocket.readyState === WebSocket.CLOSING
        ) {
          connectWebSocket();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      window.clearTimeout(initialConnectTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      const currentSocket = wsRef.current;
      if (currentSocket) {
        currentSocket.onclose = null;
        currentSocket.close();
        if (wsRef.current === currentSocket) {
          wsRef.current = null;
        }
      }
      setWs(null);
    };
  }, [
    wsUrl,
    id,
    accessToken,
    clearUnreadForTable,
    incrementUnreadForTable,
    isChefDashboard,
    isStaffDashboard,
    refreshStaffServiceAlerts,
    scheduleActiveChatReadSync,
    setUnreadCountSafe,
  ]);

  const unreadTableSummary = formatUnreadTableSummary(unreadTables);
  const assistanceQueue = getStaffAssistanceQueue(staffServiceAlerts, 3);
  const queuedAssistanceCount = assistanceQueue.queuedAlerts.length;
  const visibleServiceAlerts = [
    ...assistanceQueue.visibleAlerts.map((alert) => ({ kind: "assistance" as const, alert })),
    ...cashServiceAlerts.map((alert) => ({ kind: "cash" as const, alert })),
    ...readyOrderAlerts.map((alert) => ({ kind: "ready" as const, alert })),
  ].slice(0, 4);

  return (
    <WebSocketContext.Provider
      value={{
        ws,
        messages,
        response,
        unreadCount,
        unreadTables,
        dashboardTables,
        unreadTableSummary,
        setUnreadCount: setUnreadCountSafe,
        clearUnreadForTable,
        incrementUnreadForTable,
        setActiveChatDeviceId,
        markChatReadForTable,
      }}
    >
      {children}
      {isStaffDashboard && (visibleServiceAlerts.length > 0 || queuedAssistanceCount > 0) && (
        <div
          className="pointer-events-none fixed right-6 bottom-6 z-[9999] flex flex-col-reverse gap-3"
          style={{ maxWidth: 380, width: "calc(100vw - 48px)" }}
        >
          <AnimatePresence initial={false}>
            {visibleServiceAlerts.map((entry) => {
              const isCash = entry.kind === "cash";
              const isReady = entry.kind === "ready";
              const key = isCash
                ? entry.alert.id
                : isReady
                  ? `ready-${entry.alert.id}`
                  : `assistance-${entry.alert.id}`;
              const tableName = isCash
                ? entry.alert.tableName
                : isReady
                  ? entry.alert.tableName
                  : String(entry.alert.tableName || entry.alert.table_name || `Table ${entry.alert.tableNumber || entry.alert.table_number || ""}`);
              const alertCurrency = isCash
                ? entry.alert.currency || getActiveRestaurantCurrency()
                : getActiveRestaurantCurrency();
              return (
                <motion.div
                  key={key}
                  initial={{ x: 60, opacity: 0, scale: 0.96 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ x: 80, opacity: 0, scale: 0.94 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="pointer-events-auto overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl shadow-slate-900/10"
                >
                  <div className="h-[3px] bg-[#0055FE]" />
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 pt-1">
                        {isCash ? (
                          <Banknote className="h-5 w-5 text-[#0055FE]" strokeWidth={1.8} />
                        ) : isReady ? (
                          <PackageCheck className="h-5 w-5 text-[#0055FE]" strokeWidth={1.8} />
                        ) : (
                          <BellRing className="h-5 w-5 text-[#0055FE]" strokeWidth={1.8} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm leading-snug font-bold text-slate-900">
                            {isCash ? "Cash Payment Requested" : isReady ? "Order Ready" : "Assistance Requested"}
                          </p>
                          <span className="shrink-0 text-[10px] font-medium text-slate-400">Now</span>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          {isCash
                            ? `${tableName} would like to pay by cash`
                            : isReady
                              ? `${tableName} is ready to serve`
                              : `${tableName} needs a team member`}
                        </p>
                        {isCash && (
                          <div className="mt-1.5 space-y-0.5">
                            <p className="text-xs font-bold text-[#0055FE]">
                              Collect now: {alertCurrency} {entry.alert.amount.toFixed(2)}
                            </p>
                            {Number(entry.alert.alreadyPaid || 0) > 0 && (
                              <p className="text-[10px] text-slate-400">
                                Already paid: {alertCurrency} {Number(entry.alert.alreadyPaid).toFixed(2)}
                                {entry.alert.total !== undefined && ` · Total: ${alertCurrency} ${Number(entry.alert.total).toFixed(2)}`}
                              </p>
                            )}
                          </div>
                        )}
                        {isReady && (
                          <p className="mt-1.5 text-xs font-bold text-[#0055FE]">
                            Order #{entry.alert.id} · {getActiveRestaurantCurrency()} {entry.alert.amount.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => {
                          if (isCash) {
                            void handleCashCollected(entry.alert);
                          } else if (isReady) {
                            navigate(
                              getStaffOrdersPath(window.location.pathname),
                              { state: createStaffOrderViewState(entry.alert.order) },
                            );
                          } else {
                            void handleServiceAttended(entry.alert);
                          }
                        }}
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0055FE] px-4 py-2 text-xs font-bold text-white transition-all hover:bg-[#0044dd] active:scale-95"
                      >
                        {isReady
                          ? <ArrowRight size={12} strokeWidth={2.5} />
                          : <Check size={12} strokeWidth={2.5} />}
                        {isCash ? "Cash Collected" : isReady ? "View Order" : "Attended"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {queuedAssistanceCount > 0 && (
            <div className="flex justify-end">
              <div className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span className="text-[11px] font-semibold text-amber-700">
                  {queuedAssistanceCount} more table{queuedAssistanceCount > 1 ? "s" : ""} in queue
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);

export default WebSocketProvider;
