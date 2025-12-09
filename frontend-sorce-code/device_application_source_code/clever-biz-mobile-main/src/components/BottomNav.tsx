import { Home, Phone, MessageSquare, ShoppingCart, ClipboardList } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
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
        { id: "orders", icon: ClipboardList, label: "Orders", path: "/dashboard/orders" },
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
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-lg border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] pb-[env(safe-area-inset-bottom)] pt-2 px-2">
            <div className="flex justify-around items-center w-full">
                {tabs.map((tab) => {
                    const isActive = location.pathname === tab.path || (tab.id === "call" && false);
                    const Icon = tab.icon;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab)}
                            className="group relative flex flex-col items-center justify-center w-16 py-1"
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="nav-bubble"
                                    className="absolute inset-0 bg-blue-50 rounded-xl -z-10"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}

                            <div className="relative mb-0.5">
                                <Icon
                                    size={24}
                                    className={cn(
                                        "transition-colors duration-300",
                                        isActive ? "text-primary fill-primary/20" : "text-gray-400 group-hover:text-gray-600"
                                    )}
                                    strokeWidth={isActive ? 2.5 : 2}
                                />

                                {tab.id === "cart" && cart.length > 0 && (
                                    <motion.span
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm"
                                    >
                                        {cart.length}
                                    </motion.span>
                                )}
                            </div>

                            <span className={cn(
                                "text-[10px] font-medium transition-colors duration-300",
                                isActive ? "text-primary" : "text-gray-400 group-hover:text-gray-600"
                            )}>
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
