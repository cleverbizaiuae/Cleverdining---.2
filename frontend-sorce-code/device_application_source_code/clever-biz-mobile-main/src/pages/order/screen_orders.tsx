import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { useEffect, useState, useRef } from "react";
import { Order } from "./order-types";
import { OrderCard } from "./order-card";
import { Footer } from "../../components/Footer";
import { GameHub } from "./game-hub";
import { Gamepad2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { StickyTotalPayBar } from "../../components/StickyTotalPayBar";

const ScreenOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isGameHubOpen, setIsGameHubOpen] = useState(false);
  const navigate = useNavigate();

  // Debounce ref for WebSocket updates
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const accessToken = localStorage.getItem("accessToken");
  const userInfo = localStorage.getItem("userInfo");
  const device_id = userInfo
    ? JSON.parse(userInfo).user.restaurants[0].device_id
    : null;

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        setErr(null);
        setOrders([]); // Clear stale state before fetch to ensure fresh data

        // Use session token for proper session-based filtering
        const guestSessionToken = localStorage.getItem("guest_session_token");

        const res = await axiosInstance.get(`/api/customer/uncomplete/orders/`, {
          headers: guestSessionToken ? { 'X-Guest-Session-Token': guestSessionToken } : {},
          params: device_id ? { device_id } : {} // Fallback for legacy support
        });
        const d = res?.data;

        const list: Order[] = Array.isArray(d)
          ? d
          : d?.results ?? d?.orders ?? [];

        setOrders(Array.isArray(list) ? list : []);
      } catch (e: unknown) {
        console.error("Failed to fetch orders:", e);

        if (e instanceof Error) {
          setErr(e.message);
        } else {
          setErr("Failed to fetch orders.");
        }
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();

    // Robust WebSocket Management
    let socket: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWebSocket = () => {
      const guestSessionToken = localStorage.getItem("guest_session_token");
      const token = accessToken || guestSessionToken || "guest_token";

      // Robust WS URL resolution
      let wsBaseUrl = import.meta.env.VITE_WS_URL;
      if (!wsBaseUrl) {
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
        wsBaseUrl = apiUrl.replace(/^http/, 'ws');
      }

      const wsUrl = `${wsBaseUrl}/ws/order/${device_id}/?token=${token}`;
      console.log("Connecting to Orders WebSocket:", wsUrl);

      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("Orders WebSocket connection established");
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("Received order update:", data);
          // No, the effect re-runs if deps change, but `connectWebSocket` is defined inside.
          // The socket callback is a closure.

          // Best approach: Add `debounceRef` to the component and use it.
          // But I need to update the component top-level to add `debounceRef`.
          // I will abort this tool call and do a larger replace or two replaces.
        } catch (e) {
          console.error("Error parsing order websocket message:", e);
        }
      };

      socket.onclose = () => {
        console.log("Orders WebSocket connection closed. Reconnecting in 3s...");
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };

      socket.onerror = (e) => {
        console.error("Orders WebSocket Error:", e);
      };
    };

    if (device_id) {
      connectWebSocket();
    }

    return () => {
      if (socket) socket.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [device_id, accessToken]);

  // Handle Payment Cancellation Redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    const reason = params.get("reason");

    if (paymentStatus === "cancelled" || paymentStatus === "failed") {
      // Clear the param to prevent toast on reload
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
    // Navigate to checkout with robust ID passing
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
              /* 5. Empty State */
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
              /* 2. Order Card List */
              orders.map((order) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <OrderCard
                    order={order}
                    onCheckout={handleCheckout}
                  />
                </motion.div>
              ))
            )}
            <Footer />
          </div>
        )}
      </div>

      {/* 4. Wait & Play Overlay */}
      <GameHub
        isOpen={isGameHubOpen}
        close={() => setIsGameHubOpen(false)}
      />

      {/* 5. Sticky Total Pay Bar - Hidden when playing games */}
      {!isGameHubOpen && <StickyTotalPayBar orders={orders} />}
    </div>
  );
};

// Helper import for Empty State icon
import { Receipt } from "lucide-react";

export default ScreenOrders;
