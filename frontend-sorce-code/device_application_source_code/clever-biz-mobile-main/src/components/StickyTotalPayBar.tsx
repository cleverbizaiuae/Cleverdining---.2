
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getSessionCurrencyCode } from '../utils/regionSession';

interface Order {
    id: number;
    total_price: string | number;
    amount_paid?: string | number;
    amountPaid?: string | number;
    remaining_amount?: string | number;
    remainingAmount?: string | number;
    payment_status?: string;
    status: string;
}

interface StickyTotalPayBarProps {
    orders: Order[];
    onPaymentSuccess?: () => void;
}

const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(/[^0-9.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const getRemainingAmount = (order: Order): number => {
    const explicitRemaining = order.remaining_amount ?? order.remainingAmount;
    if (explicitRemaining !== undefined) return Math.max(0, toNumber(explicitRemaining));
    const total = toNumber(order.total_price);
    const paid = toNumber(order.amount_paid ?? order.amountPaid);
    return Math.max(0, total - paid);
};

export const StickyTotalPayBar: React.FC<StickyTotalPayBarProps> = ({ orders }) => {
    const navigate = useNavigate();
    const currencyCode = getSessionCurrencyCode();

    // Filter Unpaid Orders (include awaiting_cash)
    const unpaidOrders = useMemo(() => {
        return orders.filter(
            (o) =>
                ['pending', 'preparing', 'served', 'completed', 'delivered', 'awaiting_cash'].includes(o.status.toLowerCase()) &&
                (!o.payment_status || ['unpaid', 'pending', 'failed', 'pending_cash', 'partially_paid'].includes(o.payment_status.toLowerCase()))
        );
    }, [orders]);

    // Check if ALL unpaid orders are awaiting cash (already requested)
    const allAwaitingCash = useMemo(() => {
        return unpaidOrders.length > 0 && unpaidOrders.every(
            (o) => o.status === 'awaiting_cash' || o.payment_status === 'pending_cash'
        );
    }, [unpaidOrders]);

    const totalAmount = useMemo(() => {
        return unpaidOrders.reduce((sum, o) => sum + getRemainingAmount(o), 0);
    }, [unpaidOrders]);

    const handlePayAll = () => {
        const firstUnpaidOrderId = unpaidOrders[0]?.id;

        if (firstUnpaidOrderId) {
            localStorage.setItem("pending_order_id", String(firstUnpaidOrderId));
            localStorage.setItem("bulk_checkout", "true");

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
        <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[398px] -translate-x-1/2">
            <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-card/95 p-4 shadow-xl shadow-black/30 rounded-2xl border border-border backdrop-blur-lg"
            >
                <div className="flex justify-between items-center mb-4">
                    <span className="text-muted-foreground text-sm">Total Orders: <span className="font-bold text-primary">{unpaidOrders.length}</span></span>
                    <span className="text-muted-foreground text-sm">Total Cost: <span className="font-bold text-primary">{currencyCode} {totalAmount.toFixed(2)}</span></span>
                </div>

                {allAwaitingCash ? (
                    /* Cash already requested — show status instead of Pay button */
                    <div className="w-full bg-yellow-50 border border-yellow-200 text-yellow-800 font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2">
                        <span className="animate-pulse">💵</span>
                        <span>Cash Requested — Staff Coming</span>
                    </div>
                ) : (
                    <button
                        onClick={handlePayAll}
                        className="w-full bg-primary text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-between group"
                    >
                        <span className="flex items-center gap-2">
                            Pay All
                        </span>
                        <span className="bg-white/20 px-3 py-1 rounded-lg group-hover:bg-white/30 transition-colors text-sm">
                            {currencyCode} {totalAmount.toFixed(2)}
                        </span>
                    </button>
                )}
            </motion.div>
        </div>
    );
};
