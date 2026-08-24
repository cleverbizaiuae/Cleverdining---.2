/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '../../hooks/WebSocketProvider';
import { useQuery } from '@tanstack/react-query';
import {
    Search,
    Eye,
    RefreshCw,
    Download,
    X,
    CreditCard,
    Banknote,
    Smartphone,
    ShoppingBag,
} from 'lucide-react';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import toast from 'react-hot-toast';
import axiosInstance from '@/lib/axios';
import { getActiveRestaurantCurrency } from '@/lib/utils';
import { cachedGet } from '@/lib/requestCache';
import { OptimizedImage } from '@/components/OptimizedImage';
import { useBrandConfig, useBrandConfigMutation } from '@/lib/useBrandConfig';

// --- COMPONENTS ---

const PaymentTimingSwitch = ({
    checked,
    disabled,
    onChange,
}: {
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Require payment before order"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`ml-6 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${
            checked ? 'bg-primary' : 'bg-slate-200'
        }`}
    >
        <span
            className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                checked ? 'translate-x-5' : 'translate-x-0'
            }`}
        />
    </button>
);

// Types
interface Payment {
    id: number;
    order_id: number;
    order_status?: string;
    table_name: string;
    customer_name: string;
    amount: string;
    currency?: string;
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

const getEffectivePaymentStatus = (payment: Payment): Payment['status'] =>
    String(payment.order_status || '').toLowerCase() === 'cancelled'
        ? 'cancelled'
        : payment.status;

const getDateBoundaryParam = (date: Date, endOfDay = false) => {
    const boundary = new Date(date);
    boundary.setHours(
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0,
    );
    return boundary.toISOString();
};

const PaymentDetailModal = ({ isOpen, onClose, payment }: { isOpen: boolean; onClose: () => void; payment: PaymentWithOrder | null }) => {
    const currencyCode = payment?.currency || getActiveRestaurantCurrency();
    const orderId = payment?.order_id;
    const { data: orderDetails, isLoading: loadingOrder } = useQuery({
        queryKey: ["owner-order-detail", orderId],
        enabled: isOpen && !!orderId,
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const res = await cachedGet(`/owners/orders/${orderId}/`, {
                params: { includeItems: true },
            }, { ttlMs: 60_000 });
            return res.data;
        },
    });

    if (!isOpen || !payment) return null;

    const items = orderDetails?.order_items || [];

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-6 border-b border-slate-100">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Order #{payment.order_id}</h3>
                        <p className="text-sm text-slate-500">Payment Details</p>
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
                            ${getEffectivePaymentStatus(payment) === 'completed' ? 'bg-green-100 text-green-700' :
                                getEffectivePaymentStatus(payment) === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                    ['failed', 'cancelled'].includes(getEffectivePaymentStatus(payment)) ? 'bg-red-100 text-red-700' :
                                        'bg-slate-100 text-slate-600'}`}>
                            {getEffectivePaymentStatus(payment)}
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
                        <p className="text-sm font-bold text-slate-900">{currencyCode} {payment.amount}</p>
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
                                        {item.image ? (
                                            <OptimizedImage src={item.image} alt="" width={40} height={40} className="w-full h-full object-cover" />
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
                                    <p className="text-sm font-bold text-slate-700">{currencyCode} {item.price}</p>
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
    const currencyCode = getActiveRestaurantCurrency();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [selectedPayments, setSelectedPayments] = useState<Set<number>>(new Set());
    const [viewPayment, setViewPayment] = useState<PaymentWithOrder | null>(null);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [cancellingPaymentId, setCancellingPaymentId] = useState<number | null>(null);
    const { response } = useWebSocket();
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const brandConfig = useBrandConfig();
    const updateBrandConfig = useBrandConfigMutation();

    const fetchPayments = useCallback(async (showLoader = true) => {
        if (showLoader) setLoading(true);
        try {
            let url = '/owners/payments/';
            const params = new URLSearchParams();
            if (startDate) params.append('created_at__gte', getDateBoundaryParam(startDate));
            if (endDate) params.append('created_at__lte', getDateBoundaryParam(endDate, true));
            if (params.toString()) url += `?${params.toString()}`;
            const res = await cachedGet(url, {}, { ttlMs: 0, force: true });
            const data = res.data;
            if (data && Array.isArray(data.results)) {
                setPayments(data.results);
            } else if (Array.isArray(data)) {
                setPayments(data);
            } else {
                setPayments([]);
            }
        } catch (error) {
            console.error("Failed to fetch payments", error);
            setPayments([]);
        } finally {
            if (showLoader) setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => { fetchPayments(true); }, [fetchPayments]);

    // Real-time updates: Listen for payment-related WebSocket events
    useEffect(() => {
        if (response && (
            response.type === 'order_paid' ||
            response.type === 'cash_payment_alert' ||
            response.type === 'payment_status_change' ||
            response.type === 'payment:created' ||
            response.type === 'payment:updated' ||
            response.type === 'payment:cancelled' ||
            response.type === 'cash_payment_confirmed'
        )) {
            console.log('Payment event received, scheduling refresh:', response.type);

            if (debounceRef.current) clearTimeout(debounceRef.current);

            debounceRef.current = setTimeout(() => {
                fetchPayments(false);
            }, 2000);
        }
    }, [response, fetchPayments]);

    // GUARANTEED POLLING FALLBACK — 30s refresh
    useEffect(() => {
        const poll = setInterval(() => {
            if (document.visibilityState !== "visible") return;
            console.log("[PAYMENTS-POLL] Auto-refreshing payments...");
            fetchPayments(false);
        }, 30000);
        return () => clearInterval(poll);
    }, [fetchPayments]);

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

    const handleTogglePayBeforeOrder = (enabled: boolean) => {
        updateBrandConfig.mutate(
            { payBeforeOrder: enabled },
            {
                onError: (error) => {
                    console.error("Failed to update payment timing", error);
                    toast.error("Could not update payment settings");
                },
            },
        );
    };

    const toggleSelectedPayment = (paymentId: number) => {
        setSelectedPayments((current) => {
            const next = new Set(current);
            if (next.has(paymentId)) next.delete(paymentId);
            else next.add(paymentId);
            return next;
        });
    };

    const handleCancelPayment = async (payment: Payment) => {
        if (getEffectivePaymentStatus(payment) !== 'pending') return;
        if (!window.confirm(`Cancel the pending payment for order #${payment.order_id}?`)) return;

        setCancellingPaymentId(payment.id);
        try {
            await axiosInstance.post(`/owners/payments/${payment.id}/cancel/`, {
                reason: 'Cancelled from Payments',
            });
            setPayments((current) =>
                current.map((entry) =>
                    entry.id === payment.id ? { ...entry, status: 'cancelled' } : entry
                )
            );
            toast.success('Payment marked as cancelled');
            await fetchPayments(false);
        } catch (error: any) {
            console.error('Failed to cancel payment', error);
            toast.error(error?.response?.data?.error || 'Could not cancel payment');
        } finally {
            setCancellingPaymentId(null);
        }
    };

    const filteredPayments = payments.filter(p => {
        const matchesFilter = filter === 'all' || getEffectivePaymentStatus(p) === filter;
        const matchesSearch = p.order_id?.toString().includes(search) || p.table_name?.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const allVisibleSelected =
        filteredPayments.length > 0 && filteredPayments.every((payment) => selectedPayments.has(payment.id));

    const toggleAllVisiblePayments = () => {
        setSelectedPayments((current) => {
            const next = new Set(current);
            if (allVisibleSelected) {
                filteredPayments.forEach((payment) => next.delete(payment.id));
            } else {
                filteredPayments.forEach((payment) => next.add(payment.id));
            }
            return next;
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-50 text-green-700 border-green-100';
            case 'pending': return 'bg-yellow-50 text-yellow-700 border-yellow-100';
            case 'failed': return 'bg-red-50 text-red-700 border-red-100';
            case 'cancelled': return 'bg-red-50 text-red-700 border-red-100';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    return (
        <div className="font-inter">
            <div className="mb-6">
                <h1 className="text-xl font-semibold text-slate-900">Payments</h1>
                <p className="text-sm text-slate-500">Manage and track all transaction history</p>
            </div>

            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0055FE]/8">
                        <CreditCard className="h-4 w-4 text-[#0055FE]" strokeWidth={1.8} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-900">Payment Settings</p>
                        <p className="text-xs text-slate-500">Configure how and when customers pay</p>
                    </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 py-3">
                    <div>
                        <p className="text-sm font-medium text-slate-800">Require payment before order</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                            When on, customers must pay at the review screen before the kitchen receives the order.
                            When off, customers pay after eating via the Pay Now button.
                        </p>
                    </div>
                    <PaymentTimingSwitch
                        checked={brandConfig.payBeforeOrder}
                        disabled={updateBrandConfig.isPending}
                        onChange={handleTogglePayBeforeOrder}
                    />
                </div>
            </section>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {/* TOOLBAR */}
                <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                            <span>From:</span>
                            <DatePicker
                                selected={startDate}
                                onChange={setStartDate}
                                maxDate={endDate || undefined}
                                placeholderText="dd/mm/yyyy"
                                dateFormat="dd/MM/yyyy"
                                calendarStartDay={1}
                                showPopperArrow={false}
                                calendarClassName="cleverbiz-payment-calendar"
                                popperClassName="cleverbiz-payment-calendar-popper"
                                className="h-10 w-32 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10"
                                aria-label="Payment start date"
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                            <span>To:</span>
                            <DatePicker
                                selected={endDate}
                                onChange={setEndDate}
                                minDate={startDate || undefined}
                                placeholderText="dd/mm/yyyy"
                                dateFormat="dd/MM/yyyy"
                                calendarStartDay={1}
                                showPopperArrow={false}
                                calendarClassName="cleverbiz-payment-calendar"
                                popperClassName="cleverbiz-payment-calendar-popper"
                                className="h-10 w-32 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10"
                                aria-label="Payment end date"
                            />
                        </label>
                        <button onClick={() => fetchPayments(true)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#0055FE] text-[#0055FE] transition-colors hover:bg-[#0055FE]/5" aria-label="Refresh payments">
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button
                            onClick={handleExportCSV}
                            disabled={selectedPayments.size === 0}
                            className="flex h-10 items-center gap-2 rounded-lg bg-[#0055FE] px-4 text-sm font-medium text-white transition-colors hover:bg-[#0044CC] disabled:cursor-not-allowed disabled:bg-[#0055FE]/45"
                        >
                            <Download size={15} /> Export Selected ({selectedPayments.size})
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-[#0055FE]">
                            <option value="all">All statuses</option>
                            <option value="completed">Completed</option>
                            <option value="pending">Pending</option>
                            <option value="failed">Failed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="refunded">Refunded</option>
                        </select>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input type="text" placeholder="Search payments" value={search} onChange={e => setSearch(e.target.value)} className="h-10 w-48 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#0055FE]" />
                        </div>
                    </div>
                </div>

                {/* Mobile cards */}
                <div className="divide-y divide-slate-100 sm:hidden">
                    {filteredPayments.length > 0 ? filteredPayments.map(p => (
                        <div key={p.id} className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedPayments.has(p.id)}
                                        onChange={() => toggleSelectedPayment(p.id)}
                                        className="mt-0.5 h-4 w-4 accent-[#0055FE]"
                                        aria-label={`Select payment ${p.id}`}
                                    />
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">Order #{p.order_id}</p>
                                        <p className="text-xs text-slate-500">{p.table_name || "N/A"}</p>
                                    </div>
                                </div>
                                <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getStatusColor(getEffectivePaymentStatus(p))}`}>{getEffectivePaymentStatus(p)}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <p className="text-slate-400 uppercase tracking-wide">Provider</p>
                                    <div className="mt-1 flex items-center gap-2 font-medium text-slate-700 capitalize">
                                        {p.provider === 'card' ? <CreditCard size={14} className="text-[#0055FE]" /> : p.provider === 'cash' ? <Banknote size={14} className="text-emerald-500" /> : <Smartphone size={14} className="text-purple-500" />}
                                        {p.provider.replace('_', ' ')}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-slate-400 uppercase tracking-wide">Date</p>
                                    <p className="mt-1 font-medium text-slate-600">{new Date(p.created_at).toLocaleDateString()}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-3">
                                <p className="text-base font-bold text-slate-900">{p.currency || currencyCode} {p.amount}</p>
                                <div className="flex items-center gap-1">
                                    {getEffectivePaymentStatus(p) === 'pending' && (
                                        <button
                                            onClick={() => void handleCancelPayment(p)}
                                            disabled={cancellingPaymentId === p.id}
                                            className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                                        >
                                            {cancellingPaymentId === p.id ? 'Cancelling…' : 'Cancel'}
                                        </button>
                                    )}
                                    <button onClick={() => { setViewPayment(p); setIsViewOpen(true); }} className="text-[#0055FE] hover:bg-[#0055FE]/10 p-2 rounded-lg transition-colors" aria-label={`View payment ${p.id}`}>
                                        <Eye size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="px-5 py-12 text-center text-xs text-slate-400">No transactions found</div>
                    )}
                </div>

                {/* Desktop table */}
                <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                            <tr>
                                <th className="px-5 py-3">
                                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisiblePayments} className="h-4 w-4 accent-[#0055FE]" aria-label="Select all visible payments" />
                                </th>
                                <th className="px-5 py-3">ID</th>
                                <th className="px-5 py-3">Order</th>
                                <th className="px-5 py-3">Table</th>
                                <th className="px-5 py-3">Amount</th>
                                <th className="px-5 py-3">Provider</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Time</th>
                                <th className="px-5 py-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredPayments.length > 0 ? filteredPayments.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-5 py-3">
                                        <input type="checkbox" checked={selectedPayments.has(p.id)} onChange={() => toggleSelectedPayment(p.id)} className="h-4 w-4 accent-[#0055FE]" aria-label={`Select payment ${p.id}`} />
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500">#{String(p.id).slice(0, 8)}</td>
                                    <td className="px-5 py-3 text-sm font-medium text-slate-900">#{p.order_id}</td>
                                    <td className="px-5 py-3 text-xs text-slate-600">{p.table_name || "N/A"}</td>
                                    <td className="px-5 py-3 text-sm font-semibold text-slate-900">{p.currency || currencyCode} {p.amount}</td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-700 capitalize">
                                            {p.provider === 'card' ? <CreditCard size={14} className="text-[#0055FE]" /> : p.provider === 'cash' ? <Banknote size={14} className="text-emerald-500" /> : <Smartphone size={14} className="text-purple-500" />}
                                            {p.provider.replace('_', ' ')}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${getStatusColor(getEffectivePaymentStatus(p))}`}>{getEffectivePaymentStatus(p)}</span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500">{new Date(p.created_at).toLocaleString()}</td>
                                    <td className="px-5 py-3 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            {getEffectivePaymentStatus(p) === 'pending' && (
                                                <button
                                                    onClick={() => void handleCancelPayment(p)}
                                                    disabled={cancellingPaymentId === p.id}
                                                    className="rounded px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                                                >
                                                    {cancellingPaymentId === p.id ? 'Cancelling…' : 'Cancel'}
                                                </button>
                                            )}
                                            <button onClick={() => { setViewPayment(p); setIsViewOpen(true); }} className="text-[#0055FE] hover:bg-[#0055FE]/10 p-1.5 rounded transition-colors"><Eye size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan={9} className="px-5 py-12 text-center text-xs text-slate-400">No transactions found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <PaymentDetailModal isOpen={isViewOpen} onClose={() => setIsViewOpen(false)} payment={viewPayment} />
        </div>
    );
};
