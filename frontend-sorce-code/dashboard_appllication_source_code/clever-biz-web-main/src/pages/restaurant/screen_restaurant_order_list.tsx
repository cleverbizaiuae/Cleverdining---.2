import { useOwner } from "@/context/ownerContext";
import { useRole } from "@/hooks/useRole";
import { isStaffAlertRole } from "@/hooks/staffServiceAlerts";
import { useEffect, useState, useRef, useContext } from "react";
import { WebSocketContext } from "@/hooks/WebSocketProvider";
import PaymentGatewayModal, { type GatewayProvider } from "../model/PaymentGatewayModal";
import axiosInstance from "@/lib/axios";
import { cachedGet, invalidateApiCache } from "@/lib/requestCache";
import {
  Search,
  Bell,
  CheckCircle2,
  Package,
  Clock,
  MoreHorizontal,
  Eye,
  Moon,
  ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { getActiveRestaurantCurrency, getActiveRestaurantRegion } from "@/lib/utils";
import { getRegionConfig } from "@/config/regionConfig";
import { OptimizedImage } from "@/components/OptimizedImage";

// --- COMPONENTS ---

// 1. METRIC CARDS
const MetricCard = ({ title, value, icon: Icon, colorClass, bgClass, iconBgClass }: any) => (
  <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{title}</p>
      <h3 className="text-2xl font-semibold text-slate-900">{value}</h3>
    </div>
    <div className={`w-10 h-10 rounded-lg ${iconBgClass} flex items-center justify-center ${colorClass}`}>
      <Icon size={20} />
    </div>
  </div>
);

const parseTimings = (notes: string | null | undefined): Record<string, string> => {
  if (!notes) return {};
  const timings: Record<string, string> = {};
  const regex = /\[TIMING:([^=\]]+)=([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(notes)) !== null) {
    timings[match[1]] = match[2];
  }
  return timings;
};

const cleanNotes = (notes: string | null | undefined): string => {
  if (!notes) return "";
  return notes
    .replace(/\[TIMING:[^\]]+\]/g, "")
    .replace(/\[Drinks:[^\]]+\]/g, "")
    .trim();
};

const parseMoney = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const getPaymentInfo = (order: any) => {
  const total = parseMoney(order?.total_price ?? order?.total);
  const status = String(order?.payment_status || "").toLowerCase();
  const fulfillmentStatus = String(order?.status || order?.backendStatus || "").toLowerCase();
  const explicitRemaining = order?.remaining_amount ?? order?.remainingAmount;
  const explicitPaid = order?.amount_paid ?? order?.amountPaid;
  const rawPaid = parseMoney(explicitPaid);
  const remaining =
    explicitRemaining !== undefined
      ? Math.max(0, parseMoney(explicitRemaining))
      : Math.max(0, total - rawPaid);
  const paid = explicitPaid !== undefined ? rawPaid : Math.max(0, total - remaining);
  const normalizedPaid = status === "paid" || status === "completed" ? Math.max(paid, total) : paid;
  const normalizedRemaining = status === "paid" || status === "completed" ? 0 : Math.max(0, total - normalizedPaid);
  const isFullyPaid = normalizedRemaining <= 0.001 || status === "paid" || status === "completed";
  const isPartial = !isFullyPaid && (status === "partially_paid" || normalizedPaid > 0.001);
  const progress = total > 0 ? Math.min(100, Math.max(0, (normalizedPaid / total) * 100)) : 0;
  return {
    total,
    paid: normalizedPaid,
    remaining: normalizedRemaining,
    isFullyPaid,
    isPartial,
    progress,
    status,
    fulfillmentStatus,
  };
};

const ScreenRestaurantOrderList = () => {
  const regionCode = getActiveRestaurantRegion();
  const regionGatewayOptions = getRegionConfig(regionCode).payments.filter(
    (provider) => provider !== "cash"
  ) as GatewayProvider[];

  const providerLabel = (provider: GatewayProvider): string => {
    if (provider === "checkout") return "Checkout.com";
    if (provider === "paytabs") return "PayTabs";
    if (provider === "payme") return "PayMe";
    if (provider === "adyen") return "Adyen";
    if (provider === "worldpay") return "Worldpay";
    if (provider === "sumup") return "SumUp";
    if (provider === "square") return "Square";
    return "Stripe";
  };
  const { userRole } = useRole();
  const canCollectCash = isStaffAlertRole(userRole);
  const {
    orders = [],
    ordersStats,
    ordersCount,
    ordersCurrentPage,
    ordersSearchQuery,
    fetchOrders,
    setOrdersCurrentPage,
    setOrdersSearchQuery,
    updateOrderStatus,
  } = useOwner();
  const currencyCode =
    String((orders as any[]).find((order: any) => order?.currency)?.currency || getActiveRestaurantCurrency())
      .trim()
      .toUpperCase() || "AED";

  // Real-time WebSocket updates
  const { response } = useContext(WebSocketContext) || {};

  // Real-time: Refresh orders when new orders arrive or status changes
  // Real-time: Refresh orders with Debounce
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (response && (
      response.type === 'new_order' ||
      response.type === 'order_created' ||
      response.type === 'cash_payment_alert' ||
      response.type === 'order_paid' ||
      response.type === 'order_updated' ||
      response.type === 'order_status_update' ||
      response.type === 'payment:created'
    )) {
      console.log("Real-time OrderList refresh triggered by:", response.type);

      // Debounce the fetch to prevent spamming
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        fetchOrders(ordersCurrentPage, ordersSearchQuery);
      }, 2000); // 2-second debounce buffer for bulk updates
    }
  }, [response, fetchOrders, ordersCurrentPage, ordersSearchQuery]);

  // WebSocket events handle fast updates; this is only a low-frequency safety net.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      fetchOrders(ordersCurrentPage, ordersSearchQuery);
    };

    const poll = setInterval(tick, 30000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchOrders, ordersCurrentPage, ordersSearchQuery]);

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [closedDayDate, setClosedDayDate] = useState<string | null>(null);
  const [showCloseDayConfirm, setShowCloseDayConfirm] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [connectedGateways, setConnectedGateways] = useState<any[]>([]);
  const [availableGateways, setAvailableGateways] = useState<any[]>([]);

  // Payment States
  const [openGatewayModal, setOpenGatewayModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<GatewayProvider>("stripe");
  const [showDropdown, setShowDropdown] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null);
  const [markingPaidOrderId, setMarkingPaidOrderId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = () => setOpenActionMenuId(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    // Load Closed Day Timestamp
    const savedClosedDay = localStorage.getItem('closedDayDate');
    if (savedClosedDay) {
      setClosedDayDate(savedClosedDay);
    }
    fetchGateways();
  }, []);

  const fetchGateways = async () => {
    try {
      const { data } = await cachedGet("/api/payment-providers/enabled/", {}, { ttlMs: 30_000 });
      const list = Array.isArray(data) ? data : data.results || [];
      setAvailableGateways(list);
      setConnectedGateways(list.filter((gw: any) => gw.credentialsConfigured || gw.is_active || gw.connectionStatus === "connected"));
    } catch (e) {
      console.warn("Failed to fetch provider framework gateways, falling back to legacy gateways", e);
      try {
        const { data } = await cachedGet("/owners/payment-gateways/", {}, { ttlMs: 60_000 });
        const list = Array.isArray(data) ? data : data.results || [];
        setConnectedGateways(list);
        setAvailableGateways(list.length ? list : regionGatewayOptions.map((provider) => ({ provider, providerName: providerLabel(provider) })));
      } catch (legacyErr) {
        console.warn("Failed to fetch gateways", legacyErr);
        setAvailableGateways(regionGatewayOptions.map((provider) => ({ provider, providerName: providerLabel(provider) })));
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(ordersSearchQuery), 500);
    return () => clearTimeout(timer);
  }, [ordersSearchQuery]);

  useEffect(() => {
    fetchOrders(ordersCurrentPage, debouncedSearchQuery);
  }, [ordersCurrentPage, debouncedSearchQuery, fetchOrders]);

  const gatewayOptions = (
    availableGateways.length
      ? availableGateways.map((gateway) => (gateway.provider || gateway.code) as GatewayProvider)
      : regionGatewayOptions
  ).filter(Boolean);

  // --- LOGIC ---

  // 1. Filter Orders (Close Day Logic)
  const activeOrders = orders.filter((order: any) => {
    // Filter by Close Day
    if (closedDayDate) {
      const orderDate = new Date(order.timeOfOrder || order.created_time || order.created_at); // API uses created_at
      const closedDate = new Date(closedDayDate);
      return orderDate > closedDate;
    }
    return true;
  });

  // 2. Ready & Cash Orders
  const readyOrders = activeOrders.filter((order: any) =>
    order.status.toLowerCase() === 'ready' || order.status.toLowerCase() === 'served'
  );

  const cashOrders = canCollectCash
    ? activeOrders.filter((order: any) =>
      String(order.status || "").toLowerCase() !== 'cancelled' &&
      (order.status === 'awaiting_cash' || order.payment_status === 'pending_cash')
    )
    : [];

  // Group cash orders by table (device_id or tableNo)
  const cashOrdersByTable = cashOrders.reduce((acc: any, order: any) => {
    const tableKey = order.device_id || order.tableNo || order.device_table_name || 'unknown';
    const tableName = order.tableNo || order.device_table_name || 'Unknown';

    if (!acc[tableKey]) {
      acc[tableKey] = {
        tableKey,
        tableName,
        orders: [],
        totalAmount: 0
      };
    }
    acc[tableKey].orders.push(order);
    acc[tableKey].totalAmount += getPaymentInfo(order).remaining;
    return acc;
  }, {});

  const groupedCashTables = Object.values(cashOrdersByTable) as any[];

  // 3. Actions
  const [isClosingDay, setIsClosingDay] = useState(false);

  const handleCloseDay = async () => {
    setIsClosingDay(true);
    try {
      const res = await axiosInstance.post('/owners/business-days/close_day/');
      toast.success(res.data.message || "Business Day Closed Successfully");

      const now = new Date().toISOString();
      localStorage.setItem('closedDayDate', now);
      setClosedDayDate(now);
      setShowCloseDayConfirm(false);

      // Refresh Orders
      fetchOrders(ordersCurrentPage, debouncedSearchQuery);

    } catch (error: any) {
      console.error(error);
      const errorMsg = error.response?.data?.error || "Failed to close day";

      if (error.response?.data?.blocking_orders) {
        toast.error(
          <div>
            <p className="font-bold text-sm">Cannot Close Day</p>
            <p className="text-xs mt-1 mb-1">{errorMsg}</p>
            <ul className="list-disc pl-4 text-[10px] bg-red-50 p-2 rounded">
              {error.response.data.blocking_orders.slice(0, 3).map((o: any) => <li key={o.id}>Table {o.device__table_name} - {o.status}</li>)}
              {error.response.data.blocking_orders.length > 3 && <li>...and more</li>}
            </ul>
          </div>
          , { duration: 6000 });
      } else if (error.response?.data?.blocking_tables) {
        toast.error(
          <div>
            <p className="font-bold text-sm">Cannot Close Day</p>
            <p className="text-xs mt-1 mb-1">{errorMsg}</p>
            <p className="text-[10px] bg-red-50 p-2 rounded">Active tables: {error.response.data.blocking_tables.map((t: any) => t.device__table_name).join(", ")}</p>
          </div>
          , { duration: 6000 });
      } else {
        toast.error(errorMsg);
      }
      // If validation failed, do NOT close the modal, let them fix it
      // setShowCloseDayConfirm(false); 
    } finally {
      setIsClosingDay(false);
    }
  };

  // Confirm all cash orders for a table (takes array of order IDs)
  const handleConfirmCashForTable = async (orderIds: number[]) => {
    if (!canCollectCash) return;
    try {
      // Confirm first order - backend will handle session-level logic
      // For bulk confirmation, we confirm each order
      let fullyPaid = true;
      let remainingAmount = 0;
      for (const orderId of orderIds) {
        const response = await axiosInstance.patch(`/owners/orders/confirm-cash/${orderId}/`);
        if (response.data?.fully_paid === false) {
          fullyPaid = false;
          remainingAmount = Number(response.data?.remaining_amount || 0);
        }
      }
      invalidateApiCache("orders");
      toast.success(
        fullyPaid
          ? "Cash received. The table balance is fully paid."
          : `Cash share confirmed. Remaining balance: ${currencyCode} ${remainingAmount.toFixed(2)}`,
      );
      // Refresh list
      fetchOrders(ordersCurrentPage, debouncedSearchQuery);
    } catch (e) {
      console.error(e);
      toast.error("Failed to confirm cash payment");
    }
  };

  // Keep backward compatible single order confirm
  const handleConfirmCash = async (orderId: number) => {
    if (!canCollectCash) return;
    if (markingPaidOrderId !== null) return;
    setMarkingPaidOrderId(orderId);
    try {
      const response = await axiosInstance.patch(`/owners/orders/confirm-cash/${orderId}/`);
      invalidateApiCache("orders");
      const fullyPaid = response.data?.fully_paid !== false;
      const remainingAmount = Number(response.data?.remaining_amount || 0);
      toast.success(
        fullyPaid
          ? "Cash received. The order is fully paid."
          : `Cash share confirmed. Remaining balance: ${currencyCode} ${remainingAmount.toFixed(2)}`,
      );
      await fetchOrders(ordersCurrentPage, debouncedSearchQuery);
    } catch (error: any) {
      console.error("Failed to mark order as paid", error);
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        "Failed to mark order as paid";
      toast.error(message);
    } finally {
      setMarkingPaidOrderId(null);
    }
  };

  const handleAddGateway = (provider: GatewayProvider) => {
    setShowDropdown(false);
    setSelectedProvider(provider);
    setOpenGatewayModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'served':
      case 'ready':
        return 'text-green-600';
      case 'delivered':
        return 'text-green-700';
      case 'cancelled':
        return 'text-red-600';
      case 'preparing':
        return 'text-orange-600';
      case 'awaiting_cash':
        return 'text-yellow-700 font-bold';
      case 'pending':
      default:
        return 'text-yellow-600';
    }
  };

  // 4. View Logic
  const handleViewOrder = (order: any) => {
    setSelectedOrder(order);
    setViewModalOpen(true);
  };

  const formatMoney = (value: number) => `${currencyCode} ${value.toFixed(2)}`;
  const paymentBadgeClass = (info: ReturnType<typeof getPaymentInfo>) => {
    if (info.fulfillmentStatus === "cancelled") return "bg-red-50 text-red-700";
    if (info.isFullyPaid) return "bg-green-50 text-green-700";
    if (info.isPartial) return "bg-amber-50 text-amber-700";
    if (info.status === "pending_cash") return "bg-yellow-50 text-yellow-700";
    return "bg-red-50 text-red-700";
  };
  const paymentBadgeLabel = (order: any) => {
    const info = getPaymentInfo(order);
    if (info.fulfillmentStatus === "cancelled") return "Cancelled";
    if (info.isFullyPaid) return "Paid";
    if (info.isPartial) return `${formatMoney(info.remaining)} left`;
    return order.payment_status || "Unpaid";
  };
  const selectedPaymentInfo = selectedOrder ? getPaymentInfo(selectedOrder) : null;

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    await updateOrderStatus(orderId, newStatus);
  };

  const orderNotesSource =
    selectedOrder?.notes ||
    selectedOrder?.special_request ||
    selectedOrder?.note ||
    "";
  const orderTimings = parseTimings(orderNotesSource);
  const hasTimings = Object.keys(orderTimings).length > 0;
  const timedEntries = Object.entries(orderTimings);
  const nowItems = timedEntries.filter(([, value]) => value === "now").map(([name]) => name);
  const withFoodItems = timedEntries
    .filter(([, value]) => value === "with_food")
    .map(([name]) => name);
  const afterFoodItems = timedEntries
    .filter(([, value]) => value === "after_food")
    .map(([name]) => name);
  const visibleNotes = cleanNotes(orderNotesSource);

  return (
    <div className="flex flex-col gap-6">

      {/* PENDING CASH BANNER - Grouped by Table */}
      {canCollectCash && groupedCashTables.length > 0 && (
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-3 shadow-md flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2 fade-in duration-300 max-w-full">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-700 shrink-0 animate-pulse">
              <span className="text-lg">💵</span>
            </div>
            <div>
              <h3 className="font-bold text-yellow-800 text-sm">Cash Payments Pending</h3>
              <p className="text-xs text-yellow-700 font-medium whitespace-nowrap">
                Collect cash to complete.
              </p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 w-full md:w-0 md:flex-1 max-w-full">
            {groupedCashTables.map((tableGroup: any) => (
              <div key={tableGroup.tableKey} className="bg-white border border-yellow-200 rounded-lg p-2.5 shadow-sm min-w-[220px] flex items-center gap-3 shrink-0">
                {/* Table Number Badge */}
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center text-yellow-800 font-bold text-xs shrink-0 border border-yellow-200">
                  {tableGroup.tableName}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {tableGroup.orders.length} Order{tableGroup.orders.length > 1 ? 's' : ''}
                  </p>
                  <p className="text-sm text-yellow-700 font-bold">{currencyCode} {tableGroup.totalAmount.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => handleConfirmCashForTable(tableGroup.orders.map((o: any) => o.id))}
                  className="h-7 px-3 bg-yellow-500 hover:bg-yellow-600 text-white text-[10px] font-bold rounded shadow-sm transition-colors whitespace-nowrap"
                >
                  Confirm
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* READY FOR DELIVERY BANNER */}
      {readyOrders.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-3 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2 fade-in duration-300 max-w-full">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-600 shrink-0">
              <Bell size={16} />
            </div>
            <div>
              <h3 className="font-semibold text-green-700 text-sm">Ready for Delivery</h3>
              <p className="text-xs text-green-600 font-medium flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Serve Now
              </p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-0 md:flex-1 max-w-full">
            {readyOrders.map((order: any) => (
              <div key={order.id} className="bg-white border border-green-100 rounded-lg p-2.5 shadow-sm min-w-[200px] flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {order.device_table_name || "Tab"}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900">Order #{order.id}</p>
                  <p className="text-[10px] text-slate-500">{currencyCode} {order.total_price}</p>
                </div>
                {canCollectCash && (
                  <button
                    onClick={() => handleConfirmCash(order.id)}
                    disabled={markingPaidOrderId !== null}
                    className="h-7 px-3 bg-green-600 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 text-white text-[10px] font-medium rounded transition-colors"
                  >
                    {markingPaidOrderId === order.id ? "Saving..." : "Mark as Paid"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Ongoing Orders"
          value={ordersStats?.ongoing_orders ?? ordersStats?.total_ongoing_orders ?? 0}
          icon={Clock}
          colorClass="text-[#0055FE]"
          bgClass="bg-white"
          iconBgClass="bg-[#0055FE]/10"
        />
        <MetricCard
          title="Completed Today"
          value={ordersStats?.today_completed_order_count || 0}
          icon={CheckCircle2}
          colorClass="text-[#0055FE]"
          bgClass="bg-white"
          iconBgClass="bg-[#0055FE]/10"
        />
        <MetricCard
          title="Total Completed"
          value={ordersStats?.total_completed_orders || 0}
          icon={Package}
          colorClass="text-[#0055FE]"
          bgClass="bg-white"
          iconBgClass="bg-[#0055FE]/10"
        />
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Header Bar */}
        <div className="p-5 border-b border-slate-200 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-base font-bold text-slate-900">List of Orders</h2>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <button
              onClick={() => setShowCloseDayConfirm(true)}
              className="h-9 px-4 bg-[#0055FE] hover:bg-[#0047D1] text-white text-xs font-medium rounded-lg flex items-center gap-2 transition-colors shadow-sm"
            >
              <Moon size={14} /> Close Day
            </button>
            {closedDayDate && (
              <button
                onClick={() => {
                  localStorage.removeItem('closedDayDate');
                  setClosedDayDate(null);
                  toast.success("Filter cleared - showing all orders");
                }}
                className="h-8 px-3 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg flex items-center gap-2 transition-colors"
              >
                Show All Orders
              </button>
            )}

            {/* Payment Dropdown - Only for Owner/Manager */}
            {(userRole === 'owner' || userRole === 'manager') && (
              <>
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="h-9 px-4 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg flex items-center gap-2 transition-colors shadow-sm"
                  >
                    Add Payment Account <ChevronDown size={14} />
                  </button>
                  {showDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-slate-100 overflow-hidden z-20">
                      {gatewayOptions.map((provider) => (
                        <button
                          key={provider}
                          onClick={() => handleAddGateway(provider)}
                          className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          Add {providerLabel(provider)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Connected Chips */}
                <div className="flex gap-2">
                  {connectedGateways.slice(0, 2).map((gw: any) => (
                    <span key={gw.id || gw.provider} className={`px-2 py-1 rounded text-[10px] font-bold border uppercase ${gw.is_active || gw.connectionStatus === "connected" ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {gw.providerName || gw.provider}
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0055FE]" size={16} />
              <input
                type="text"
                placeholder="Search by Order ID..."
                className="w-full h-9 pl-10 pr-4 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10"
                value={ordersSearchQuery}
                onChange={(e) => {
                  setOrdersSearchQuery(e.target.value);
                  setOrdersCurrentPage(1);
                }}
              />
            </div>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-slate-100 md:hidden">
          {activeOrders.length > 0 ? (
            activeOrders.map((order: any) => (
              <div key={order.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Order #{order.id}</p>
                    <p className="text-xs text-slate-500">Table {order.tableNo || "N/A"}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${paymentBadgeClass(getPaymentInfo(order))}`}>
                    {paymentBadgeLabel(order)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-slate-400 uppercase tracking-wide">Amount</p>
                    <p className="font-semibold text-slate-900">{currencyCode} {order.total_price}</p>
                    {getPaymentInfo(order).isPartial && (
                      <p className="mt-0.5 text-[10px] font-semibold text-amber-600">
                        {formatMoney(getPaymentInfo(order).paid)} paid
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-slate-400 uppercase tracking-wide">Placed</p>
                    <p className="font-medium text-slate-600">
                      {new Date(order.timeOfOrder || order.created_time || order.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <select
                    value={order.status.toLowerCase()}
                    onChange={(e) => handleStatusChange(order.id, e.target.value)}
                    className={`min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold uppercase outline-none ${getStatusColor(order.status)}`}
                  >
                    <option value="pending" className="text-yellow-600">Pending</option>
                    <option value="preparing" className="text-orange-600">Preparing</option>
                    <option value="served" className="text-green-600">Ready (Served)</option>
                    <option value="delivered" className="text-green-700" disabled={!getPaymentInfo(order).isFullyPaid}>
                      Delivered{!getPaymentInfo(order).isFullyPaid ? " (paid only)" : ""}
                    </option>
                    <option value="cancelled" className="text-red-600">Cancelled</option>
                  </select>
                  <button
                    onClick={() => handleViewOrder(order)}
                    className="shrink-0 text-[#0055FE] hover:bg-[#0055FE]/10 p-2 rounded-lg transition-colors"
                    aria-label={`View order ${order.id}`}
                  >
                    <Eye size={16} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="px-5 py-12 text-center text-xs text-slate-400">No active orders found</div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Order ID</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Table No</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Payment</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Date/Time</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Amount</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeOrders.length > 0 ? (
                activeOrders.map((order: any) => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">#{order.id}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{order.tableNo || "N/A"}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${paymentBadgeClass(getPaymentInfo(order))}`}>
                        {paymentBadgeLabel(order)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(order.timeOfOrder || order.created_time || order.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">
                      <div>{currencyCode} {order.total_price}</div>
                      {getPaymentInfo(order).isPartial && (
                        <div className="text-[10px] font-semibold text-amber-600">
                          {formatMoney(getPaymentInfo(order).paid)} paid
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {/* STATUS DROPDOWN */}
                      <select
                        value={order.status.toLowerCase()}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className={`text-xs font-semibold uppercase bg-slate-50 border-none outline-none cursor-pointer ${getStatusColor(order.status)}`}
                      >
                        <option value="pending" className="text-yellow-600">Pending</option>
                        <option value="preparing" className="text-orange-600">Preparing</option>
                        <option value="served" className="text-green-600">Ready (Served)</option>
                        <option value="delivered" className="text-green-700" disabled={!getPaymentInfo(order).isFullyPaid}>
                          Delivered{!getPaymentInfo(order).isFullyPaid ? " (paid only)" : ""}
                        </option>
                        <option value="cancelled" className="text-red-600">Cancelled</option>
                      </select>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => handleViewOrder(order)}
                          className="text-[#0055FE] hover:bg-[#0055FE]/10 p-1.5 rounded transition-colors"
                        >
                          <Eye size={16} />
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionMenuId(openActionMenuId === order.id ? null : order.id);
                            }}
                            className="text-[#0055FE] hover:bg-[#0055FE]/10 p-1.5 rounded transition-colors"
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          {/* Click-based Menu */}
                          {openActionMenuId === order.id && (
                            <div
                              className="absolute right-0 top-full mt-1 w-32 bg-white rounded shadow-lg border border-slate-100 z-10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button onClick={() => { handleStatusChange(order.id, 'cancelled'); setOpenActionMenuId(null); }} className="block w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-slate-50">Cancel Order</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-xs text-slate-400">No orders found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-200 flex justify-center">
          <div className="flex gap-2">
            <button
              onClick={() => setOrdersCurrentPage(Math.max(1, ordersCurrentPage - 1))}
              disabled={ordersCurrentPage === 1}
              className="px-3 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 text-slate-600"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-xs text-slate-600 self-center">Page {ordersCurrentPage}</span>
            <button
              onClick={() => setOrdersCurrentPage(ordersCurrentPage + 1)}
              disabled={ordersCount <= (ordersCurrentPage * 10)}
              className="px-3 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 text-slate-600"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* CLOSE DAY CONFIRMATION MODAL */}
      {showCloseDayConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <h3 className="text-amber-800 font-bold mb-1">Close Day?</h3>
              <p className="text-amber-700 text-xs leading-relaxed">
                Are you sure you want to close the day? This will clear the order list and prepare you for a fresh start for the new day. All current orders will be archived and removed from view.
              </p>
            </div>
            <p className="text-slate-500 text-xs mb-6 text-center">
              This action cannot be undone locally.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseDayConfirm(false)}
                className="flex-1 h-9 border border-slate-200 rounded-lg text-sm text-slate-600 font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseDay}
                disabled={isClosingDay}
                className="flex-1 h-9 bg-[#0055FE] hover:bg-[#0047D1] rounded-lg text-sm text-white font-medium shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isClosingDay ? 'Closing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW ORDER MODAL */}
      {viewModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Order #{selectedOrder.id}</h3>
                <p className="text-xs text-slate-500">{selectedOrder.device_table_name || selectedOrder.tableNo || "Table N/A"}</p>
              </div>
              <button onClick={() => setViewModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full">
                <span className="sr-only">Close</span>
                {/* Close Icon SVG or Lucide X */}
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {hasTimings && (
                <div className="border border-slate-200 bg-slate-50 rounded-xl p-3 space-y-2 mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Service Instructions
                  </p>
                  {nowItems.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span
                        className="text-[10px] font-semibold text-slate-700 border border-slate-300 bg-white px-2 py-0.5 rounded shrink-0 mt-0.5"
                      >
                        Now
                      </span>
                      <span className="text-xs font-medium text-slate-700">{nowItems.join(", ")}</span>
                    </div>
                  )}
                  {withFoodItems.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span
                        className="text-[10px] font-semibold text-slate-600 border border-slate-200 bg-white px-2 py-0.5 rounded shrink-0 mt-0.5"
                      >
                        With food
                      </span>
                      <span className="text-xs font-medium text-slate-700">{withFoodItems.join(", ")}</span>
                    </div>
                  )}
                  {afterFoodItems.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span
                        className="text-[10px] font-semibold text-slate-600 border border-slate-200 bg-white px-2 py-0.5 rounded shrink-0 mt-0.5"
                      >
                        After food
                      </span>
                      <span className="text-xs font-medium text-slate-700">{afterFoodItems.join(", ")}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Items */}
              <div className="space-y-3">
                {/* Check both order_items (backend) and items (legacy/frontend) */}
                {(selectedOrder.order_items || selectedOrder.items) && (selectedOrder.order_items || selectedOrder.items).length > 0 ? (
                  (selectedOrder.order_items || selectedOrder.items).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg">
                      <div className="w-12 h-12 bg-slate-100 rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                        {/* Check multiple possible image field locations */}
                        {(item.image || item.image1 || item.item?.image) ? (
                          <OptimizedImage
                            src={item.image || item.image1 || item.item?.image}
                            alt={item.item_name}
                            width={48}
                            height={48}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400">No img</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900 line-clamp-1">{item.item_name || "Item"}</p>
                        {/* Handle both cases for price/qty location if structure varies */}
                        <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-semibold text-[#0055FE]">{currencyCode} {item.price}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-xs text-slate-400 py-4">No items details available</p>
                )}
              </div>

              {orderNotesSource?.includes("[Drinks: serve immediately]") && (
                <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                  <Clock className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.8} />
                  <span className="text-xs text-slate-600 font-medium">Drinks: Serve immediately</span>
                </div>
              )}
              {orderNotesSource?.includes("[Drinks: serve with food]") && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                  <Clock className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.8} />
                  <span className="text-xs text-slate-600 font-medium">Drinks: Serve with food</span>
                </div>
              )}

              {/* Notes */}
              {visibleNotes && (
                <div className="mt-4 bg-yellow-50 border border-yellow-100 p-3 rounded-lg">
                  <p className="text-xs font-bold text-yellow-700 uppercase mb-1">Notes</p>
                  <p className="text-xs text-yellow-800 italic">{visibleNotes}</p>
                </div>
              )}

              {/* Payment Details */}
              <div className="mt-6 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Payment Details</h4>
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Status</span>
                    <span className={`font-bold uppercase ${selectedPaymentInfo?.isFullyPaid ? 'text-green-600' : selectedPaymentInfo?.isPartial ? 'text-amber-600' : 'text-red-500'}`}>
                      {selectedPaymentInfo?.fulfillmentStatus === "cancelled" ? "Cancelled" : selectedPaymentInfo?.isFullyPaid ? "Paid" : selectedPaymentInfo?.isPartial ? "Partially Paid" : selectedOrder.payment_status || "Unpaid"}
                    </span>
                  </div>
                  {selectedPaymentInfo && (
                    <div className="rounded-lg bg-white border border-slate-200 p-3 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Paid</span>
                        <span className="font-semibold text-green-600">{formatMoney(selectedPaymentInfo.paid)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Remaining</span>
                        <span className="font-semibold text-slate-900">{formatMoney(selectedPaymentInfo.remaining)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-[#0055FE]" style={{ width: `${selectedPaymentInfo.progress}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Display Payments if available */}
                  {selectedOrder.payments && selectedOrder.payments.length > 0 ? (
                    selectedOrder.payments.map((p: any, i: number) => (
                      <div key={i} className="pt-2 border-t border-slate-200 mt-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Method</span>
                          <span className="font-medium text-slate-900 capitalize">{p.provider?.replace('_', ' ') || "N/A"}</span>
                        </div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Amount</span>
                          <span className="font-medium text-slate-900">{formatMoney(parseMoney(p.amount))}</span>
                        </div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Transaction ID</span>
                          <span className="font-medium text-slate-900">{p.transaction_id ? `#${p.transaction_id.slice(-8)}` : "N/A"}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Date</span>
                          <span className="font-medium text-slate-900">{new Date(p.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    selectedOrder.payment_status === 'paid' && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Method</span>
                        <span className="font-medium text-slate-900">Manual / Cash</span>
                      </div>
                    )
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-400">Total Amount</p>
                <p className="text-lg font-semibold">{currencyCode} {selectedOrder.total_price}</p>
              </div>
              <button onClick={() => setViewModalOpen(false)} className="bg-[#0055FE] hover:bg-[#0047D1] px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <PaymentGatewayModal
        open={openGatewayModal}
        onClose={() => setOpenGatewayModal(false)}
        provider={selectedProvider}
        onSuccess={fetchGateways}
      />
    </div>
  );
};

export default ScreenRestaurantOrderList;
