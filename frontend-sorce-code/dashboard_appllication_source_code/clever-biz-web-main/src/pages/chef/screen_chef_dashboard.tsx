import {
  Pagination,
  TableFoodList,
} from "../../components/utilities";
import { useContext, useEffect, useMemo, useState } from "react";
import { useStaff } from "@/context/staffContext";
import { PackageCheck, Clock3, ClipboardList } from "lucide-react";
import { WebSocketContext } from "@/hooks/WebSocketProvider";

const MetricCard = ({ title, value, icon: Icon }: any) => (
  <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{title}</p>
      <h3 className="text-2xl font-semibold text-slate-900">{value}</h3>
    </div>
    <div className="w-10 h-10 rounded-lg bg-[#0055FE]/10 flex items-center justify-center text-[#0055FE]">
      <Icon size={20} />
    </div>
  </div>
);

const ScreenChefDashboard = () => {
  const {
    foodItems = [],
    foodItemsCount,
    currentPage,
    searchQuery,
    fetchFoodItems,
    setCurrentPage,
    statusSummary,
    fetchStatusSummary,
    fetchOrders,
  } = useStaff();
  const { response } = useContext(WebSocketContext) || {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const processingCount = useMemo(
    () =>
      Number(
        statusSummary?.processing_orders_count ??
        (statusSummary as any)?.preparing_order_count ??
        0
      ),
    [statusSummary]
  );

  const pendingCount = useMemo(
    () =>
      Number(
        statusSummary?.pending_orders_count ??
        (statusSummary as any)?.pending_order_count ??
        0
      ),
    [statusSummary]
  );

  useEffect(() => {
    console.log(statusSummary, "status summary");
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Check authentication status
        const token = localStorage.getItem("accessToken");

        if (!token) {
          setError("No authentication token found");
          return;
        }

        await Promise.all([fetchStatusSummary(), fetchFoodItems(), fetchOrders(1, "")]);
      } catch (err) {
        console.error("Dashboard load error:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchStatusSummary, fetchFoodItems, fetchOrders]);

  // Real-time sync for metric cards + list
  useEffect(() => {
    if (!response?.type) return;
    const shouldRefresh =
      response.type === "new_order" ||
      response.type === "order_created" ||
      response.type === "order_updated" ||
      response.type === "order_status_update" ||
      response.type === "order_paid" ||
      response.type === "item_created" ||
      response.type === "item_updated" ||
      response.type === "item_deleted" ||
      response.type === "cash_payment_confirmed";

    if (shouldRefresh) {
      fetchStatusSummary();
      fetchFoodItems(currentPage, searchQuery);
      fetchOrders(1, "");
    }
  }, [response, fetchStatusSummary, fetchFoodItems, fetchOrders, currentPage, searchQuery]);

  // Polling fallback if websocket misses events
  useEffect(() => {
    const poll = setInterval(() => {
      fetchStatusSummary();
      fetchFoodItems(currentPage, searchQuery);
    }, 30000);
    return () => clearInterval(poll);
  }, [fetchStatusSummary, fetchFoodItems, currentPage, searchQuery]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchFoodItems(page, searchQuery);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500 text-lg">{error}</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col">
        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Available items"
            value={statusSummary?.available_items_count || 0}
            icon={PackageCheck}
          />
          <MetricCard
            title="Processing order"
            value={processingCount}
            icon={Clock3}
          />
          <MetricCard
            title="Pending order"
            value={pendingCount}
            icon={ClipboardList}
          />
        </div>
        {/* Dashboard Content */}
        {/* Header and dropdown */}
        <div className="flex flex-row justify-between items-center my-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">List of Items</h2>
        </div>
        {/* List of content */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {foodItems.length > 0 ? (
            <TableFoodList data={foodItems} allowItemActions={false} />
          ) : (
            <div className="py-10 text-center text-slate-500 text-sm">No items found.</div>
          )}
          <div className="mt-4 flex justify-center">
            <Pagination
              page={currentPage}
              total={foodItemsCount}
              onPageChange={handlePageChange}
            />{" "}
          </div>
        </div>
      </div>
    </>
  );
};

export default ScreenChefDashboard;
