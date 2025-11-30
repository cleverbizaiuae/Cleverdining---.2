import { Order } from "./order-types";
import { cn } from "clsx-for-tailwind";
import { Check, ChefHat, Clock, Utensils, Receipt } from "lucide-react";
import { useState } from "react";
import { ReviewModal } from "./review-modal";

interface OrderCardProps {
    order: Order;
    onCheckout: (order: Order) => void;
}

export const OrderCard = ({ order, onCheckout }: OrderCardProps) => {
    const [isReviewOpen, setIsReviewOpen] = useState(false);

    // Normalize items
    const items = order.order_items || order.items || [];

    // Progress Tracker Logic
    const steps = [
        { id: "pending", label: "Pending", icon: Clock },
        { id: "preparing", label: "Preparing", icon: ChefHat },
        { id: "served", label: "Served", icon: Utensils },
    ];

    const getCurrentStepIndex = (status: string) => {
        const s = status.toLowerCase();
        if (s === "pending" || s === "new") return 0;
        if (s === "preparing" || s === "cooking") return 1;
        if (s === "served" || s === "completed" || s === "delivered") return 2;
        return 0;
    };

    const currentStepIndex = getCurrentStepIndex(order.status);

    return (
        <>
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden relative">
                {/* Decoration */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-10 -mt-10 opacity-50 pointer-events-none" />

                {/* A. Status Header */}
                <div className="p-5 pb-2">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg shadow-sm">
                                #{order.id}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Table {order.device_name || "05"}</h3>
                                <p className="text-xs text-gray-500">
                                    {new Date(order.created_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <span className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide",
                                // Mock logic for payment status
                                true ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
                            )}>
                                Unpaid
                            </span>
                            <span className="text-sm font-bold text-gray-900 bg-gray-50 px-2 py-0.5 rounded-lg">
                                AED {order.total_price}
                            </span>
                        </div>
                    </div>
                </div>

                {/* B. Items List */}
                <div className="px-5">
                    <div className="bg-gray-50/80 rounded-2xl p-4 space-y-3">
                        {items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-start text-sm">
                                <div className="flex gap-3">
                                    <div className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shadow-sm flex-shrink-0">
                                        {item.quantity}x
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-medium text-gray-800 leading-tight">{item.item_name}</span>
                                        {/* Mock notes if needed */}
                                        {/* <span className="text-[10px] text-gray-400 italic">No onions</span> */}
                                    </div>
                                </div>
                                <span className="font-semibold text-gray-900">
                                    {item.price}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* C. Progress Tracker */}
                <div className="p-5">
                    <div className="relative flex justify-between items-center">
                        {/* Progress Line Background */}
                        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -z-10 rounded-full" />

                        {/* Active Progress Line */}
                        <div
                            className="absolute top-1/2 left-0 h-1 bg-green-500 -z-10 rounded-full transition-all duration-500"
                            style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
                        />

                        {steps.map((step, idx) => {
                            const isCompleted = idx < currentStepIndex;
                            const isActive = idx === currentStepIndex;
                            const Icon = step.icon;

                            return (
                                <div key={step.id} className="flex flex-col items-center gap-2 bg-white px-2">
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 border-2",
                                        isActive
                                            ? "bg-green-500 border-green-500 text-white scale-110 shadow-md"
                                            : isCompleted
                                                ? "bg-white border-green-500 text-green-500"
                                                : "bg-white border-gray-200 text-gray-300"
                                    )}>
                                        {isCompleted ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
                                    </div>
                                    <span className={cn(
                                        "text-[10px] font-medium transition-colors",
                                        isActive || isCompleted ? "text-green-600" : "text-gray-400"
                                    )}>
                                        {step.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* D. Action Buttons */}
                <div className="p-5 pt-0 flex gap-3">
                    <button
                        onClick={() => setIsReviewOpen(true)}
                        className="flex-1 py-3 rounded-xl bg-blue-50 text-blue-600 font-semibold text-sm hover:bg-blue-100 transition-colors"
                    >
                        Review
                    </button>
                    <button
                        onClick={() => onCheckout(order)}
                        className="flex-[2] py-3 rounded-xl bg-green-600 text-white font-semibold text-sm shadow-md hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                        <Receipt size={16} />
                        Checkout
                    </button>
                </div>
            </div>

            <ReviewModal
                isOpen={isReviewOpen}
                close={() => setIsReviewOpen(false)}
                onSubmit={(rating, comment) => {
                    console.log("Review submitted:", { rating, comment, orderId: order.id });
                    // Implement actual submission logic here
                }}
            />
        </>
    );
};
