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
      case 'served':
      case 'ready':
        return 'text-green-600';
      case 'completed':
        return 'text-green-700';
      case 'preparing':
        return 'text-orange-600';
      case 'pending':
      default:
        return 'text-yellow-600';
    }
  };

  return (
    <div className="flex flex-col gap-6">

      {/* READY FOR DELIVERY ALERT BANNER */}
      {/* Spec: Gradient Green-50 to Emerald-50, Border Green-200. "Serve Now" badge pulsing. */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-3 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
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

        {/* Example Order Cards Inside Banner (Static Mock based on description) */}
        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto">
          {[1, 2].map(i => (
            <div key={i} className="bg-white border border-green-100 rounded-lg p-2.5 shadow-sm min-w-[200px] flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
                T{i + 2}
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-900">Order #{1020 + i}</p>
                <p className="text-[10px] text-slate-500">2 items • 5 mins ago</p>
              </div>
              <button className="h-7 px-3 bg-green-600 hover:bg-green-700 text-white text-[10px] font-medium rounded transition-colors">
                Mark
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Ongoing Orders"
          value={ordersStats?.ongoing_orders || 0}
          icon={Clock}
          colorClass="text-[#0055FE]"
          bgClass="bg-white"
          iconBgClass="bg-[#0055FE]/10" // Blue container
        />
        <MetricCard
          title="Completed Today"
          value={ordersStats?.today_completed_order_count || 0}
          icon={CheckCircle2}
          colorClass="text-[#0055FE]" // Using Blue as primary brand for icons usually, but spec said specific icons. 
          // Wait, spec was: Ongoing (Clock), Completed (CheckCircle2), Total (Package).
          // Spec didn't enforce valid colors for icons but container is bg-[#0055FE]/10 usually, let's keep Royal Blue consistency unless stated otherwise.
          // Actually spec said: "Same structure as Dashboard with icons... Icon (Royal Blue)".
          // So I will force Royal Blue icons.
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
            <button className="h-8 px-3 bg-[#0055FE] hover:bg-[#0047D1] text-white text-xs font-medium rounded-lg flex items-center gap-2 transition-colors">
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0055FE]" size={16} /> {/* Blue Search Icon */}
            <input
              type="text"
              placeholder="Search Order ID..."
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
              {orders.length > 0 ? (
                orders.map((order: any) => (
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
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">${order.total_price}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold uppercase ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end items-center gap-2">
                        <button className="text-[#0055FE] hover:bg-[#0055FE]/10 p-1.5 rounded transition-colors">
                          <Eye size={16} />
                        </button>
                        <button className="text-[#0055FE] hover:bg-[#0055FE]/10 p-1.5 rounded transition-colors">
                          <MoreHorizontal size={16} />
                        </button>
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
