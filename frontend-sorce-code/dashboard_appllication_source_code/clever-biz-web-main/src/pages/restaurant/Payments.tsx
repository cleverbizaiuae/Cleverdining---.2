/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../../hooks/WebSocketProvider';
import {
    Search,
    Filter,
    Eye,
    RefreshCw,
    Download,
    X,
    CreditCard,
    Banknote,
    Smartphone,
    ShoppingBag,
    DollarSign,
    Wallet,
    AlertCircle
} from 'lucide-react';
import axios from '../../lib/axios';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import toast from 'react-hot-toast';

// --- COMPONENTS ---

// 1. METRIC CARD
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

// Types
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

interface PaymentWithOrder extends Payment {
    order?: {
        items?: {
            id: number;
            item_name: string;
            quantity: number;
            price: string;
            order_item?: { foodItem?: { image?: string } };
        }[];
    };
}

const PaymentDetailModal = ({ isOpen, onClose, payment }: { isOpen: boolean; onClose: () => void; payment: PaymentWithOrder | null }) => {
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
            const res = await axios.get(`/owners/orders/${orderId}/?includeItems=true`);
            setOrderDetails(res.data);
        } catch (error) {
            console.error("Failed to fetch order details", error);
        } finally {
            setLoadingOrder(false);
        }
    };

    if (!isOpen || !payment) return null;

    const items = orderDetails?.items || [];

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-6 border-b border-slate-100">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Payment Details</h3>
                        <p className="text-sm text-slate-500">Transaction ID: #{payment.id}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-50 transition-colors">
                        <X size={20} />
                    </button>
                </div>
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
                        <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Order Amount</p>
                        <p className="text-sm font-bold text-slate-900">${payment.amount}</p>
                    </div>
                </div>
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
                            {loadingOrder ? "Loading items..." : "No items found."}
                        </div>
                    )}
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-400">
                    Processed: {new Date(payment.created_at).toLocaleString()}
                </div>
            </div>
        </div>
    );
};

export const Payments = () => {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [selectedPayments, setSelectedPayments] = useState<Set<number>>(new Set());
    const [viewPayment, setViewPayment] = useState<PaymentWithOrder | null>(null);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const { response } = useWebSocket();

    const fetchPayments = useCallback(async () => {
        setLoading(true);
        try {
            let url = '/owners/payments/';
            const params = new URLSearchParams();
            if (startDate) params.append('created_at__gte', startDate.toISOString().split('T')[0]);
            if (endDate) params.append('created_at__lte', endDate.toISOString().split('T')[0]);
            if (params.toString()) url += `?${params.toString()}`;
            const res = await axios.get(url);
            setPayments(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error("Failed to fetch payments", error);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => { fetchPayments(); }, [fetchPayments]);
    useEffect(() => {
        if (response && (response.type === 'payment:created' || response.type === 'payment:updated')) {
            fetchPayments();
        }
    }, [response, fetchPayments]);

    const handleExportCSV = async () => {
        if (selectedPayments.size === 0 && !window.confirm("Export all visible payments?")) return;
        try {
            const list = selectedPayments.size > 0 ? payments.filter(p => selectedPayments.has(p.id)) : filteredPayments;
            const headers = ["ID", "Order ID", "Table", "Amount", "Provider", "Status", "Date"];
            const rows = list.map(p => [p.id, p.order_id, p.table_name, p.amount, p.provider, p.status, new Date(p.created_at).toISOString()]);
            const csv = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            const link = document.createElement("a");
            link.href = encodeURI(csv);
            link.download = `payments_${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            toast.success("Export successful");
        } catch { toast.error("Export failed"); }
    };

    const filteredPayments = payments.filter(p => {
        const matchesFilter = filter === 'all' || p.status === filter;
        const matchesSearch = p.order_id?.toString().includes(search) || p.table_name?.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-50 text-green-700 border-green-100';
            case 'pending': return 'bg-yellow-50 text-yellow-700 border-yellow-100';
            case 'failed': return 'bg-red-50 text-red-700 border-red-100';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    // Calculate totals for cards
    const totalRevenue = payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const pendingAmount = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + parseFloat(p.amount), 0);

    return (
        <div className="flex flex-col gap-6 font-inter">
            {/* METRIC CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                    title="Total Revenue"
                    value={`$${totalRevenue.toFixed(2)}`}
                    icon={DollarSign}
                    colorClass="text-[#0055FE]"
                    bgClass="bg-white"
                    iconBgClass="bg-[#0055FE]/10"
                />
                <MetricCard
                    title="Received Amount"
                    value={`$${totalRevenue.toFixed(2)}`} // Assuming received = completed revenue for now
                    icon={Wallet}
                    colorClass="text-green-600"
                    bgClass="bg-white"
                    iconBgClass="bg-green-100"
                />
                <MetricCard
                    title="Pending Amount"
                    value={`$${pendingAmount.toFixed(2)}`}
                    icon={AlertCircle}
                    colorClass="text-orange-600"
                    bgClass="bg-white"
                    iconBgClass="bg-orange-100"
                />
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                {/* TOOLBAR */}
                <div className="p-5 border-b border-slate-200 flex flex-col xl:flex-row justify-between xl:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-slate-900">Transactions</h3>
                        <div className="h-6 w-px bg-slate-200 mx-2"></div>
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1">
                            <DatePicker selected={startDate} onChange={setStartDate} placeholderText="Start Date" className="w-24 bg-transparent text-xs outline-none text-center" />
                            <span className="text-slate-400">-</span>
                            <DatePicker selected={endDate} onChange={setEndDate} placeholderText="End Date" className="w-24 bg-transparent text-xs outline-none text-center" />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#0055FE] w-48" />
                        </div>
                        <button onClick={handleExportCSV} className="h-8 px-3 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-lg flex items-center gap-2 transition-colors">
                            <Download size={14} /> Export
                        </button>
                        <button onClick={fetchPayments} className="h-8 w-8 flex items-center justify-center border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors">
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </div>

                {/* TABLE */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                            <tr>
                                <th className="px-5 py-3 w-10">
                                    <input type="checkbox" className="rounded border-slate-300 text-[#0055FE] focus:ring-[#0055FE]" checked={selectedPayments.size === filteredPayments.length && filteredPayments.length > 0} onChange={() => setSelectedPayments(selectedPayments.size === filteredPayments.length ? new Set() : new Set(filteredPayments.map(p => p.id)))} />
                                </th>
                                <th className="px-5 py-3">ID</th>
                                <th className="px-5 py-3">Table</th>
                                <th className="px-5 py-3">Provider</th>
                                <th className="px-5 py-3">Amount</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Date</th>
                                <th className="px-5 py-3 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredPayments.length > 0 ? filteredPayments.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-5 py-3">
                                        <input type="checkbox" className="rounded border-slate-300 text-[#0055FE] focus:ring-[#0055FE]" checked={selectedPayments.has(p.id)} onChange={() => { const s = new Set(selectedPayments); s.has(p.id) ? s.delete(p.id) : s.add(p.id); setSelectedPayments(s); }} />
                                    </td>
                                    <td className="px-5 py-3 text-sm font-medium text-slate-900">#{p.id}</td>
                                    <td className="px-5 py-3 text-xs text-slate-600">{p.table_name || "N/A"}</td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-700 capitalize">
                                            {p.provider === 'card' ? <CreditCard size={14} className="text-[#0055FE]" /> : p.provider === 'cash' ? <Banknote size={14} className="text-emerald-500" /> : <Smartphone size={14} className="text-purple-500" />}
                                            {p.provider.replace('_', ' ')}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-sm font-bold text-slate-900">${p.amount}</td>
                                    <td className="px-5 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getStatusColor(p.status)}`}>{p.status}</span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString()}</td>
                                    <td className="px-5 py-3 text-center">
                                        <button onClick={() => { setViewPayment(p); setIsViewOpen(true); }} className="text-[#0055FE] hover:bg-[#0055FE]/10 p-1.5 rounded transition-colors"><Eye size={16} /></button>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan={8} className="px-5 py-12 text-center text-xs text-slate-400">No transactions found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <PaymentDetailModal isOpen={isViewOpen} onClose={() => setIsViewOpen(false)} payment={viewPayment} />
        </div>
    );
};
