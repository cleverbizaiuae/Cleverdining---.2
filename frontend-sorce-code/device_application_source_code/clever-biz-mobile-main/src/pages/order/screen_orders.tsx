import axiosInstance from "@/lib/axios";
import { useEffect, useState } from "react";
import { OrderRow } from "./order-row";
import { Order } from "./order-types";

const ScreenOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
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
        // Try without the search filter if unsure it’s correct:
        const res = await axiosInstance.get(`/customer/uncomplete/orders/?device_id=${device_id}`);
        const d = res?.data;

        // Handle multiple response shapes: array vs paginated object
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

    const token = accessToken || "guest_token";
    const WS_BASE_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";
    const newSoket = new WebSocket(
      `${WS_BASE_URL}/ws/order/${device_id}/?token=${token}`
    );

    newSoket.onopen = () => {
      console.log("WebSocket connection established");
    };

    newSoket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("Received message:", data);
      fetchOrders();
    };
    newSoket.onclose = () => {
      console.log("WebSocket connection closed");
    };

    return () => {
      newSoket.close();
    };
  }, [device_id, accessToken]);

  return (
    <div className="flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-medium">Order List</h1>
      </div>

      {loading && <p className="text-gray-500">Loading orders…</p>}

      {err && !loading && <p className="text-red-600">{err}</p>}

      {!loading && !err && (
        <div className="flex flex-col max-h-[90vh] overflow-y-auto scrollbar-hide pb-20 gap-3">
          {orders.length === 0 ? (
            <p className="text-center text-gray-500">No orders found.</p>
          ) : (
            orders.map((order) => <OrderRow key={order.id} order={order} />)
          )}
        </div>
      )}
    </div>
  );
};

export default ScreenOrders;
