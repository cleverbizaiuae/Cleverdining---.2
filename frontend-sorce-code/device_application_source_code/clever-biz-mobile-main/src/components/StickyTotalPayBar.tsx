
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

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
    const navigate = useNavigate();

    // Filter Unpaid Orders
    const unpaidOrders = useMemo(() => {
        return orders.filter(
            (o) =>
                ['pending', 'preparing', 'served', 'completed', 'delivered'].includes(o.status) &&
                (!o.payment_status || ['unpaid', 'pending', 'failed'].includes(o.payment_status))
        );
    }, [orders]);

    const totalAmount = useMemo(() => {
        return unpaidOrders.reduce((sum, o) => sum + Number(o.total_price), 0);
    }, [unpaidOrders]);

    const handlePayAll = () => {
        // Store the first unpaid order ID for checkout page to use bulk checkout
        // The checkout will aggregate all unpaid orders via guest_session_token
        const firstUnpaidOrderId = unpaidOrders[0]?.id;

        if (firstUnpaidOrderId) {
            // Store in localStorage for CheckoutPage to pick up
            localStorage.setItem("pending_order_id", String(firstUnpaidOrderId));
            localStorage.setItem("bulk_checkout", "true"); // Flag to indicate bulk checkout

            navigate('/dashboard/checkout', {
                state: {
                    orderId: firstUnpaidOrderId,
                    isBulkCheckout: true,
                    totalAmount: totalAmount
                }
            });
        }
    };

    if (totalAmount <= 0) return null;

    return (
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
                    onClick={handlePayAll}
                    className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-between group"
                >
                    <span className="flex items-center gap-2">
                        Pay All
                    </span>
                    <span className="bg-white/20 px-3 py-1 rounded-lg group-hover:bg-white/30 transition-colors text-sm">
                        AED {totalAmount.toFixed(2)}
                    </span>
                </button>
            </motion.div>
        </div>
    );
};
