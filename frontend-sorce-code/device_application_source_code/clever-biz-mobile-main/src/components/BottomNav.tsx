import { Home, Phone, MessageSquare, ShoppingCart, Receipt } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { motion } from "motion/react";
import { cn } from "clsx-for-tailwind";
import { useCart } from "../context/CartContext";

export const BottomNav = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { cart } = useCart();

    const tabs = [
        { id: "home", icon: Home, label: "Home", path: "/dashboard" },
        { id: "call", icon: Phone, label: "Call", path: "#call" }, // Special handler for call
        { id: "message", icon: MessageSquare, label: "Message", path: "/dashboard/message" },
        { id: "cart", icon: ShoppingCart, label: "Cart", path: "/dashboard/cart" },
        { id: "orders", icon: Receipt, label: "Orders", path: "/dashboard/orders" },
    ];

    const activeTab = tabs.find(tab => tab.path === location.pathname) || tabs[0];

    const handleTabClick = (tab: typeof tabs[0]) => {
        if (tab.id === "call") {
            // Dispatch custom event for call handler in layout
            window.dispatchEvent(new CustomEvent("trigger-call-staff"));
            return;
        }
        navigate(tab.path);
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 pb-6 z-40">
            <div className="flex justify-between items-center max-w-md mx-auto">
                {tabs.map((tab) => {
                    const isActive = location.pathname === tab.path || (tab.id === "call" && false); // Call is never "active" route
                    const Icon = tab.icon;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab)}
                            className="relative flex flex-col items-center justify-center w-12 h-12"
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="nav-bubble"
                                    className="absolute inset-0 bg-primary/10 rounded-2xl -z-10"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}

                            <div className="relative">
                                <Icon
                                    size={24}
                                    className={cn(
                                        "transition-colors duration-300",
                                        isActive ? "text-primary fill-primary/20" : "text-gray-400"
                                    )}
                                    strokeWidth={isActive ? 2.5 : 2}
                                />

                                {tab.id === "cart" && cart.length > 0 && (
                                    <motion.span
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white"
                                    >
                                        {cart.length}
                                    </motion.span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
