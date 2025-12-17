/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { Member, FoodItem } from "@/types";
import { WebSocketContext } from "@/hooks/WebSocketProvider";
import { useRole } from "@/hooks/useRole";

// Define the type of each category (adjust fields based on actual API)
// Define the type of each category (adjust fields based on actual API)
export interface Category {
  id: number;
  Category_name: string;
  image?: string; // Mapped from imageUrl in spec if needed, or stick to backend naming
  parent_category?: number | null;
}

export interface SubCategory {
  id: number;
  name: string;
  category: number; // parent category id
  image?: string;
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
interface OrderItem {
  id: number;
  userName: string;
  guestNo: number;
  tableNo: string;
  orderedItems: number;
  timeOfOrder: string;
  orderId: string;
  status: "Pending" | "Completed" | "Served" | "Cancelled" | "Preparing";
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
  status?: string;
}

// Define reservation status report type
interface ReservationStatusReport {
  total_active_accepted_reservations: number;
  last_month_reservations: number;
  running_month_reservations: number;
}

// Define device stats type
interface DeviceStats {
  total_devices: number;
  active_devices: number;
  hold_devices: number;
  restaurant: string;
}

interface OrdersStats {
  total_ongoing_orders: number;
  ongoing_orders: number;
  today_completed_order_count: number;
  total_completed_orders: number;
}

// Define the context type
interface OwnerContextType {
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
  ordersStats: OrdersStats | null;
  deviceStats: DeviceStats | null;
  members: Member[];
  membersSearchQuery: string;
  fetchCategories: () => Promise<void>;
  fetchFoodItems: (page?: number, search?: string) => Promise<void>;
  fetchOrders: (page?: number, search?: string) => Promise<void>;
  fetchReservations: (
    page?: number,
    search?: string,
    date?: string
  ) => Promise<void>;
  fetchReservationStatusReport: () => Promise<void>;
  fetchAllDevices: (page?: number, search?: string) => Promise<void>;
  fetchDeviceStats: () => Promise<void>;
  fetchMembers: (search?: string) => Promise<void>;
  createMember: (formData: FormData) => Promise<void>;
  updateMemberStatus: (id: number, action: string) => Promise<void>;
  updateFoodItem: (id: number, formData: FormData) => Promise<void>;
  createFoodItem: (formData: FormData) => Promise<void>;
  deleteFoodItem: (id: number) => Promise<void>;
  updateAvailability: (id: number, available: boolean) => Promise<void>;
  updateOrderStatus: (id: number, status: string) => Promise<void>;
  updateReservationStatus: (id: number, status: string) => Promise<void>;
  setCurrentPage: (page: number) => void;
  setSearchQuery: (query: string) => void;
  setOrdersCurrentPage: (page: number) => void;
  setOrdersSearchQuery: (query: string) => void;
  setReservationsCurrentPage: (page: number) => void;
  setReservationsSearchQuery: (query: string) => void;
  setAllDevices: (devices: DeviceItem[]) => void;
  setDevicesSearchQuery: (query: string) => void;
  setDevicesCurrentPage: (page: number) => void;
  setMembersSearchQuery: (query: string) => void;
  updateDeviceStatus: (id: number, action: string) => Promise<void>;

  // Category & SubCategory Management
  subCategories: SubCategory[];
  fetchSubCategories: () => Promise<void>;
  createCategory: (formData: FormData) => Promise<void>;
  updateCategory: (id: number, formData: FormData) => Promise<void>;
  deleteCategory: (id: number) => Promise<void>;
  createSubCategory: (formData: FormData) => Promise<void>;
  updateSubCategory: (id: number, formData: FormData) => Promise<void>;
  deleteSubCategory: (id: number) => Promise<void>;

  setOrders: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  setReservations: React.Dispatch<React.SetStateAction<ReservationItem[]>>;
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
}

// Create the context
export const OwnerContext = createContext<OwnerContextType | undefined>(
  undefined
);

// Create the provider
export const OwnerProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { userRole, isLoading } = useRole();

  const [categories, setCategories] = useState<Category[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
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
  const [deviceStats, setDeviceStats] = useState<DeviceStats | null>(null);
  const [ordersStats, setOrdersStats] = useState<OrdersStats | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersSearchQuery, setMembersSearchQuery] = useState("");
  const { response } = useContext(WebSocketContext);
  useEffect(() => {
    if (!isLoading && userRole) {
      // Fetch categories directly here to avoid dependency issues
      const fetchCategoriesDirectly = async () => {
        try {
          let endpoint;
          if (userRole === "owner") {
            endpoint = "/owners/categories/";
          } else if (userRole === "staff") {
            endpoint = "/owners/categories/";
          } else if (userRole === "chef") {
            endpoint = "/chef/categories/";
          } else {
            throw new Error("Invalid user role");
          }

          const res = await axiosInstance.get(endpoint);

          setCategories(res.data);
        } catch (err) {
          console.error("Failed to load categories.");
        }
      };
      fetchCategoriesDirectly();
    }
  }, [userRole, isLoading]);

  const fetchCategories = useCallback(async () => {
    if (isLoading || !userRole) return;
    try {
      // Assuming generic endpoint pattern or specific one
      const endpoint = (userRole === "owner" || userRole === "staff") ? "/owners/categories/" : "/chef/categories/";
      const res = await axiosInstance.get(endpoint);
      setCategories(res.data);
    } catch (err: any) {
      console.error("Failed to load categories.", err);
      // toast.error(`Failed to load categories: ${err.response?.status || 'Error'}`);
    }
  }, [userRole, isLoading]);

  const fetchSubCategories = useCallback(async () => {
    if (isLoading || !userRole) return;
    try {
      const endpoint = (userRole === "owner" || userRole === "staff") ? "/owners/sub-categories/" : "/chef/sub-categories/";
      const res = await axiosInstance.get(endpoint);
      setSubCategories(res.data);
    } catch (err) {
      console.error("Failed to load sub-categories.");
    }
  }, [userRole, isLoading]);

  // CATEGORY CRUD
  const createCategory = useCallback(async (formData: FormData) => {
    try {
      const endpoint = userRole === "owner" ? "/owners/categories/" : "/staff/categories/";
      await axiosInstance.post(endpoint, formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Category created successfully");
      fetchCategories();
    } catch (err) {
      console.error("Failed to create category", err);
      toast.error("Failed to create category");
      throw err;
    }
  }, [userRole, fetchCategories]);

  const updateCategory = useCallback(async (id: number, formData: FormData) => {
    try {
      const endpoint = userRole === "owner" ? `/owners/categories/${id}/` : `/staff/categories/${id}/`;
      await axiosInstance.patch(endpoint, formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Category updated successfully");
      fetchCategories();
    } catch (err) {
      console.error("Failed to update category", err);
      toast.error("Failed to update category");
      throw err;
    }
  }, [userRole, fetchCategories]);

  const deleteCategory = useCallback(async (id: number) => {
    try {
      const endpoint = userRole === "owner" ? `/owners/categories/${id}/` : `/staff/categories/${id}/`;
      await axiosInstance.delete(endpoint);
      toast.success("Category deleted successfully");
      fetchCategories();
      fetchSubCategories(); // Cascade
    } catch (err) {
      console.error("Failed to delete category", err);
      toast.error("Failed to delete category");
      throw err;
    }
  }, [userRole, fetchCategories]);

  // SUBCATEGORY CRUD
  const createSubCategory = useCallback(async (formData: FormData) => {
    try {
      const endpoint = userRole === "owner" ? "/owners/sub-categories/" : "/staff/sub-categories/";
      await axiosInstance.post(endpoint, formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Sub-Category created successfully");
      fetchSubCategories();
    } catch (err) {
      console.error("Failed to create sub-category", err);
      toast.error("Failed to create sub-category");
      throw err;
    }
  }, [userRole, fetchSubCategories]);

  const updateSubCategory = useCallback(async (id: number, formData: FormData) => {
    try {
      const endpoint = userRole === "owner" ? `/owners/sub-categories/${id}/` : `/staff/sub-categories/${id}/`;
      await axiosInstance.patch(endpoint, formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Sub-Category updated successfully");
      fetchSubCategories();
    } catch (err) {
      console.error("Failed to update sub-category", err);
      toast.error("Failed to update sub-category");
      throw err;
    }
  }, [userRole, fetchSubCategories]);

  const deleteSubCategory = useCallback(async (id: number) => {
    try {
      const endpoint = userRole === "owner" ? `/owners/sub-categories/${id}/` : `/staff/sub-categories/${id}/`;
      await axiosInstance.delete(endpoint);
      toast.success("Sub-Category deleted successfully");
      fetchSubCategories();
    } catch (err) {
      console.error("Failed to delete sub-category", err);
      toast.error("Failed to delete sub-category");
      throw err;
    }
  }, [userRole, fetchSubCategories]);

  const fetchFoodItems = useCallback(
    async (page: number = currentPage, search?: string) => {
      // Don't fetch if still loading or if userRole is null
      if (isLoading || !userRole) {
        return;
      }

      try {
        let endpoint;
        if (userRole === "owner") {
          endpoint = `/owners/items/?page=${page}&search=${search || ""}`;
        } else if (userRole === "staff") {
          endpoint = `/owners/items/?page=${page}&search=${search || ""}`;
        } else if (userRole === "chef") {
          endpoint = `/chef/items/?page=${page}&search=${search || ""}`;
        } else {
          throw new Error("Invalid user role");
        }

        const response = await axiosInstance.get(endpoint);
        const { results, count } = response.data;
        const formattedItems = results.map((item: any) => ({
          id: item.id,
          image1: item.image1 ?? "https://source.unsplash.com/80x80/?food",
          image: item.image1 ?? "https://source.unsplash.com/80x80/?food",
          name: item.item_name,
          price: parseFloat(item.price),
          category: item.category_name,
          available: item.availability,
        }));

        setFoodItems(formattedItems);
        setFoodItemsCount(count || 0);
        setCurrentPage(page);
      } catch (error) {
        console.error("Failed to load food items", error);
        // toast.error("Failed to load food items.");
      }
    },
    [currentPage, userRole, isLoading]
  );

  const fetchOrders = useCallback(async (page?: number, search?: string) => {
    if (isLoading || !userRole) return;
    try {
      // Choose endpoint based on role
      let endpoint;
      if (userRole === "owner") {
        endpoint = "/owners/orders/";
      } else if (userRole === "staff") {
        endpoint = "/api/staff/orders/";
      } else if (userRole === "chef") {
        endpoint = "/api/chef/orders/";
      } else {
        // Fallback or error?
        endpoint = "/owners/orders/";
      }

      const response = await axiosInstance.get(endpoint, {
        params: { page: page, search: search },
      });
      const { results, count } = response.data;

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
    }
  }, []);
  // const fetchOrders = useCallback(async (page?: number, search?: string) => {
  //   try {
  //     const endpoint = `/owners/orders/`;

  //     const response = await axiosInstance.get(endpoint, {
  //       params: {
  //         page: page || 1,
  //         ...(search?.trim() ? { restaurant_name: search.trim() } : {}), // ✅ only include if not empty
  //       },
  //     });

  //     console.log("Fetching orders with:", { page, search });
  //     console.log("API response:", response.data);

  //     const { results, count } = response.data;

  //     if (!Array.isArray(results) && results?.stats) {
  //       setOrdersStats(results.stats);
  //     }

  //     const ordersData = Array.isArray(results)
  //       ? results
  //       : results?.orders || [];

  //     setOrders(ordersData);
  //     setOrdersCount(count || 0);
  //     setOrdersCurrentPage(page || 1);
  //   } catch (error: any) {
  //     console.error("Failed to load orders", error);
  //   }
  // }, []);

  const fetchReservations = useCallback(
    async (
      page: number = reservationsCurrentPage,
      search?: string,
      date?: string
    ) => {
      // Don't fetch if still loading or if userRole is null
      if (isLoading || !userRole) {
        return;
      }

      try {
        let endpoint;
        if (userRole === "owner") {
          endpoint = `/owners/reservations/?page=${page}&search=${search || ""}`;
        } else if (userRole === "staff") {
          endpoint = `/api/staff/reservations/?page=${page}&search=${search || ""}`;
        } else if (userRole === "chef") {
          endpoint = `/api/chef/reservations/?page=${page}&search=${search || ""}`;
        } else {
          endpoint = `/owners/reservations/?page=${page}&search=${search || ""}`;
        }

        // Add date parameter if provided
        if (date) {
          endpoint += `&date=${date}`;
        }

        const response = await axiosInstance.get(endpoint);

        const { results, count } = response.data;
        const formattedReservations = results?.map((item: any) => ({
          id: item.id,
          customerName: item.customer_name,
          tableNo: item.device,
          guestNo: item.guest_no,
          cellNumber: item.cell_number,
          email: item.email,
          reservationTime: item.reservation_time,
          customRequest: item.special_request || "", // Correct mapping
          status: item.status || "confirmed", // Correct mapping
        }));

        setReservations(formattedReservations);
        setReservationsCount(count || 0);
        setReservationsCurrentPage(page);
      } catch (error) {
        console.error("Failed to load reservations", error);
        toast.error("Failed to load reservations.");
      }
    },
    [reservationsCurrentPage, userRole, isLoading]
  );
  useEffect(() => {
    if (response.type == "reservation_created") {
      fetchReservations();
    } else if (
      response.type === "order_created" ||
      response.type === "order_updated"
    ) {
      fetchOrders();
    }
  }, [fetchReservations, fetchOrders, response]);

  const fetchReservationStatusReport = useCallback(async () => {
    // Don't fetch if still loading or if userRole is null

    if (isLoading || !userRole) {
      return;
    }

    try {
      let endpoint =
        (userRole === "owner" || userRole === "staff")
          ? "/owners/reservations/report-reservation-status/"
          : "/api/chef/reservations/report-reservation-status/";

      if (userRole === "staff") {
        endpoint = "/api/staff/reservations/report-reservation-status/";
      }

      const response = await axiosInstance.get(endpoint);
      setReservationStatusReport(response.data);
    } catch (error) {
      console.error("Failed to load reservation status report", error);
      toast.error("Failed to load reservation status report.");
    }
  }, [userRole, isLoading]);
  const fetchOrdersStats = useCallback(async () => {
    // Don't fetch if still loading or if userRole is null

    if (isLoading || !userRole) {
      return;
    }

    try {
      let endpoint =
        (userRole === "owner" || userRole === "staff") ? "/owners/orders/" : "/api/chef/orders/";

      if (userRole === "staff") {
        endpoint = "/api/staff/orders/";
      }

      const response = await axiosInstance.get(endpoint);
      setReservationStatusReport(response.data);
    } catch (error) {
      console.error("Failed to load reservation status report", error);
      toast.error("Failed to load reservation status report.");
    }
  }, [userRole, isLoading]);

  const fetchAllDevices = useCallback(
    async (page: number = devicesCurrentPage, search?: string) => {
      // Don't fetch if still loading or if userRole is null
      if (isLoading || !userRole) {
        return;
      }

      try {
        const searchParam = search || devicesSearchQuery;
        let endpoint =
          (userRole === "owner" || userRole === "staff")
            ? `/owners/devices/?page=${page}&search=${searchParam}`
            : `/api/chef/devices/?page=${page}&search=${searchParam}`;

        if (userRole === "staff") {
          endpoint = `/api/staff/devices/?page=${page}&search=${searchParam}`;
        }

        const response = await axiosInstance.get(endpoint);
        console.log(response, "response");
        const devices = Array.isArray(response.data?.results)
          ? response.data?.results
          : [];
        setAllDevices(devices);
        setDevicesCount(response.data?.count || 0);
        setDevicesCurrentPage(page);
      } catch (error) {
        console.error("Failed to load devices", error);
        toast.error("Failed to load devices.");
      }
    },
    [devicesCurrentPage, devicesSearchQuery, userRole, isLoading]
  );

  const fetchDeviceStats = useCallback(async () => {
    // Don't fetch if still loading or if userRole is null
    if (isLoading || !userRole) {
      return;
    }

    try {
      let endpoint =
        (userRole === "owner" || userRole === "staff")
          ? "/owners/devices/stats/"
          : "/api/chef/devices/stats/";

      if (userRole === "staff") {
        endpoint = "/api/staff/devices/stats/";
      }

      const response = await axiosInstance.get(endpoint);
      setDeviceStats(response.data);
    } catch (error) {
      console.error("Failed to load device stats", error);
      toast.error("Failed to load device stats.");
    }
  }, [userRole, isLoading]);

  const fetchMembers = useCallback(
    async (search?: string) => {
      if (isLoading || !userRole) {
        return;
      }

      try {
        const searchParam = search || membersSearchQuery;
        const endpoint = `/owners/chef-staff/?search=${searchParam}`;
        const response = await axiosInstance.get(endpoint);
        setMembers(response.data.results || []);
      } catch (error) {
        console.error("Failed to load members", error);
        toast.error("Failed to load members.");
      }
    },
    [userRole, isLoading, membersSearchQuery]
  );
  useEffect(() => {
    if (response.type == "chefstaff_created") {
      fetchMembers();
    } else if (response.type == "chefstaff_deleted") {
      fetchMembers();
    }
  }, [response, fetchMembers]);
  const createMember = useCallback(
    async (formData: FormData) => {
      if (isLoading || !userRole) {
        return;
      }

      try {
        const res = await axiosInstance.post("/owners/chef-staff/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        console.log(res);
        toast.success("Member created successfully!");
        // Refresh the members list
        await fetchMembers();
      } catch (error: any) {
        console.error("Failed to create member", error);
        const errorData = error.response?.data;
        const errorMessage = errorData?.username?.[0] || errorData?.email?.[0] || errorData?.detail || "Failed to create member.";
        toast.error(errorMessage);
        throw error;
      }
    },
    [userRole, isLoading, fetchMembers]
  );

  const updateMemberStatus = useCallback(
    async (id: number, action: string) => {
      if (isLoading || !userRole) {
        return;
      }

      try {
        await axiosInstance.patch(`/owners/chef-staff/${id}/`, {
          action: action.toLowerCase(),
        });
        toast.success("Member status updated successfully!");
        // Update local state immediately for instant feedback
        setMembers((prevMembers) =>
          prevMembers.map((member) =>
            member.id === id
              ? { ...member, action: action.toLowerCase() }
              : member
          )
        );
      } catch (error) {
        console.error("Failed to update member status", error);
        toast.error("Failed to update member status.");
        throw error;
      }
    },
    [userRole, isLoading]
  );

  const updateFoodItem = useCallback(
    async (id: number, formData: FormData) => {
      // Don't update if still loading or if userRole is null
      if (isLoading || !userRole) {
        return;
      }
      console.log(userRole, "user role in update food item");
      try {
        let endpoint;
        if (userRole === "owner") {
          endpoint = `/owners/items/${id}/`;
        } else if (userRole === "staff") {
          endpoint = `/staff/items/${id}/`;
        } else if (userRole === "chef") {
          endpoint = `/chef/items/${id}/`;
        } else {
          throw new Error("Invalid user role");
        }

        await axiosInstance.patch(endpoint, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success("Food item updated successfully!");
        // Refresh the current page to show updated data
        await fetchFoodItems(currentPage, searchQuery);
      } catch (err) {
        console.error("Failed to update food item", err);
        toast.error("Failed to update food item.");
        throw err;
      }
    },
    [fetchFoodItems, currentPage, searchQuery, userRole, isLoading]
  );

  const createFoodItem = useCallback(
    async (formData: FormData) => {
      // Don't create if still loading or if userRole is null
      if (isLoading || !userRole) {
        return;
      }

      try {
        const endpoint =
          userRole === "owner" ? "/owners/items/" : "/staff/items/";

        await axiosInstance.post(endpoint, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success("Food item created successfully!");
        // Refresh the current page to show new data
        await fetchFoodItems(currentPage, searchQuery);
      } catch (err) {
        console.error("Failed to create food item", err);
        toast.error("Failed to create food item.");
        throw err;
      }
    },
    [fetchFoodItems, currentPage, searchQuery, userRole, isLoading]
  );

  const deleteFoodItem = useCallback(
    async (id: number) => {
      // Don't delete if still loading or if userRole is null
      if (isLoading || !userRole) {
        return;
      }

      try {
        // Use role-based API endpoint
        let endpoint;
        if (userRole === "owner") {
          endpoint = `/owners/items/${id}/`;
        } else if (userRole === "staff") {
          endpoint = `/staff/items/${id}/`;
        } else if (userRole === "chef") {
          endpoint = `/chef/items/${id}/`;
        } else {
          throw new Error("Invalid user role");
        }

        await axiosInstance.delete(endpoint);
        toast.success("Food item deleted successfully!");
        // Refresh the current page to show updated data
        await fetchFoodItems(currentPage, searchQuery);
      } catch (err) {
        console.error("Failed to delete food item", err);
        toast.error("Failed to delete food item.");
        throw err;
      }
    },
    [fetchFoodItems, currentPage, searchQuery, userRole, isLoading]
  );

  const updateAvailability = useCallback(
    async (id: number, available: boolean) => {
      // Don't update if still loading or if userRole is null
      if (isLoading || !userRole) {
        return;
      }

      try {
        let endpoint;
        if (userRole === "owner") {
          endpoint = `/owners/items/${id}/`;
        } else if (userRole === "staff") {
          endpoint = `/staff/items/${id}/`;
        } else if (userRole === "chef") {
          endpoint = `/chef/items/${id}/`;
        } else {
          throw new Error("Invalid user role");
        }

        await axiosInstance.patch(endpoint, {
          availability: available.toString(),
        });
        toast.success("Food item availability updated successfully!");
        // Refresh the current page to show updated data
        await fetchFoodItems(currentPage, searchQuery);
      } catch (err) {
        console.error("Failed to update food item availability", err);
        toast.error("Failed to update food item availability.");
        throw err;
      }
    },
    [fetchFoodItems, currentPage, searchQuery, userRole, isLoading]
  );

  const updateOrderStatus = useCallback(
    async (id: number, status: string) => {
      // Don't update if still loading or if userRole is null
      if (isLoading || !userRole) {
        return;
      }

      try {
        let endpoint;
        if (userRole === "owner") {
          endpoint = `/owners/orders/status/${id}/`;
        } else if (userRole === "staff") {
          // Staff updates use Generic/Owner endpoint if explicit Staff one missing, likely Owner endpoint
          endpoint = `/owners/orders/status/${id}/`;
          endpoint = `/staff/orders/status/${id}/`;
        } else if (userRole === "chef") {
          endpoint = `/chef/orders/status/${id}/`;
        } else {
          throw new Error("Invalid user role");
        }

        const response = await axiosInstance.patch(endpoint, {
          status: status.toLowerCase(),
        });
        toast.success("Order status updated successfully!");

        // Update local orders state immediately for instant feedback
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            order.id === id ? { ...order, status: status as any } : order
          )
        );

        // Optionally refresh the orders list
        // await fetchOrders(ordersCurrentPage, ordersSearchQuery);
      } catch (err) {
        console.error("Failed to update order status", err);

        toast.error("Failed to update order status.");
        throw err;
      }
    },
    [userRole, isLoading, setOrders]
  );

  const updateReservationStatus = useCallback(
    async (id: number, status: string) => {
      // Don't update if still loading or if userRole is null
      if (isLoading || !userRole) {
        return;
      }

      try {
        const endpoint =
          userRole === "owner"
            ? `/owners/reservations/${id}/`
            : `/staff/reservations/${id}/`;

        const response = await axiosInstance.patch(endpoint, {
          status: status.toLowerCase(),
        });

        toast.success("Reservation status updated successfully!");

        // Update local reservations state immediately for instant feedback
        setReservations((prevReservations) =>
          prevReservations.map((reservation) =>
            reservation.id === id
              ? { ...reservation, customRequest: status as any }
              : reservation
          )
        );

        // Optionally refresh the reservations list
        // await fetchReservations(reservationsCurrentPage, reservationsSearchQuery);
      } catch (err) {
        console.error("Failed to update reservation status", err);
        toast.error("Failed to update reservation status.");
        throw err;
      }
    },
    [userRole, isLoading, setReservations]
  );

  const updateDeviceStatus = useCallback(
    async (id: number, action: string) => {
      // Don't update if still loading or if userRole is null
      if (isLoading || !userRole) {
        return;
      }

      try {
        const endpoint =
          userRole === "owner"
            ? `/owners/devices/${id}/`
            : `/staff/devices/${id}/`;

        await axiosInstance.patch(endpoint, { action });
        toast.success("Device status updated successfully!");
        // Refresh both device list and stats
        await Promise.all([
          fetchAllDevices(devicesCurrentPage, devicesSearchQuery),
          fetchDeviceStats(),
        ]);
      } catch (err) {
        console.error("Failed to update device status", err);
        toast.error("Failed to update device status.");
        throw err;
      }
    },
    [
      fetchAllDevices,
      fetchDeviceStats,
      devicesCurrentPage,
      devicesSearchQuery,
      userRole,
      isLoading,
    ]
  );

  useEffect(() => {
    if (
      response.type === "item_updated" ||
      response.type === "item_created" ||
      response.type === "item_deleted"
    ) {
      fetchFoodItems(currentPage, searchQuery);
    } else if (
      response.type === "order_created" ||
      response.type === "order_updated"
    ) {
      fetchOrders(ordersCurrentPage, ordersSearchQuery);
    } else if (
      response.type === "reservation_created" ||
      response.type === "reservation_updated"
      // response.type === "device_updated" ||
      // response.type === "device_deleted"
    ) {
      // fetchAllDevices(devicesCurrentPage, devicesSearchQuery);
      fetchReservations(reservationsCurrentPage, reservationsSearchQuery);
    } else if (
      response.type === "device_updated" ||
      response.type === "device_deleted"
    ) {
      fetchAllDevices(devicesCurrentPage, devicesSearchQuery);
    } else if (response.type === "paid_order") {
      fetchOrders(ordersCurrentPage, ordersSearchQuery);
    }
  }, [
    response,
    currentPage,
    searchQuery,
    fetchFoodItems,
    ordersCurrentPage,
    ordersSearchQuery,
    fetchOrders,
    reservationsCurrentPage,
    reservationsSearchQuery,
    fetchReservations,
    devicesCurrentPage,
    devicesSearchQuery,
    fetchAllDevices,
  ]);

  const value: OwnerContextType = {
    categories,
    foodItems,
    foodItemsCount,
    currentPage,
    searchQuery,
    orders,
    ordersStats,
    subCategories,
    fetchSubCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    createSubCategory,
    updateSubCategory,
    deleteSubCategory,
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
    deviceStats,
    members,
    membersSearchQuery,
    fetchCategories,
    fetchFoodItems,
    fetchOrders,
    fetchReservations,
    fetchReservationStatusReport,
    fetchAllDevices,
    fetchDeviceStats,
    fetchMembers,
    createMember,
    updateMemberStatus,
    updateFoodItem,
    createFoodItem,
    deleteFoodItem,
    updateAvailability,
    updateOrderStatus,
    updateReservationStatus,
    setCurrentPage,
    setSearchQuery,
    setOrdersCurrentPage,
    setOrdersSearchQuery,
    setReservationsCurrentPage,
    setReservationsSearchQuery,
    setAllDevices,
    setDevicesSearchQuery,
    setDevicesCurrentPage,
    setMembersSearchQuery,
    updateDeviceStatus,
    setOrders,
    setReservations,
    setMembers,
  };

  return (
    <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>
  );
};

// Custom hook to consume the context
export const useOwner = () => {
  const context = useContext(OwnerContext);
  if (!context) {
    throw new Error("useOwner must be used within an OwnerProvider");
  }
  return context;
};

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  // Example: 26 Jun 2025, 11:03 AM
  return date.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
