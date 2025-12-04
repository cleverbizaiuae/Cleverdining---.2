import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../hooks/WebSocketProvider';
import { Search, Filter, CheckCircle, XCircle, Clock, Eye, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from '../../lib/axios';

interface Payment {
    id: number;
    order_id: number;
    table_name: string;
    customer_name: string;
    amount: string;
    provider: string;
    status: 'completed' | 'pending' | 'failed' | 'cancelled' | 'initiated';
    created_at: string;
    updated_at: string;
}

export const Payments = () => {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const { response } = useWebSocket();

    useEffect(() => {
        fetchPayments();
    }, []);

    useEffect(() => {
        if (response && response.type) {
            const data = response;
            if (data.type === 'payment:created' || data.type === 'payment:updated' || data.type === 'payment:cash_confirmed') {
                // Ideally, we should update the list smartly. For now, refresh or prepend.
                // If it's an update, find and replace.
                if (data.payment) {
                    setPayments(prev => {
                        const index = prev.findIndex(p => p.id === data.payment.id);
                        if (index >= 0) {
                            const newPayments = [...prev];
                            newPayments[index] = data.payment;
                            return newPayments;
                        } else {
                            return [data.payment, ...prev];
                        }
                    });
                } else {
                    fetchPayments(); // Fallback
                }
            }
        }
    }, [response]);

    const fetchPayments = async () => {
        try {
            const res = await axios.get('/owners/payments/');
            if (Array.isArray(res.data)) {
                setPayments(res.data);
            } else {
                console.error("Payments API returned non-array data:", res.data);
                setPayments([]);
            }
        } catch (error) {
            console.error("Failed to fetch payments", error);
            setPayments([]);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmCash = async (id: number) => {
        try {
            await axios.post(`/owners/payments/${id}/confirm_cash/`);
            // Optimistic update or wait for socket
        } catch (error) {
            console.error("Failed to confirm cash", error);
        }
    };

    const handleCancel = async (id: number) => {
        if (!window.confirm("Are you sure you want to cancel this payment?")) return;
        try {
            await axios.post(`/owners/payments/${id}/cancel/`);
        } catch (error) {
            console.error("Failed to cancel payment", error);
        }
    };

    const filteredPayments = payments.filter(p => {
        const matchesFilter = filter === 'all' || p.status === filter;
        const matchesSearch =
            p.order_id.toString().includes(search) ||
            p.table_name.toLowerCase().includes(search.toLowerCase()) ||
            p.customer_name.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-500/10 text-green-500 border-green-500/20';
            case 'pending': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            case 'failed': return 'bg-red-500/10 text-red-500 border-red-500/20';
            case 'cancelled': return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
            default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Payments</h1>
                    <p className="text-gray-400">Monitor and manage real-time transactions</p>
                </div>

                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search order, table..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 w-64"
                        />
                    </div>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    >
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                    </select>
                    <button onClick={fetchPayments} className="p-2 bg-gray-800 border border-gray-700 rounded-lg text-white hover:bg-gray-700">
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-800/50 text-gray-300 uppercase font-medium">
                            <tr>
                                <th className="px-6 py-4">ID</th>
                                <th className="px-6 py-4">Order</th>
                                <th className="px-6 py-4">Table</th>
                                <th className="px-6 py-4">Amount</th>
                                <th className="px-6 py-4">Provider</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Time</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {loading ? (
                                <tr><td colSpan={8} className="px-6 py-8 text-center">Loading...</td></tr>
                            ) : filteredPayments.length === 0 ? (
                                <tr><td colSpan={8} className="px-6 py-8 text-center">No payments found</td></tr>
                            ) : (
                                filteredPayments.map((payment) => (
                                    <tr key={payment.id} className="hover:bg-gray-800/30 transition-colors">
                                        <td className="px-6 py-4 font-medium text-white">#{payment.id}</td>
                                        <td className="px-6 py-4">#{payment.order_id}</td>
                                        <td className="px-6 py-4">{payment.table_name}</td>
                                        <td className="px-6 py-4 font-bold text-white">AED {payment.amount}</td>
                                        <td className="px-6 py-4 capitalize">{payment.provider}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(payment.status)}`}>
                                                {payment.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {new Date(payment.updated_at).toLocaleTimeString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {payment.provider === 'cash' && payment.status === 'pending' && (
                                                    <button
                                                        onClick={() => handleConfirmCash(payment.id)}
                                                        className="p-1.5 bg-green-500/10 text-green-500 rounded hover:bg-green-500/20"
                                                        title="Confirm Cash"
                                                    >
                                                        <CheckCircle size={18} />
                                                    </button>
                                                )}
                                                {(payment.status === 'pending' || payment.status === 'initiated') && (
                                                    <button
                                                        onClick={() => handleCancel(payment.id)}
                                                        className="p-1.5 bg-red-500/10 text-red-500 rounded hover:bg-red-500/20"
                                                        title="Cancel Payment"
                                                    >
                                                        <XCircle size={18} />
                                                    </button>
                                                )}
                                                <button className="p-1.5 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
                                                    <Eye size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
