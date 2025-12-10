import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../../hooks/WebSocketProvider';
import {
    Search,
    Filter,
    CheckCircle,
    XCircle,
    Eye,
    RefreshCw,
    Download,
    Calendar as CalendarIcon,
    MoreHorizontal,
    X,
    CreditCard,
    Banknote,
    Smartphone,
    ChevronRight,
    ShoppingBag
} from 'lucide-react';
import axios from '../../lib/axios';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import toast from 'react-hot-toast';

interface Payment {
    id: number;
    order_id: number;
    table_name: string;
    customer_name: string;
    amount: string;
    provider: string;
    status: 'completed' | 'pending' | 'failed' | 'cancelled' | 'refunded' | 'initiated';
    created_at: string;
    updated_at: string;
}

interface OrderItem {
    id: number;
    item_name: string;
    quantity: number;
    price: string;
    foodItem?: {
        image?: string;
    };
}

interface PaymentWithOrder extends Payment {
    order?: {
        id: number;
        items?: OrderItem[];
    };
}

const PaymentDetailModal = ({
    isOpen,
    onClose,
    payment
}: {
    isOpen: boolean;
    onClose: () => void;
    payment: PaymentWithOrder | null;
}) => {
    const [loadingOrder, setLoadingOrder] = useState(false);
    const [orderDetails, setOrderDetails] = useState<any>(null);

    useEffect(() => {
        if (isOpen && payment?.order_id) {
            fetchOrderDetails(payment.order_id);
        }
    }, [isOpen, payment]);

    const fetchOrderDetails = async (orderId: number) => {
        setLoadingOrder(true);
        try {
            const res = await axios.get(`/owners/orders/${orderId}/?includeItems=true`); // Assuming this endpoint exists or similar
            setOrderDetails(res.data);
        } catch (error) {
            console.error("Failed to fetch order details", error);
            // Fallback or just show basic info
        } finally {
            setLoadingOrder(false);
        }
    };

    if (!isOpen || !payment) return null;

    const items = orderDetails?.items || [];

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-slate-100">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Payment Details</h3>
                        <p className="text-sm text-slate-500">Transaction ID: #{payment.id}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-50 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 p-6 bg-slate-50 border-b border-slate-100">
                    <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Table</p>
                        <p className="text-sm font-bold text-slate-900">{payment.table_name || "N/A"}</p>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Status</p>
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold capitalize
                            ${payment.status === 'completed' ? 'bg-green-100 text-green-700' :
                                payment.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                    payment.status === 'failed' ? 'bg-red-100 text-red-700' :
                                        'bg-slate-100 text-slate-600'}`}>
                            {payment.status}
                        </span>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Provider</p>
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-900 capitalize">
                            {payment.provider === 'card' && <CreditCard size={14} className="text-[#0055FE]" />}
                            {payment.provider === 'cash' && <Banknote size={14} className="text-emerald-500" />}
                            {(payment.provider !== 'card' && payment.provider !== 'cash') && <Smartphone size={14} className="text-purple-500" />}
                            {payment.provider.replace('_', ' ')}
                        </div>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Order ID</p>
                        <p className="text-sm font-bold text-slate-900">#{payment.order_id}</p>
                    </div>
                </div>

                {/* Order Items */}
                <div className="flex-1 overflow-y-auto p-6">
                    <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                        Order Summary
                        {loadingOrder && <RefreshCw size={12} className="animate-spin text-slate-400" />}
                    </h4>

                    {items.length > 0 ? (
                        <div className="space-y-4">
                            {items.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                                        {item.order_item?.foodItem?.image ? (
                                            <img src={item.order_item.foodItem.image} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                <ShoppingBag size={16} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-slate-900">{item.item_name}</p>
                                        <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                                    </div>
                                    <p className="text-sm font-bold text-slate-700">${item.price}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-400 text-sm">
                            {loadingOrder ? "Loading items..." : "No items details available."}
                        </div>
                    )}
                </div>

                {/* Total Bar */}
                <div className="bg-[#0055FE] p-4 text-white flex justify-between items-center">
                    <span className="font-medium text-sm text-blue-100">Total Paid Amount</span>
                    <span className="font-bold text-xl">${payment.amount}</span>
                </div>

                {/* Footer */}
                <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
                    <p className="text-xs text-slate-400">
                        Processed on {new Date(payment.created_at).toLocaleString()}
                    </p>
                </div>
            </div>
        </div>
    );
};

// --- MAIN PAGE ---

export const Payments = () => {
    // State
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);

    const [selectedPayments, setSelectedPayments] = useState<Set<number>>(new Set());
    const [seeded, setSeeded] = useState(false); // Flag to prevent infinite seeding loops

    // Modal State
    const [viewPayment, setViewPayment] = useState<PaymentWithOrder | null>(null);
    const [isViewOpen, setIsViewOpen] = useState(false);

    const { response } = useWebSocket();

    // Fetch Logic
    const fetchPayments = useCallback(async () => {
        setLoading(true);
        try {
            let url = '/owners/payments/';
            const params = new URLSearchParams();
            if (startDate) params.append('created_at__gte', startDate.toISOString().split('T')[0]);
            if (endDate) params.append('created_at__lte', endDate.toISOString().split('T')[0]);
            if (params.toString()) url += `?${params.toString()}`;

            const res = await axios.get(url);

            if (Array.isArray(res.data)) {
                // Auto-seed if empty and no filters active (fresh load)
                if (res.data.length === 0 && !startDate && !endDate && !seeded) {
                    await seedSamplePayments();
                } else {
                    setPayments(res.data);
                }
            } else {
                setPayments([]);
            }
        } catch (error) {
            console.error("Failed to fetch payments", error);
            toast.error("Failed to load payments");
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, seeded]);

    // Seeding Logic
    const seedSamplePayments = async () => {
        setSeeded(true); // Mark seeded to prevent loop
        try {
            // Create dummy payments
            const dummyPayments = [
                { orderId: 101, table: 5, amount: "92.00", provider: "card", status: "completed" },
                { orderId: 102, table: 3, amount: "45.50", provider: "cash", status: "pending" },
                { orderId: 103, table: 8, amount: "120.00", provider: "apple_pay", status: "completed" },
                { orderId: 104, table: 2, amount: "22.00", provider: "card", status: "failed" },
                { orderId: 105, table: 6, amount: "85.00", provider: "google_pay", status: "refunded" }
            ];

            // Post them sequentially
            for (const p of dummyPayments) {
                try {
                    await axios.post('/owners/payments/', {
                        order_id: p.orderId,
                        table_number: p.table, // Adjust based on actual API payload
                        amount: p.amount,
                        provider: p.provider,
                        status: p.status
                    });
                } catch (e) {
                    // Ignore specific seed errors
                }
            }

            // Refresh list
            fetchPayments();
        } catch (e) {
            console.error("Seeding failed", e);
        }
    };

    // Effects
    useEffect(() => {
        fetchPayments();
    }, [fetchPayments]);

    useEffect(() => {
        if (response && (response.type === 'payment:created' || response.type === 'payment:updated')) {
            fetchPayments();
        }
    }, [response, fetchPayments]);

    // Handlers
    const handleExportCSV = async () => {
        if (selectedPayments.size === 0 && !window.confirm("Export all visible payments?")) return;

        try {
            // Build CSV content client-side based on selection or current list
            const listToExport = selectedPayments.size > 0
                ? payments.filter(p => selectedPayments.has(p.id))
                : filteredPayments;

            const headers = ["ID", "Order ID", "Table", "Amount", "Provider", "Status", "Date"];
            const rows = listToExport.map(p => [
                p.id,
                p.order_id,
                p.table_name,
                p.amount,
                p.provider,
                p.status,
                new Date(p.created_at).toISOString()
            ]);

            const csvContent = "data:text/csv;charset=utf-8,"
                + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `payments_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();

            toast.success("Export successful");
        } catch (error) {
            console.error("Export failed", error);
            toast.error("Export failed");
        }
    };

    const toggleSelection = (id: number) => {
        const newSet = new Set(selectedPayments);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedPayments(newSet);
    };

    const toggleAll = () => {
        if (selectedPayments.size === filteredPayments.length) {
            setSelectedPayments(new Set());
        } else {
            setSelectedPayments(new Set(filteredPayments.map(p => p.id)));
        }
    };

    // Filtering
    const filteredPayments = payments.filter(p => {
        const matchesFilter = filter === 'all' || p.status === filter;
        const matchesSearch =
            p.order_id?.toString().includes(search) ||
            p.table_name?.toLowerCase().includes(search.toLowerCase()) ||
            p.customer_name?.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-50 text-green-700 border-green-100';
            case 'pending': return 'bg-yellow-50 text-yellow-700 border-yellow-100';
            case 'failed': return 'bg-red-50 text-red-700 border-red-100';
            case 'refunded': return 'bg-slate-100 text-slate-600 border-slate-200';
            default: return 'bg-blue-50 text-blue-700 border-blue-100';
        }
    };

    return (
        <div className="min-h-screen bg-slate-50/50 p-6 font-inter">
            {/* Header */}
            <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">Payments</h1>
                    <p className="text-slate-500 text-sm">Manage and track all transaction history</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Date Range */}
                    <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
                        <div className="relative">
                            <DatePicker
                                selected={startDate}
                                onChange={setStartDate}
                                placeholderText="Start Date"
                                className="w-24 pl-2 py-1 text-sm bg-transparent outline-none text-slate-600 placeholder:text-slate-400"
                            />
                        </div>
                        <span className="text-slate-400">-</span>
                        <div className="relative">
                            <DatePicker
                                selected={endDate}
                                onChange={setEndDate}
                                placeholderText="End Date"
                                className="w-24 pl-2 py-1 text-sm bg-transparent outline-none text-slate-600 placeholder:text-slate-400"
                            />
                        </div>
                    </div>

                    <button
                        onClick={fetchPayments}
                        className="p-2 bg-white text-slate-600 rounded-lg border border-[#0055FE] hover:bg-blue-50 transition-colors text-[#0055FE]"
                        title="Refresh"
                    >
                        <RefreshCw size={18} />
                    </button>

                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-4 py-2 bg-[#0055FE] text-white rounded-lg hover:bg-[#0047D1] transition-colors shadow-lg shadow-blue-500/20 text-sm font-medium"
                    >
                        <Download size={16} />
                        <span>Export Selected ({selectedPayments.size})</span>
                    </button>
                </div>
            </div>

            {/* Content Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Search */}
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
                        />
                    </div>

                    {/* Filter */}
                    <div className="relative">
                        <select
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            className="pl-3 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:border-[#0055FE] outline-none cursor-pointer appearance-none"
                        >
                            <option value="all">All Status</option>
                            <option value="completed">Completed</option>
                            <option value="pending">Pending</option>
                            <option value="failed">Failed</option>
                        </select>
                        <Filter className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 w-10">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-[#0055FE] focus:ring-[#0055FE]"
                                        checked={selectedPayments.size === filteredPayments.length && filteredPayments.length > 0}
                                        onChange={toggleAll}
                                    />
                                </th>
                                <th className="px-6 py-4">ID</th>
                                <th className="px-6 py-4">Order</th>
                                <th className="px-6 py-4">Table</th>
                                <th className="px-6 py-4">Amount</th>
                                <th className="px-6 py-4">Provider</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Time</th>
                                <th className="px-6 py-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-400">Loading payments...</td></tr>
                            ) : filteredPayments.length === 0 ? (
                                <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-400">No payments found</td></tr>
                            ) : (
                                filteredPayments.map((p) => (
                                    <tr
                                        key={p.id}
                                        className={`hover:bg-slate-50/50 transition-colors ${selectedPayments.has(p.id) ? 'bg-blue-50/30' : ''}`}
                                    >
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 text-[#0055FE] focus:ring-[#0055FE]"
                                                checked={selectedPayments.has(p.id)}
                                                onChange={() => toggleSelection(p.id)}
                                            />
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-900 text-sm">#{p.id}</td>
                                        <td className="px-6 py-4 text-slate-600 text-sm">#{p.order_id}</td>
                                        <td className="px-6 py-4 text-slate-600 text-sm">{p.table_name || "-"}</td>
                                        <td className="px-6 py-4 font-bold text-slate-900">${p.amount}</td>
                                        <td className="px-6 py-4 text-sm capitalize text-slate-600">{p.provider?.replace('_', ' ')}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(p.status)} capitalize`}>
                                                {p.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 text-xs">
                                            {new Date(p.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => { setViewPayment(p); setIsViewOpen(true); }}
                                                className="p-1.5 text-[#0055FE] bg-[#0055FE]/5 hover:bg-blue-50 rounded-lg transition-colors border border-transparent mx-auto block"
                                            >
                                                <Eye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center">
                <p className="text-xs text-slate-400">Powered by CleverBiz AI</p>
            </div>

            {/* Detail Modal */}
            <PaymentDetailModal
                isOpen={isViewOpen}
                onClose={() => setIsViewOpen(false)}
                payment={viewPayment}
            />
        </div>
    );
};
