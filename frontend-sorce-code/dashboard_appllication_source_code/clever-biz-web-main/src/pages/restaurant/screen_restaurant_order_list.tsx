import { useOwner } from "@/context/ownerContext";
import { useEffect, useState, useRef } from "react";
import StripeConnectModal from "../model/StripeConnectModal";
import PaymentGatewayModal from "../model/PaymentGatewayModal";
import axiosInstance from "@/lib/axios";
import {
  Search,
  Bike,
  CheckCircle2,
  ClipboardList,
  Clock,
  MoreHorizontal,
  Eye,
  XOctagon
} from "lucide-react";
import toast from "react-hot-toast";

// --- COMPONENTS ---

const MetricCard = ({ title, value, icon: Icon, colorClass, bgClass, iconBgClass }: any) => (
  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
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
    ordersCount,
    ordersCurrentPage,
    ordersSearchQuery,
    fetchOrders,
    setOrdersCurrentPage,
    setOrdersSearchQuery,
  } = useOwner();

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [connectedGateways, setConnectedGateways] = useState<any[]>([]);

  // Payment States
  const [openStripe, setOpenStripe] = useState(false);
  const [openGatewayModal, setOpenGatewayModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<"stripe" | "razorpay" | "checkout" | "paytabs">("stripe");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch gateways
  const fetchGateways = async () => {
    try {
      const { data } = await axiosInstance.get("/owners/payment-gateways/");
      setConnectedGateways(Array.isArray(data) ? data : data.results || []);
    } catch (e) {
      console.error("Failed to fetch gateways", e);
    }
  };

  useEffect(() => {
    fetchGateways();
  }, [openGatewayModal, openStripe]);

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
      case 'completed': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'pending': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'cancelled': return 'bg-red-50 text-red-600 border-red-100';
      case 'preparing': return 'bg-blue-50 text-blue-600 border-blue-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 font-inter">
      {/* Header */}
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Order Status</h1>

      {/* Delivery Banner */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-6 text-white mb-8 shadow-lg shadow-emerald-500/20 relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <Bike size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Ready for Delivery</h2>
              <p className="text-emerald-100 text-sm">There are 0 orders waiting for delivery.</p>
            </div>
          </div>
          <button className="bg-white text-emerald-600 px-6 py-2.5 rounded-lg font-semibold shadow-sm hover:bg-emerald-50 transition-colors">
            Serve Now
          </button>
        </div>
        {/* Background Pattern */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 filter blur-3xl"></div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <MetricCard
          title="Ongoing Order"
          value={ordersStats?.ongoing_orders || 0}
          icon={Clock}
          colorClass="text-[#0055FE]"
          bgClass="bg-[#0055FE]/5"
          iconBgClass="bg-[#0055FE]/10"
        />
        <MetricCard
          title="Completed Today"
          value={ordersStats?.today_completed_order_count || 0}
          icon={CheckCircle2}
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50"
          iconBgClass="bg-emerald-100"
        />
        <MetricCard
          title="Total Orders"
          value={ordersStats?.total_completed_orders || 0}
          icon={ClipboardList}
          colorClass="text-purple-600"
          bgClass="bg-purple-50"
          iconBgClass="bg-purple-100"
        />
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="p-5 border-b border-slate-200 flex flex-col gap-4">
          {/* Top Row: Title + Payment Gateways + Search */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-slate-900">List of items</h3>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Connected Gateways Chips */}
              <div className="flex flex-wrap items-center gap-2">
                {connectedGateways.map((gw: any) => (
                  <button
                    key={gw.id}
                    onClick={() => {
                      setSelectedProvider(gw.provider);
                      setOpenGatewayModal(true);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all ${gw.is_active
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                        : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                      }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${gw.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                    {gw.provider === "stripe" ? "Stripe" :
                      gw.provider === "razorpay" ? "Razorpay" :
                        gw.provider === "checkout" ? "Checkout.com" :
                          gw.provider === "paytabs" ? "PayTabs" : gw.provider}
                  </button>
                ))}
              </div>

              {/* Add Payment Button */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg hover:brightness-110 active:scale-95 transition-all"
                >
                  <span>+ Add Payment</span>
                </button>

                {showDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-20 animate-fadeIn">
                    <div className="py-1">
                      <button onClick={() => handleAddGateway("stripe")} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-[#0055FE]">Add Stripe</button>
                      <button onClick={() => handleAddGateway("checkout")} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-[#0055FE]">Add Checkout.com</button>
                      <button onClick={() => handleAddGateway("paytabs")} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-[#0055FE]">Add PayTabs</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search by Order ID"
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10"
                  value={ordersSearchQuery}
                  onChange={(e) => {
                    setOrdersSearchQuery(e.target.value);
                    setOrdersCurrentPage(1);
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Order ID</th>
                <th className="px-6 py-4">Table No</th>
                <th className="px-6 py-4">Payment</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Cost</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.length > 0 ? (
                orders.map((order: any) => (
                  <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 text-slate-900 font-medium">#{order.id}</td>
                    <td className="px-6 py-4 text-slate-600">{order.device_table_name || "N/A"}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wide">
                        {order.payment_status || "Unpaid"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-slate-900 font-bold">${order.total_price}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(order.status)} uppercase tracking-wide`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button className="p-2 text-slate-400 hover:text-[#0055FE] hover:bg-blue-50 rounded-lg transition-colors">
                          <Eye size={18} />
                        </button>
                        {order.status !== 'completed' && order.status !== 'cancelled' && (
                          <button className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <XOctagon size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    No orders found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {orders.length > 0 ? (
            orders.map((order: any) => (
              <div key={order.id} className="p-4 hover:bg-slate-50 active:bg-slate-100 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs text-slate-500 block mb-1">#{order.id}</span>
                    <h4 className="text-slate-900 font-bold text-lg">${order.total_price}</h4>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(order.status)} uppercase tracking-wide`}>
                    {order.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-sm mb-4">
                  <div className="text-slate-500">Table: <span className="text-slate-900 font-medium">{order.device_table_name}</span></div>
                  <div className="text-slate-500 text-right">{new Date(order.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex justify-end gap-2">
                  <button className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-2">
                    <Eye size={16} /> Details
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-slate-400">No orders found</div>
          )}
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-200 flex justify-center">
          <div className="flex gap-2">
            <button
              onClick={() => setOrdersCurrentPage((p: number) => Math.max(1, p - 1))}
              disabled={ordersCurrentPage === 1}
              className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-slate-600 self-center">Page {ordersCurrentPage}</span>
            <button
              onClick={() => setOrdersCurrentPage((p: number) => p + 1)}
              disabled={orders.length < 10}
              className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

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
