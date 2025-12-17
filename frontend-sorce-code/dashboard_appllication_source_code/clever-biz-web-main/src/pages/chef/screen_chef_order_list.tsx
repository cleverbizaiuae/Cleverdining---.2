import { useStaff } from "@/context/staffContext";
import { useEffect, useState } from "react";
import {
  Search,
  CheckCircle2,
  Package,
  Clock,
  Eye,
  MoreHorizontal
} from "lucide-react";
import toast from "react-hot-toast";
import OrderDetailsModal from "@/components/ui/order-datials-modal";

// 1. METRIC CARDS (Copied from Staff Dashboard)
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

const ScreenChefOrderList = () => {
  const {
    orders,
    ordersStats,
    ordersCount,
    ordersCurrentPage,
    ordersSearchQuery,
    fetchOrders,
    updateOrderStatus,
    setOrdersCurrentPage,
    setOrdersSearchQuery,
  } = useStaff();

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(ordersSearchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [ordersSearchQuery]);

  // Load orders
  useEffect(() => {
    fetchOrders(ordersCurrentPage, debouncedSearchQuery);
  }, [ordersCurrentPage, debouncedSearchQuery, fetchOrders]);

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      toast.success(`Order status updated to ${newStatus}`);
    } catch (e) {
      console.error("Status update failed", e);
      toast.error("Failed to update status");
    }
  };

  const handleViewOrder = (order: any) => {
    // Determine if we need to fetch details or if they are already in 'order' object
    // Staff context 'orders' usually has nested items.
    setSelectedOrder(order);
    setViewModalOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'served':
      case 'ready':
        return 'text-green-600';
      case 'completed':
        return 'text-green-700';
      case 'preparing': // Chef specific focus
        return 'text-orange-600';
      case 'awaiting_cash':
        return 'text-yellow-700 font-bold';
      case 'pending':
      default:
        return 'text-yellow-600';
    }
  };

  return (
    <div className="flex flex-col gap-6">

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Ongoing Orders"
          value={
            ordersStats?.ongoing_orders ||
            // Fallback calculation if stats missing
            orders.filter((o: any) => ['pending', 'preparing'].includes(o.status.toLowerCase())).length ||
            0
          }
          icon={Clock}
          colorClass="text-[#0055FE]"
          bgClass="bg-white"
          iconBgClass="bg-[#0055FE]/10"
        />
        <MetricCard
          title="Completed Today"
          value={ordersStats?.today_completed_order_count || ordersStats?.total_completed_orders || 0}
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
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">OrderList</h2>
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
                {/* Chef might not care about Payment, but to replicate exact look, we include it */}
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
                    <td className="px-5 py-3 text-xs text-slate-600">{order.device_table_name || order.device_name || "N/A"}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${['paid', 'completed'].includes((order.payment_status || '').toLowerCase())
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                        }`}>
                        {order.payment_status || "Unpaid"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {order.created_at ? new Date(order.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "N/A"}
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">${order.total_price}</td>
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
                        <div className="relative group">
                          <button className="text-[#0055FE] hover:bg-[#0055FE]/10 p-1.5 rounded transition-colors">
                            <MoreHorizontal size={16} />
                          </button>
                          <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded shadow-lg border border-slate-100 hidden group-hover:block z-10">
                            <button onClick={() => handleStatusChange(order.id, 'completed')} className="block w-full text-left px-3 py-2 text-xs text-green-600 hover:bg-slate-50">Complete</button>
                            <button onClick={() => handleStatusChange(order.id, 'cancelled')} className="block w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-slate-50">Cancel</button>
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

        {/* Pagination using standard buttons matching Staff Look */}
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
              disabled={ordersCount <= (ordersCurrentPage * 10)} // Approximation if page size 10
              className="px-3 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 text-slate-600"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* VIEW ORDER MODAL - Reused component or minimal version */}
      {viewModalOpen && selectedOrder && (
        <OrderDetailsModal
          isOpen={viewModalOpen}
          order={selectedOrder}
          onClose={() => setViewModalOpen(false)}
        />
      )}

    </div>
  );
};

export default ScreenChefOrderList;
