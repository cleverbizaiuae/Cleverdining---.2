import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { useContext, useEffect, useState, useRef, useCallback } from "react";
import { Order } from "./order-types";
import { OrderCard } from "./order-card";
import { Footer } from "../../components/Footer";
import { GameHub } from "./game-hub";
import { Gamepad2, Receipt } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { StickyTotalPayBar } from "../../components/StickyTotalPayBar";
import { SocketContext } from "@/components/SocketContext";

// ========================================================================
// DEBUG FLAG — set to true for full pipeline logging
// ========================================================================
const DEBUG = true;
function log(...args: any[]) {
  if (DEBUG) console.log("[ORDER-SCREEN]", ...args);
}

const ScreenOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isGameHubOpen, setIsGameHubOpen] = useState(false);
  const navigate = useNavigate();

  // Refs for WebSocket lifecycle
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isMountedRef = useRef(true);

  const accessToken = localStorage.getItem("accessToken");
  const userInfo = localStorage.getItem("userInfo");
  const parsedUserInfo = userInfo ? JSON.parse(userInfo) : null;

  // ========================================================================
  // STEP A: Robust device_id extraction
  // ========================================================================
  let device_id = parsedUserInfo?.user?.restaurants?.[0]?.device_id;
  if (!device_id) {
    device_id = parsedUserInfo?.table_id || parsedUserInfo?.device_id || parsedUserInfo?.user?.device_id;
  }
  log("Device ID resolved:", device_id);
  log("User info structure:", JSON.stringify(parsedUserInfo, null, 2).substring(0, 500));

  // ========================================================================
  // STEP B: Fetch orders (background-safe — no loading flash on WS updates)
  // ========================================================================
  const fetchOrders = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
        setErr(null);
      }

      const guestSessionToken = localStorage.getItem("guest_session_token");
      log(`fetchOrders(isInitial=${isInitial}) | session_token=${guestSessionToken?.substring(0, 15)}...`);

      const res = await axiosInstance.get(`/api/customer/uncomplete/orders/`, {
        headers: guestSessionToken ? { 'X-Guest-Session-Token': guestSessionToken } : {},
        params: device_id ? { device_id } : {}
      });
      const d = res?.data;

      const list: Order[] = Array.isArray(d)
        ? d
        : d?.results ?? d?.orders ?? [];

      log(`fetchOrders → got ${list.length} orders:`, list.map(o => `#${o.id}:${o.status}`).join(', '));

      if (isMountedRef.current) {
        setOrders(Array.isArray(list) ? list : []);
      }
    } catch (e: unknown) {
      console.error("Failed to fetch orders:", e);
      if (isInitial && isMountedRef.current) {
        setErr(e instanceof Error ? e.message : "Failed to fetch orders.");
      }
    } finally {
      if (isInitial && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [device_id]);

  // ========================================================================
  // STEP C: WebSocket connection with full debug + reconnect + visibility
  // ========================================================================
  useEffect(() => {
    isMountedRef.current = true;
    fetchOrders(true);

    if (!device_id) {
      log("⚠️ NO device_id — WebSocket will NOT connect. Orders page has no live updates.");
      return;
    }

    const connectWebSocket = () => {
      // Close existing socket if any
      if (socketRef.current) {
        try { socketRef.current.close(); } catch (e) { }
        socketRef.current = null;
      }

      const guestSessionToken = localStorage.getItem("guest_session_token");
      const token = guestSessionToken || accessToken || "guest_token";

      // Robust WS URL resolution
      let wsBaseUrl = import.meta.env.VITE_WS_URL;
      if (!wsBaseUrl) {
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
        wsBaseUrl = apiUrl.replace(/^http/, 'ws');
      }

      const wsUrl = `${wsBaseUrl}/ws/order/${device_id}/?token=${token}`;
      log(`🔌 Connecting WS | url=${wsUrl}`);
      log(`   token=${token?.substring(0, 20)}... | device_id=${device_id}`);

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      // ====== SOCKET OPEN ======
      socket.onopen = () => {
        log(`✅ WS CONNECTED | readyState=${socket.readyState} | room=device_${device_id}`);
        reconnectAttemptRef.current = 0; // Reset backoff on success
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      // ====== SOCKET MESSAGE ======
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          log(`📨 WS MESSAGE received:`, JSON.stringify(data));

          // ──── INLINE STATUS UPDATE (instant, no API call) ────
          if (data.type === 'order_status_update' && data.order_id != null && data.status) {
            log(`🔄 INLINE UPDATE: Order #${data.order_id} → "${data.status}" | session_ended=${data.session_ended} | bulk=${data.bulk}`);

            // Session ended — staff confirmed cash, navigate to success
            if (data.session_ended === true) {
              log(`🎉 SESSION ENDED — navigating to success page`);
              navigate('/dashboard/success');
              return;
            }

            // Bulk cash update — update ALL orders in state
            if (data.bulk === true && data.status === 'awaiting_cash') {
              log(`💵 BULK awaiting_cash — updating all orders`);
              setOrders((prevOrders) =>
                prevOrders.map((order) => ({
                  ...order,
                  status: 'awaiting_cash',
                  payment_status: 'pending_cash',
                }))
              );
              return;
            }

            setOrders((prevOrders) => {
              const found = prevOrders.find(o => o.id === data.order_id);
              if (!found) {
                log(`⚠️ Order #${data.order_id} NOT in current state (${prevOrders.length} orders: [${prevOrders.map(o => o.id).join(',')}])`);
                fetchOrders(false);
                return prevOrders;
              }

              log(`   BEFORE: Order #${found.id} status="${found.status}"`);
              const updated = prevOrders.map((order) =>
                order.id === data.order_id
                  ? {
                    ...order,
                    status: data.status,
                    // Also update payment_status for cash flow
                    ...(data.status === 'awaiting_cash' ? { payment_status: 'pending_cash' } : {}),
                    ...(data.status === 'paid' || data.status === 'completed' ? { payment_status: 'paid' } : {}),
                  }
                  : order
              );
              log(`   AFTER:  Order #${data.order_id} status="${data.status}" | React will re-render`);
              return updated;
            });
          }

          // ──── INLINE PAYMENT UPDATE ────
          if (data.type === 'payment_status_update' && data.order_id != null) {
            log(`💰 INLINE PAYMENT UPDATE: Order #${data.order_id} → "${data.payment_status}"`);
            setOrders((prevOrders) =>
              prevOrders.map((order) =>
                order.id === data.order_id
                  ? { ...order, payment_status: data.payment_status || order.payment_status }
                  : order
              )
            );
          }

          // ──── BACKGROUND RE-FETCH for new orders / full updates ────
          if (data.type === 'order_created' || data.type === 'order_updated') {
            log(`📋 Background re-fetch triggered (type=${data.type})`);
            fetchOrders(false);
          }

        } catch (e) {
          console.error("[ORDER-SCREEN] Error parsing WS message:", e);
        }
      };

      // ====== SOCKET ERROR ======
      socket.onerror = (e) => {
        log(`❌ WS ERROR:`, e);
      };

      // ====== SOCKET CLOSE + RECONNECT ======
      socket.onclose = (e) => {
        log(`🔌 WS CLOSED | code=${e.code} reason="${e.reason}" wasClean=${e.wasClean}`);
        socketRef.current = null;

        if (!isMountedRef.current) return; // Component unmounted, don't reconnect

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        log(`🔄 Scheduling reconnect in ${delay}ms (attempt ${attempt + 1})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptRef.current = attempt + 1;
          connectWebSocket();
        }, delay);
      };
    };

    // ========================================================================
    // STEP D: PWA Visibility Change Handler (suspend/resume)
    // ========================================================================
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        log("👁️ App resumed (visibility=visible)");

        // Check if socket is dead
        const socket = socketRef.current;
        if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
          log("🔄 Socket dead after resume — reconnecting...");
          reconnectAttemptRef.current = 0; // Reset backoff
          connectWebSocket();
        } else {
          log(`   Socket alive (readyState=${socket.readyState})`);
        }

        // Also re-fetch orders in case updates were missed while backgrounded
        log("📋 Re-fetching orders after resume...");
        fetchOrders(false);
      } else {
        log("😴 App backgrounded (visibility=hidden)");
      }
    };

    // GUARANTEED POLLING FALLBACK — fetches every 10s regardless of WS status
    const pollInterval = setInterval(() => {
      log("⏰ Poll tick — fetching orders...");
      fetchOrders(false);
    }, 10000);

    // Start connection
    connectWebSocket();

    // Listen for visibility changes (PWA suspend/resume)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      isMountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(pollInterval);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        try { socketRef.current.close(); } catch (e) { }
        socketRef.current = null;
      }
    };
  }, [device_id, accessToken, fetchOrders]);

  // ========================================================================
  // STEP E: SocketContext backup listener (restaurant-level WS)
  // ========================================================================
  const socketCtx = useContext(SocketContext);
  useEffect(() => {
    if (!socketCtx?.response || !socketCtx.response.type) return;

    const data = socketCtx.response;
    log(`📡 SocketContext event: ${data.type}`);

    if (
      data.type === 'order_status_update' ||
      data.type === 'order_created' ||
      data.type === 'order_updated' ||
      data.type === 'new_order' ||
      data.type === 'order_paid' ||
      data.type === 'cash_payment_alert' ||
      data.type === 'cash_payment_confirmed'
    ) {
      log(`📡 Re-fetching orders due to SocketContext event: ${data.type}`);
      fetchOrders(false);
    }
  }, [socketCtx?.response, fetchOrders]);

  // ========================================================================
  // Handle Payment Cancellation Redirect
  // ========================================================================
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    const reason = params.get("reason");

    if (paymentStatus === "cancelled" || paymentStatus === "failed") {
      window.history.replaceState({}, '', window.location.pathname);

      let msg = "Payment was not completed. Please try again.";

      if (
        paymentStatus === 'cancelled' ||
        reason === 'user_cancelled' ||
        (paymentStatus === 'failed' && (reason === 'unknown' || !reason))
      ) {
        msg = "Payment cancelled by user.";
      } else if (reason) {
        msg = `Payment failed: ${decodeURIComponent(reason)}`;
      }

      setTimeout(() => {
        toast.error(msg, {
          duration: 5000,
          icon: '⚠️',
        });
      }, 500);
    }
  }, []);

  const handleCheckout = (order: Order) => {
    navigate(`/dashboard/checkout?orderId=${order.id}`, { state: { orderId: order.id } });
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* 1. Header Area */}
      <div className="bg-white rounded-b-3xl shadow-sm p-6 flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-3xl font-bold text-gray-900">My Orders</h1>

        {/* Wait & Play Button */}
        <button
          onClick={() => setIsGameHubOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-md hover:bg-indigo-700 transition-transform active:scale-95"
        >
          <Gamepad2 size={18} />
          <span className="text-sm font-bold">Wait & Play</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 pb-40">
        {loading && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-2"></div>
            <p>Loading orders...</p>
          </div>
        )}

        {err && !loading && (
          <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-center">
            {err}
          </div>
        )}

        {!loading && !err && (
          <div className="flex flex-col gap-6">
            {orders.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                  <Receipt size={32} className="text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No active orders</h3>
                <p className="text-gray-500 mb-8 max-w-[200px]">
                  Looks like you haven't ordered anything yet.
                </p>
                <button
                  onClick={() => setIsGameHubOpen(true)}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                  <Gamepad2 size={18} />
                  Play Games Instead
                </button>
              </div>
            ) : (
              /* Order Card List with AnimatePresence for smooth transitions */
              <AnimatePresence mode="popLayout">
                {orders.map((order) => (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                  >
                    <OrderCard
                      order={order}
                      onCheckout={handleCheckout}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <Footer />
          </div>
        )}
      </div>

      {/* Wait & Play Overlay */}
      <GameHub
        isOpen={isGameHubOpen}
        close={() => setIsGameHubOpen(false)}
      />

      {/* Sticky Total Pay Bar - Hidden when playing games */}
      {!isGameHubOpen && <StickyTotalPayBar orders={orders} />}
    </div>
  );
};

export default ScreenOrders;
