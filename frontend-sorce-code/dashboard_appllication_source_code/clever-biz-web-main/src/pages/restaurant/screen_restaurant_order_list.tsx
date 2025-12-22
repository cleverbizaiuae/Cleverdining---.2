import { useOwner } from "@/context/ownerContext";
import { useEffect, useState, useRef } from "react";
import StripeConnectModal from "../model/StripeConnectModal";
import PaymentGatewayModal from "../model/PaymentGatewayModal";
import axiosInstance from "@/lib/axios";
import {
  Search,
  Bell,
  CheckCircle2,
  Package,
  Clock,
  MoreHorizontal,
  Eye,
  Moon,
  ChevronDown
} from "lucide-react";
import toast from "react-hot-toast";

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

const ScreenRestaurantOrderList = () => {
  const {
    orders = [],
    ordersStats,
    ordersCurrentPage,
    ordersSearchQuery,
    fetchOrders,
    setOrdersCurrentPage,
    setOrdersSearchQuery,
    updateOrderStatus,
  } = useOwner();

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [closedDayDate, setClosedDayDate] = useState<string | null>(null);
  const [showCloseDayConfirm, setShowCloseDayConfirm] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [connectedGateways, setConnectedGateways] = useState<any[]>([]);

  // Payment States
  const [openStripe, setOpenStripe] = useState(false);
  const [openGatewayModal, setOpenGatewayModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<"stripe" | "razorpay" | "checkout" | "paytabs">("stripe");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      const { data } = await axiosInstance.get("/owners/payment-gateways/");
      setConnectedGateways(Array.isArray(data) ? data : data.results || []);
    } catch (e) {
      console.error("Failed to fetch gateways", e);
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

  // --- LOGIC ---

  // 1. Filter Orders (Close Day Logic)
  const activeOrders = orders.filter((order: any) => {
    // Exclude cancelled ? Spec says "Exclude cancelled orders".
    // Let's keep them if user wants to see them, or follow spec strictly.
    if (order.status === 'cancelled') return false;

    // Filter by Close Day
    if (closedDayDate) {
      const orderDate = new Date(order.created_at); // API uses created_at
      const closedDate = new Date(closedDayDate);
      return orderDate > closedDate;
    }
    return true;
  });

  // 2. Ready & Cash Orders
  const readyOrders = activeOrders.filter((order: any) =>
    order.status.toLowerCase() === 'ready' || order.status.toLowerCase() === 'served'
  );

  const cashOrders = activeOrders.filter((order: any) =>
    order.status === 'awaiting_cash' || order.payment_status === 'pending_cash'
  );

  // 3. Actions
  const handleCloseDay = () => {
    const now = new Date().toISOString();
    localStorage.setItem('closedDayDate', now);
    setClosedDayDate(now);
    setShowCloseDayConfirm(false);
    toast.success("Day closed successfully. Old orders archived.");
  };

  const handleConfirmCash = async (orderId: number) => {
    try {
      await axiosInstance.patch(`/owners/orders/confirm-cash/${orderId}/`);
      toast.success("Cash Received! Session Completed.");
      // Refresh list
      fetchOrders(ordersCurrentPage, debouncedSearchQuery);
    } catch (e) {
      console.error(e);
      toast.error("Failed to confirm cash payment");
    }
  };

  const handleMarkDelivered = async (orderId: number) => {
    try {
      await updateOrderStatus(orderId, 'completed');
      toast.success(`Order #${orderId} marked as delivered/completed`);
    } catch (error) {
      console.error("Failed to update status", error);
      toast.error("Failed to update order status");
    }
  };

  const handleAddGateway = (provider: "stripe" | "checkout" | "paytabs") => {
    setShowDropdown(false);
    if (provider === "stripe") {
      setOpenStripe(true);
    } else {
      setSelectedProvider(provider);
      setOpenGatewayModal(true);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'served':
      case 'ready':
        return 'text-green-600';
      case 'completed':
        return 'text-green-700';
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

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      toast.success(`Order status updated to ${newStatus}`);
    } catch (e) {
      console.error("Status update failed", e);
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="flex flex-col gap-6">

      {/* PENDING CASH BANNER */}
      {cashOrders.length > 0 && (
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-3 shadow-md flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2 fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-700 shrink-0 animate-pulse">
              <span className="text-lg">💵</span>
            </div>
            <div>
              <h3 className="font-bold text-yellow-800 text-sm">Cash Payments Pending</h3>
              <p className="text-xs text-yellow-700 font-medium">
                Collect cash from tables to complete sessions.
              </p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto">
            {cashOrders.map((order: any) => (
              <div key={order.id} className="bg-white border border-yellow-200 rounded-lg p-2.5 shadow-sm min-w-[220px] flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center text-yellow-800 font-bold text-xs shrink-0 border border-yellow-200">
                  {order.device_table_name || "Tab"}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900">Order #{order.id}</p>
                  <p className="text-[10px] text-slate-500 font-bold">AED {order.total_price}</p>
                </div>
                <button
                  onClick={() => handleConfirmCash(order.id)}
                  className="h-7 px-3 bg-yellow-500 hover:bg-yellow-600 text-white text-[10px] font-bold rounded shadow-sm transition-colors"
                >
                  Mark Received
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* READY FOR DELIVERY BANNER */}
      {readyOrders.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-3 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2 fade-in duration-300">
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

          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto">
            {readyOrders.map((order: any) => (
              <div key={order.id} className="bg-white border border-green-100 rounded-lg p-2.5 shadow-sm min-w-[200px] flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {order.device_table_name || "Tab"}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900">Order #{order.id}</p>
                  <p className="text-[10px] text-slate-500">AED {order.total_price}</p>
                </div>
                <button
                  onClick={() => handleMarkDelivered(order.id)}
                  className="h-7 px-3 bg-green-600 hover:bg-green-700 text-white text-[10px] font-medium rounded transition-colors"
                >
                  Mark
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Ongoing Orders"
          value={activeOrders.filter((o: any) => ['pending', 'preparing', 'awaiting_cash'].includes(o.status.toLowerCase())).length}
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
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">

        {/* Header Bar */}
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowCloseDayConfirm(true)}
              className="h-8 px-3 bg-[#0055FE] hover:bg-[#0047D1] text-white text-xs font-medium rounded-lg flex items-center gap-2 transition-colors"
            >
              <Moon size={14} /> Close Day
            </button>

            {/* Payment Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="h-8 px-3 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg flex items-center gap-2 transition-colors"
              >
                Add Payment Account <ChevronDown size={14} />
              </button>
              {showDropdown && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-slate-100 overflow-hidden z-20">
                  <button onClick={() => handleAddGateway("stripe")} className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50">Add Stripe</button>
                  <button onClick={() => handleAddGateway("checkout")} className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50">Add Checkout.com</button>
                  <button onClick={() => handleAddGateway("paytabs")} className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50">Add PayTabs</button>
                </div>
              )}
            </div>

            {/* Connected Chips */}
            <div className="flex gap-2">
              {connectedGateways.slice(0, 2).map((gw: any) => (
                <span key={gw.id} className={`px-2 py-1 rounded text-[10px] font-bold border uppercase ${gw.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  {gw.provider}
                </span>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0055FE]" size={16} />
            <input
              type="text"
              placeholder="Search by Order ID..."
              className="w-full h-9 pl-10 pr-4 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0055FE]"
              value={ordersSearchQuery}
              onChange={(e) => {
                setOrdersSearchQuery(e.target.value);
                setOrdersCurrentPage(1);
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 text-xs font-medium text-slate-600">Order ID</th>
                <th className="px-5 py-3 text-xs font-medium text-slate-600">Table No</th>
                <th className="px-5 py-3 text-xs font-medium text-slate-600">Payment</th>
                <th className="px-5 py-3 text-xs font-medium text-slate-600">Date/Time</th>
                <th className="px-5 py-3 text-xs font-medium text-slate-600">Amount</th>
                <th className="px-5 py-3 text-xs font-medium text-slate-600">Status</th>
                <th className="px-5 py-3 text-xs font-medium text-slate-600 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeOrders.length > 0 ? (
                activeOrders.map((order: any) => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">#{order.id}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{order.device_table_name || "N/A"}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${['paid', 'completed'].includes((order.payment_status || '').toLowerCase())
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                        }`}>
                        {order.payment_status || "Unpaid"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(order.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">AED {order.total_price}</td>
                    <td className="px-5 py-3">
                      {/* STATUS DROPDOWN */}
                      <select
                        value={order.status.toLowerCase()}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className={`text-xs font-semibold uppercase bg-slate-50 border-none outline-none cursor-pointer ${getStatusColor(order.status)}`}
                      >
                        <option value="pending" className="text-yellow-600">Pending</option>
                        <option value="preparing" className="text-orange-600">Preparing</option>
                        <option value="served" className="text-green-600">Ready</option>
                        <option value="completed" className="text-green-700">Delivered</option>
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
                        {/* More Options Dropdown - can be expanded later if needed */}
                        <div className="relative group">
                          <button className="text-[#0055FE] hover:bg-[#0055FE]/10 p-1.5 rounded transition-colors">
                            <MoreHorizontal size={16} />
                          </button>
                          {/* Simple Hover Menu for Actions */}
                          <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded shadow-lg border border-slate-100 hidden group-hover:block z-10">
                            <button onClick={() => handleStatusChange(order.id, 'completed')} className="block w-full text-left px-3 py-2 text-xs text-green-600 hover:bg-slate-50">Close Tab</button>
                            <button onClick={() => handleStatusChange(order.id, 'cancelled')} className="block w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-slate-50">Cancel Order</button>
                          </div>
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
              disabled={orders.length < 10}
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
                className="flex-1 h-9 bg-[#0055FE] hover:bg-[#0047D1] rounded-lg text-sm text-white font-medium shadow-lg shadow-blue-500/20"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW ORDER MODAL */}
      {viewModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Order #{selectedOrder.id}</h3>
                <p className="text-xs text-slate-500">{selectedOrder.device_table_name || "Table N/A"}</p>
              </div>
              <button onClick={() => setViewModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="sr-only">Close</span>
                {/* Close Icon SVG or Lucide X */}
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {/* Items */}
              <div className="space-y-3">
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  selectedOrder.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg">
                      <div className="w-12 h-12 bg-slate-100 rounded-md flex items-center justify-center shrink-0">
                        {item.image || item.image1 ? (
                          <img src={item.image || item.image1} alt={item.item_name} className="w-full h-full object-cover rounded-md" />
                        ) : (
                          <span className="text-[10px] text-slate-400">Img</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900 line-clamp-1">{item.item_name || "Item"}</p>
                        <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-semibold text-[#0055FE]">AED {item.price}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-xs text-slate-400 py-4">No items details available</p>
                )}
              </div>

              {/* Notes */}
              {selectedOrder.special_request && (
                <div className="mt-4 bg-yellow-50 border border-yellow-100 p-3 rounded-lg">
                  <p className="text-xs font-bold text-yellow-700 uppercase mb-1">Notes</p>
                  <p className="text-xs text-yellow-800 italic">{selectedOrder.special_request}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-400">Total Amount</p>
                <p className="text-xl font-bold">AED {selectedOrder.total_price}</p>
              </div>
              <button onClick={() => setViewModalOpen(false)} className="bg-[#0055FE] hover:bg-[#0047D1] px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <StripeConnectModal open={openStripe} onClose={() => setOpenStripe(false)} />
      <PaymentGatewayModal
        open={openGatewayModal}
        onClose={() => setOpenGatewayModal(false)}
        provider={selectedProvider}
      />
    </div>
  );
};

export default ScreenRestaurantOrderList;
