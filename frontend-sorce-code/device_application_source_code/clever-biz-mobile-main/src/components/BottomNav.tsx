import { Home, Phone, MessageSquare, ShoppingBag, ClipboardList } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { cn } from "clsx-for-tailwind";
import { useCart } from "../context/CartContext";
import { useWebSocket } from "./WebSocketContext";

const ROUTE_PRELOADERS: Record<string, () => Promise<unknown>> = {
    home: () => import("../pages/screen_home"),
    message: () => import("../pages/screen_message"),
    cart: () => import("../pages/screen_cart"),
    orders: () => import("../pages/order/screen_orders"),
};

const prefetchedRoutes = new Set<string>();

const prefetchRoute = (id: string) => {
    if (prefetchedRoutes.has(id)) return;
    const preloader = ROUTE_PRELOADERS[id];
    if (!preloader) return;
    prefetchedRoutes.add(id);
    preloader().catch(() => prefetchedRoutes.delete(id));
};

export const BottomNav = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { cart } = useCart();
    const { hasNewMessage, setNewMessageFlag } = useWebSocket();

    const tabs = [
        { id: "home", icon: Home, label: "Home", path: "/dashboard" },
        { id: "call", icon: Phone, label: "Call", path: "#call" }, // Special handler for call
        { id: "message", icon: MessageSquare, label: "Message", path: "/dashboard/message" },
        { id: "cart", icon: ShoppingBag, label: "Cart", path: "/dashboard/cart" },
        { id: "orders", icon: ClipboardList, label: "Orders", path: "/dashboard/orders" },
    ];

    const handleTabClick = (tab: typeof tabs[0]) => {
        if (tab.id === "call") {
            window.dispatchEvent(new CustomEvent("trigger-call-staff"));
            return;
        }
        if (tab.id === "message") {
            // Clear the notification badge when navigating to messages
            setNewMessageFlag(false);
        }
        navigate(tab.path);
    };

    return (
        <div className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 border-t border-white/10 bg-background/85 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),8px)] shadow-[0_-10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <div className="flex justify-around items-center w-full">
                {tabs.map((tab) => {
                    const isActive = location.pathname === tab.path || (tab.id === "call" && false);
                    const Icon = tab.icon;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab)}
                            onPointerDown={() => prefetchRoute(tab.id)}
                            onFocus={() => prefetchRoute(tab.id)}
                            className="group relative flex min-h-12 w-16 flex-col items-center justify-center rounded-xl px-3 py-1.5 active:scale-95 transition-transform"
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="nav-bubble"
                                    className="absolute inset-0 -z-10 rounded-2xl bg-primary/15"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}

                            <div className="relative mb-0.5">
                                <Icon
                                    size={20}
                                    className={cn(
                                        "transition-colors duration-300",
                                        isActive ? "text-primary" : "text-slate-400 group-hover:text-white"
                                    )}
                                    strokeWidth={isActive ? 2 : 1.8}
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

                                {tab.id === "message" && hasNewMessage && !isActive && (
                                    <motion.span
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute -top-1 -right-1 bg-red-500 w-2.5 h-2.5 rounded-full shadow-sm"
                                    />
                                )}
                            </div>

                            <span className={cn(
                                "text-[10px] font-medium transition-colors duration-300",
                                isActive ? "text-primary" : "text-slate-400 group-hover:text-white"
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
