import React, { useState, useEffect, useContext } from "react";
import axiosInstance from "@/lib/axios";
import { WebSocketContext } from "@/hooks/WebSocketProvider";

interface OrderItem {
  item_name: string;
  quantity: number;
  price: string;
}

interface Order {
  created_time: string;
  device: number;
  device_name: string;
  id: number;
  order_items: OrderItem[];
  status: string;
  total_price: string;
}

const OrderTable = () => {
  const { messages } = useContext(WebSocketContext); // WebSocket messages
  const [ordersData, setOrdersData] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(false); // Loading state for fetching orders

  // -------- 1️⃣ Manual fetch using Axios --------
  const fetchOrders = async () => {
    setLoading(true); // Set loading to true
    const parseUser = JSON.parse(localStorage.getItem("userInfo") || "{}");
    const userRole = parseUser.role;

    if (userRole === "chef") {
      try {
        const response = await axiosInstance.get("/chef/orders/");
        setOrdersData(response.data.results.orders);
      } catch (error) {
        console.error("Error fetching orders data:", error);
      } finally {
        setLoading(false); // Set loading to false after fetching
      }
    }
  };

  // Fetch orders when component mounts
  useEffect(() => {
    fetchOrders();
  }, []);

  // -------- 2️⃣ Listen for WebSocket updates --------
  useEffect(() => {
    messages.forEach((msg) => {
      try {
        const data = typeof msg === "string" ? JSON.parse(msg) : msg;
        console.log(data, "its data"); // Log the received data

        // Assuming the server sends { order: { ... } } for new or updated orders
        if (data?.order) {
          setOrdersData((prevOrders) => {
            const exists = prevOrders.find((o) => o.id === data.order.id);
            if (exists) {
              // Update existing order
              return prevOrders.map((o) =>
                o.id === data.order.id ? { ...o, ...data.order } : o
              );
            } else {
              // Add new order at the top
              return [data.order, ...prevOrders];
            }
          });
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    });
  }, [messages]);

  // Format date and time for display
  const formatDateTime = (dateString: string) =>
    new Date(dateString).toLocaleString();

  // -------- 3️⃣ Handle Status Change --------
  const handleStatusChange = async (orderId: number, newStatus: string) => {
    console.log("Updating status for order ID:", orderId); // Log the order ID

    try {
      const response = await axiosInstance.patch(
        `/chef/orders/${orderId}/status/`,
        {
          status: newStatus,
        }
      );
      console.log(
        `Status for order ${orderId} updated to ${newStatus}`,
        response.data
      );
    } catch (error) {
      console.error(
        "Error updating order status in the database:",
        error.response?.data || error.message
      );
    }
  };

  return (
    <div className="overflow-x-auto">
      {/* Loading indicator */}
      {loading && <div className="loading">Loading Orders...</div>}

      <button
        className="mb-2 bg-blue-600 text-white px-4 py-2 rounded-md"
        onClick={fetchOrders}
      >
        Refresh Orders
      </button>

      <table className="w-full table-auto text-left clever-table">
        <thead className="table-header">
          <tr>
            <th>Table Name</th>
            <th>Ordered Items</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Timer of order</th>
            <th>Order Id</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody className="bg-sidebar text-sm">
          {ordersData.map((item) => (
            <tr key={item.id} className="border-b border-[#1C1E3C]">
              <td className="p-4 text-primary-text">{item.device_name}</td>
              <td className="p-4 text-primary-text">
                {item.order_items?.[0]?.item_name || "N/A"}
              </td>
              <td className="p-4 text-primary-text">
                {item.order_items.length || "N/A"}
              </td>
              <td className="p-4 text-primary-text">
                AED {item.total_price || "N/A"}
              </td>
              <td className="p-4 text-primary-text">
                <span className="font-medium">
                  {formatDateTime(item.created_time)}
                </span>
              </td>
              <td className="p-4 text-primary-text">{item.id}</td>
              <td className="p-4 text-primary-text">
                <select
                  className="bg-gray-800 text-gray-300 border border-gray-600 p-2 rounded-md transition ease-in-out duration-300"
                  value={item.status}
                  onChange={(e) => handleStatusChange(item.id, e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="served">Served</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default OrderTable;
