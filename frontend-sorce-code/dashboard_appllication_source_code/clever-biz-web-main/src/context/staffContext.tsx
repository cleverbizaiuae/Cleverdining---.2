/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRole } from "@/hooks/useRole";
import { WebSocketContext } from "@/hooks/WebSocketProvider";
import axiosInstance from "@/lib/axios";
import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useEffect,
} from "react";
import toast from "react-hot-toast";

// Define the type of each category (adjust fields based on actual API)
interface Category {
  id: number;
  Category_name: string;
}

// Define device item type
interface DeviceItem {
  id: number;
  table_name: string;
  restaurant: number;
  action: string;
  restaurant_name: string;
  username: string;
}

// Define food item type
interface FoodItem {
  id: number;
  image: string;
  name: string;
  price: number;
  category: string;
  available: boolean;
}

// Define order item type
interface OrderItem {
  id: number;
  userName: string;
  guestNo: number;
  device_name: string;
  order_items: Array<{
    item_name: string;
    quantity: number;
    price: number;
  }>;
  created_time: string;
  status: "Pending" | "Completed" | "Cancelled" | "Served" | "Preparing";
}

// Define reservation item type
interface ReservationItem {
  id: number;
  reservationId: string;
  customerName: string;
  tableNo: string;
  guestNo: number;
  cellNumber: string;
  email: string;
  reservationTime: string;
  customRequest: string;
}

// Define reservation status report type
interface ReservationStatusReport {
  total_active_accepted_reservations: number;
  last_month_reservations: number;
  running_month_reservations: number;
}

// Define status summary type
interface StatusSummary {
  available_items_count: number;
  processing_orders_count: number;
  pending_orders_count: number;
}

// Define orders stats type
interface OrdersStats {
  ongoing_orders: number;
  today_completed_order_price: number;
  total_completed_orders: number;
  total_ongoing_orders: number;
}

// Define the context type
interface StaffContextType {
  categories: Category[];
  foodItems: FoodItem[];
  foodItemsCount: number;
  currentPage: number;
  searchQuery: string;
  orders: OrderItem[];
  ordersCount: number;
  ordersCurrentPage: number;
  ordersSearchQuery: string;
  reservations: ReservationItem[];
  reservationsCount: number;
  reservationsCurrentPage: number;
  reservationsSearchQuery: string;
  reservationStatusReport: ReservationStatusReport | null;
  allDevices: DeviceItem[];
  devicesSearchQuery: string;
  devicesCurrentPage: number;
  devicesCount: number;
  statusSummary: StatusSummary | null;
  ordersStats: OrdersStats | null;
  fetchStatusSummary: () => Promise<void>;
  fetchFoodItems: (page?: number, search?: string) => Promise<void>;
  fetchOrders: (page?: number, search?: string) => Promise<void>;
  updateOrderStatus: (id: number, status: string) => Promise<void>;
  setCurrentPage: (page: number) => void;
  setSearchQuery: (query: string) => void;
  setOrdersCurrentPage: (page: number) => void;
  setOrdersSearchQuery: (query: string) => void;
  setReservationsCurrentPage: (page: number) => void;
  setReservationsSearchQuery: (query: string) => void;
  setAllDevices: (devices: DeviceItem[]) => void;
  setDevicesSearchQuery: (query: string) => void;
  setDevicesCurrentPage: (page: number) => void;
  setOrders: React.Dispatch<React.SetStateAction<OrderItem[]>>;
}

// Create the context
export const StaffContext = createContext<StaffContextType | undefined>(
  undefined
);

// Create the provider
export const StaffProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [foodItemsCount, setFoodItemsCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [ordersCount, setOrdersCount] = useState(0);
  const [ordersCurrentPage, setOrdersCurrentPage] = useState(1);
  const [ordersSearchQuery, setOrdersSearchQuery] = useState("");
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [reservationsCount, setReservationsCount] = useState(0);
  const [reservationsCurrentPage, setReservationsCurrentPage] = useState(1);
  const [reservationsSearchQuery, setReservationsSearchQuery] = useState("");
  const [reservationStatusReport, setReservationStatusReport] =
    useState<ReservationStatusReport | null>(null);
  const [allDevices, setAllDevices] = useState<DeviceItem[]>([]);
  const [devicesSearchQuery, setDevicesSearchQuery] = useState("");
  const [devicesCurrentPage, setDevicesCurrentPage] = useState(1);
  const [devicesCount, setDevicesCount] = useState(0);
  const [statusSummary, setStatusSummary] = useState<StatusSummary | null>(
    null
  );
  const [ordersStats, setOrdersStats] = useState<OrdersStats | null>(null);
  const { userRole, isLoading } = useRole();
  const { response } = useContext(WebSocketContext);
  const fetchStatusSummary = useCallback(async () => {
    if (!userRole) return;
    let endpoint = "";
    if (userRole === "staff") {
      endpoint = "/staff/items/status-summary/";
    } else if (userRole === "chef") {
      endpoint = "/chef/items/status-summary/";
    } else {
      return;
    }
    try {
      const response = await axiosInstance.get(endpoint);
      setStatusSummary(response.data);
      console.log(response.data, "summary");
    } catch (error: any) {
      console.error("Failed to load status summary", error);
      if (error.response?.status !== 401 && error.response?.status !== 403) {
        toast.error("Failed to load status summary.");
      }
    }
  }, [userRole]);

  const fetchFoodItems = useCallback(
    async (page: number = currentPage, search?: string) => {
      if (!userRole) return;
      let endpoint = "";
      if (userRole === "staff") {
        endpoint = `/staff/items/?page=${page}&search=${search || ""}`;
      } else if (userRole === "chef") {
        endpoint = `/chef/items/?page=${page}&search=${search || ""}`;
      } else {
        return;
      }
      try {
        const response = await axiosInstance.get(endpoint);
        console.log(response, "response from fetch food items");
        const { results, count } = response.data;
        console.log("Fetched food items:", response.data);
        const formattedItems = results.map((item: any) => ({
          id: item.id,
          image: item.image1 ?? "https://source.unsplash.com/80x80/?food",
          name: item.item_name,
          price: parseFloat(item.price),
          category: item.category_name,
          available: item.availability,
        }));

        setFoodItems(formattedItems);
        setFoodItemsCount(count || 0);
        setCurrentPage(page);
      } catch (error: any) {
        console.error("Failed to load food items", error);
        // Only show toast for non-auth errors since interceptor handles auth
        if (error.response?.status !== 401 && error.response?.status !== 403) {
          // toast.error("Failed to load food items.");
        }
      }
    },
    [currentPage, userRole]
  );

  const fetchOrders = useCallback(async (page?: number, search?: string) => {
    try {
      let endpoint = "";
      if (userRole === "staff") {
        endpoint = `/staff/orders/`;
      } else if (userRole === "chef") {
        endpoint = `/chef/orders/`;
      } else {
        return;
      }

      const response = await axiosInstance.get(endpoint, {
        params: { page: page, search: search },
      });
      console.log(response, "response from fetch orders");
      const { results, count } = response.data;
      console.log("Fetched orders:", response.data);
      setOrdersStats(results.stats);

      // Handle both array and object with orders property
      const ordersData = Array.isArray(results)
        ? results
        : results?.orders || [];

      setOrders(ordersData);
      setOrdersCount(count || 0);
      setOrdersCurrentPage(page || 1);
    } catch (error: any) {
      console.error("Failed to load orders", error);
      // Only show toast for non-auth errors since interceptor handles auth
      if (error.response?.status !== 401 && error.response?.status !== 403) {
        toast.error("Failed to load orders.");
      }
    }
  }, []);

  const updateOrderStatus = useCallback(
    async (id: number, status: string) => {
      try {
        const endpoint =
          userRole === "staff"
            ? `/staff/orders/status/${id}/`
            : `/chef/orders/status/${id}/`;
        const response = await axiosInstance.patch(endpoint, {
          status: status.toLowerCase(),
        });

        toast.success("Order status updated successfully!");

        // Update local orders state immediately for instant feedback
        setOrders((prevOrders) => {
          // Ensure prevOrders is an array before mapping
          if (!Array.isArray(prevOrders)) {
            console.warn("prevOrders is not an array:", prevOrders);
            return prevOrders;
          }

          return prevOrders.map((order) =>
            order.id === id ? { ...order, status: status as any } : order
          );
        });

        console.log("Order status updated:", response.data);
      } catch (error: any) {
        console.error("Failed to update order status", error);
        toast.error("Failed to update order status.");
        throw error;
      }
    },
    [setOrders]
  );
  useEffect(() => {
 if (
      response.type === "order_created" ||
      response.type === "order_updated"
    ) {
      fetchOrders(ordersCurrentPage, ordersSearchQuery);
    } else if (
      response.type === "device_created" ||
      response.type === "device_updated" ||
      response.type === "device_deleted"
    ) {
      // fetchAllDevices(devicesCurrentPage, devicesSearchQuery);
    }
  }, [response,ordersCurrentPage, ordersSearchQuery,fetchOrders]);
  const value: StaffContextType = {
    categories,
    foodItems,
    foodItemsCount,
    currentPage,
    searchQuery,
    orders,
    ordersCount,
    ordersCurrentPage,
    ordersSearchQuery,
    reservations,
    reservationsCount,
    reservationsCurrentPage,
    reservationsSearchQuery,
    reservationStatusReport,
    allDevices,
    devicesSearchQuery,
    devicesCurrentPage,
    devicesCount,
    statusSummary,
    ordersStats,
    fetchStatusSummary,
    fetchFoodItems,
    fetchOrders,
    updateOrderStatus,
    setCurrentPage,
    setSearchQuery,
    setOrdersCurrentPage,
    setOrdersSearchQuery,
    setReservationsCurrentPage,
    setReservationsSearchQuery,
    setAllDevices,
    setDevicesSearchQuery,
    setDevicesCurrentPage,
    setOrders,
  };

  return (
    <StaffContext.Provider value={value}>{children}</StaffContext.Provider>
  );
};

// Custom hook to consume the context
export const useStaff = () => {
  const context = useContext(StaffContext);
  if (!context) {
    throw new Error("useStaff must be used within a StaffProvider");
  }
  return context;
};
