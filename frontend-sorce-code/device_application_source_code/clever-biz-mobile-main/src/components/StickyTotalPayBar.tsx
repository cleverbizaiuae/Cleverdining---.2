
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CreditCard, Banknote } from 'lucide-react';
import axiosInstance from '@/lib/axios';
import toast from 'react-hot-toast';

interface Order {
    id: number;
    total_price: string | number;
    payment_status?: string;
    status: string;
}

interface StickyTotalPayBarProps {
    orders: Order[];
    onPaymentSuccess?: () => void;
}

export const StickyTotalPayBar: React.FC<StickyTotalPayBarProps> = ({ orders, onPaymentSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [showMethodModal, setShowMethodModal] = useState(false);

    // Filter Unpaid Orders
    const unpaidOrders = useMemo(() => {
        return orders.filter(
            (o) =>
                ['pending', 'preparing', 'served'].includes(o.status) &&
                (!o.payment_status || ['unpaid', 'pending', 'failed'].includes(o.payment_status))
        );
    }, [orders]);

    const totalAmount = useMemo(() => {
        return unpaidOrders.reduce((sum, o) => sum + Number(o.total_price), 0);
    }, [unpaidOrders]);

    const handleBulkPay = async (provider: 'card' | 'cash') => {
        try {
            setLoading(true);
            const guestToken = localStorage.getItem("guest_session_token");

            const res = await axiosInstance.post(
                '/api/customer/create-bulk-checkout-session/',
                {
                    provider,
                    guest_session_token: guestToken
                },
                {
                    headers: {
                        "X-Guest-Session-Token": guestToken
                    }
                }
            );

            const { url, transaction_id } = res.data;

            if (url) {
                window.location.href = url;
            } else {
                toast.error("Failed to initiate payment");
            }

        } catch (error: any) {
            console.error(error);
            toast.error(error.response?.data?.error || "Payment Failed");
        } finally {
            setLoading(false);
            setShowMethodModal(false);
        }
    };

    if (totalAmount <= 0) return null;

    return (
        <>
            <div className="fixed bottom-24 left-4 right-4 z-50 max-w-2xl mx-auto">
                <motion.div
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-white p-4 shadow-xl rounded-2xl border border-gray-100"
                >
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-gray-600 text-sm">Total Orders: <span className="font-bold text-blue-600">{unpaidOrders.length}</span></span>
                        <span className="text-gray-600 text-sm">Total Cost: <span className="font-bold text-blue-600">AED {totalAmount.toFixed(2)}</span></span>
                    </div>

                    <button
                        onClick={() => setShowMethodModal(true)}
                        disabled={loading}
                        className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-between group disabled:opacity-70"
                    >
                        <span className="flex items-center gap-2">
                            {loading && <Loader2 className="animate-spin" size={20} />}
                            Pay All
                        </span>
                        <span className="bg-white/20 px-3 py-1 rounded-lg group-hover:bg-white/30 transition-colors text-sm">
                            AED {totalAmount.toFixed(2)}
                        </span>
                    </button>
                </motion.div>
            </div>

            {/* Payment Method Modal */}
            <AnimatePresence>
                {showMethodModal && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="bg-white w-full max-w-md rounded-2xl p-6 relative"
                        >
                            <button
                                onClick={() => setShowMethodModal(false)}
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>

                            <h3 className="text-xl font-bold mb-2 text-gray-900">Choose Payment Method</h3>
                            <p className="text-gray-500 mb-6">Total Amount: AED {totalAmount.toFixed(2)}</p>

                            <div className="space-y-3">
                                <button
                                    onClick={() => handleBulkPay('card')}
                                    disabled={loading}
                                    className="w-full flex items-center p-4 border rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all font-semibold gap-3"
                                >
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                                        <CreditCard size={20} />
                                    </div>
                                    <span>Pay by Card</span>
                                </button>

                                <button
                                    onClick={() => handleBulkPay('cash')}
                                    disabled={loading}
                                    className="w-full flex items-center p-4 border rounded-xl hover:bg-yellow-50 hover:border-yellow-200 transition-all font-semibold gap-3"
                                >
                                    <div className="w-10 h-10 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center">
                                        <Banknote size={20} />
                                    </div>
                                    <span>Pay by Cash</span>
                                </button>
                            </div>

                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};
