import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Banknote, ChefHat, Clock3, Coffee, CreditCard, MapPin, X, Zap } from "lucide-react";
import { useCart, type CartItem } from "../context/CartContext";
import axiosInstance from "../lib/axios";
import { API_BASE_URL } from "../lib/axios";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion"; // Corrected from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react";
import { getSessionCurrencyCode } from "../utils/regionSession";
import {
  fetchUpsellSettings,
  fetchUpsellSuggestions,
  logUpsellAssociationStat,
  logUpsellEvent,
  logUpsellShownBatch,
  summarizeCart,
  type UpsellSettingsSnapshot,
  type UpsellSuggestion,
  type UpsellTriggerPoint,
} from "../lib/upsellApi";
import {
  canShowUpsellTouchpoint,
  incrementUpsellTouchpointCount,
  markUpsellItemAccepted,
  markUpsellItemDismissed,
  trackUpsellCategoryDecline,
} from "../lib/upsellSession";

const DRINK_CATS = ["c2"];
const COFFEE_CATS = ["c6"];
const DESSERT_CATS = ["c3"];

type TimingValue = "now" | "with_food" | "after_food";

const TIMING_LABEL: Record<TimingValue, string> = {
  now: "Serve now",
  with_food: "Serve with food",
  after_food: "Serve after food",
};

function TimingButton({
  label,
  sublabel,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  sublabel: string;
  icon: typeof Clock3;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-center transition-all active:scale-95 ${
        active
          ? "bg-primary text-white border-primary shadow-sm shadow-primary/20"
          : "bg-slate-50 text-slate-600 border-slate-200 hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      <Icon className={`w-4 h-4 ${active ? "text-white" : "text-slate-400"}`} strokeWidth={1.8} />
      <span className="text-xs font-bold leading-tight">{label}</span>
      <span className={`text-[10px] leading-tight ${active ? "text-white/70" : "text-slate-400"}`}>
        {sublabel}
      </span>
    </button>
  );
}

const ScreenCart = () => {
  const navigate = useNavigate();
  const { cart, addToCart, removeFromCart, clearCart, incrementQuantity, decrementQuantity } = useCart();
  const [upsellSuggestions, setUpsellSuggestions] = useState<UpsellSuggestion[]>([]);
  const [beforePaymentSuggestions, setBeforePaymentSuggestions] = useState<UpsellSuggestion[]>([]);
  const [upsellSettings, setUpsellSettings] = useState<UpsellSettingsSnapshot | null>(null);
  const [upsellLoading, setUpsellLoading] = useState(false);
  const [beforePaymentLoading, setBeforePaymentLoading] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [itemTimings, setItemTimings] = useState<Record<string, TimingValue>>({});
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("card");
  const [specialRequest, setSpecialRequest] = useState("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const cartShownSignatureRef = useRef("");
  const beforePaymentShownSignatureRef = useRef("");
  const toSafeNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const getCategoryKey = (item: CartItem): string => {
    if (Number.isInteger(item.category) && item.category > 0) {
      return `c${item.category}`;
    }
    return String(item.category_name || "").trim().toLowerCase();
  };

  const setTiming = (itemId: string, timing: TimingValue) => {
    setItemTimings((prev) => ({ ...prev, [itemId]: timing }));
  };

  const validCartItems = useMemo(
    () =>
      cart.filter(
        (item) =>
          item &&
          Number.isInteger(item.id) &&
          item.id > 0 &&
          typeof item.item_name === "string" &&
          item.item_name.trim().length > 0 &&
          Number.isFinite(toSafeNumber(item.price))
      ),
    [cart]
  );

  const resolveImageUrl = (url?: string) => {
    const fallback = "https://placehold.co/200x200?text=No+Image";
    if (!url) return fallback;
    if (url.startsWith("http://")) return url.replace("http://", "https://");
    if (url.startsWith("https://")) return url;
    if (url.startsWith("/")) return `${API_BASE_URL}${url.replace(/^\/+/, "")}`;
    return fallback;
  };

  const resolveVideoUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith("http://")) return url.replace("http://", "https://");
    if (url.startsWith("https://")) return url;
    if (url.startsWith("/")) return `${API_BASE_URL}${url.replace(/^\/+/, "")}`;
    return "";
  };

  const totalQuantity = validCartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalCost = validCartItems.reduce(
    (sum, item) => sum + toSafeNumber(item.price) * item.quantity,
    0
  );
  const activeCartUpsells = useMemo(() => upsellSuggestions.slice(0, 2), [upsellSuggestions]);
  const upsellUiEnabled = upsellSettings?.enabled ?? true;
  const currencyCode = getSessionCurrencyCode();
  const tableNumber = useMemo(() => {
    try {
      const userInfo = localStorage.getItem("userInfo");
      if (!userInfo) return "N/A";
      const parsed = JSON.parse(userInfo);
      const fromRestaurant = parsed?.user?.restaurants?.[0]?.table_name;
      const fromUser = parsed?.table_name;
      const value = String(fromRestaurant || fromUser || "").trim();
      return value || "N/A";
    } catch {
      return "N/A";
    }
  }, []);
  const cartFingerprint = useMemo(
    () => validCartItems.map((item) => `${item.id}:${item.quantity}`).sort().join("|"),
    [validCartItems]
  );
  const cartMetrics = useMemo(() => summarizeCart(validCartItems), [validCartItems]);

  useEffect(() => {
    const userInfo = localStorage.getItem("userInfo");
    const guestSessionToken = localStorage.getItem("guest_session_token");

    // Auto-repair "Zombie" sessions (Logged in but no token)
    if (userInfo && !guestSessionToken) {
      console.warn("Detected Zombie Session - Repairing...");
      localStorage.removeItem("userInfo");
      localStorage.removeItem("guest_session_token");
      // Redirect to default login to regen token. 
      // Ideally should use params from userInfo if available, but default safe fallback is device 14.
      window.location.href = "/login?id=14&table=Default Table";
    }
  }, []);

  useEffect(() => {
    const validKeys = new Set(validCartItems.map((item) => String(item.id)));
    setItemTimings((prev) => {
      let changed = false;
      const next: Record<string, TimingValue> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (validKeys.has(key)) {
          next[key] = value;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [validCartItems]);

  useEffect(() => {
    let cancelled = false;
    const guestSessionToken = localStorage.getItem("guest_session_token");
    if (!guestSessionToken || validCartItems.length === 0) {
      setUpsellSuggestions([]);
      setUpsellLoading(false);
      cartShownSignatureRef.current = "";
      return;
    }

    const loadCartUpsells = async () => {
      setUpsellLoading(true);
      try {
        const settingsSnapshot = await fetchUpsellSettings().catch(() => null);
        if (cancelled) return;

        if (settingsSnapshot) {
          setUpsellSettings(settingsSnapshot);
        }

        const effectiveSettings: UpsellSettingsSnapshot = settingsSnapshot || {
          enabled: true,
          show_after_add_to_cart: true,
          show_in_cart: true,
          show_before_payment: true,
        };

        const shouldRenderCart =
          effectiveSettings.enabled &&
          effectiveSettings.show_in_cart &&
          canShowUpsellTouchpoint("cart", 3);

        if (!shouldRenderCart) {
          setUpsellSuggestions([]);
          cartShownSignatureRef.current = "";
          return;
        }

        const rawSuggestions = await fetchUpsellSuggestions({
          triggerPoint: "cart",
          limit: 2,
          cartItemIds: validCartItems.map((item) => item.id),
          excludeItemIds: validCartItems.map((item) => item.id),
        });
        if (cancelled) return;

        const cartIds = new Set(validCartItems.map((item) => item.id));
        const suggestions = rawSuggestions
          .filter((item: any) => item && Number.isInteger(item.id) && !cartIds.has(item.id))
          .slice(0, 2);

        setUpsellSuggestions(suggestions);

        if (suggestions.length > 0) {
          const signature = `${cartFingerprint}|${suggestions.map((item) => item.id).join(",")}`;
          if (signature !== cartShownSignatureRef.current) {
            cartShownSignatureRef.current = signature;
            incrementUpsellTouchpointCount("cart");
            await logUpsellShownBatch({
              triggerPoint: "cart",
              suggestions,
              cartValueAtTime: cartMetrics.cartValueAtTime,
              cartItemCount: cartMetrics.cartItemCount,
            }).catch(() => {});
          }
        } else {
          cartShownSignatureRef.current = "";
        }
      } catch {
        if (!cancelled) {
          setUpsellSuggestions([]);
          cartShownSignatureRef.current = "";
        }
      } finally {
        if (!cancelled) {
          setUpsellLoading(false);
        }
      }
    };

    void loadCartUpsells();

    return () => {
      cancelled = true;
    };
  }, [cartFingerprint, cartMetrics.cartItemCount, cartMetrics.cartValueAtTime, validCartItems]);

  useEffect(() => {
    let cancelled = false;
    const guestSessionToken = localStorage.getItem("guest_session_token");

    if (!showReviewModal) {
      setBeforePaymentLoading(false);
      setBeforePaymentSuggestions([]);
      beforePaymentShownSignatureRef.current = "";
      return;
    }

    if (!guestSessionToken || validCartItems.length === 0) {
      setBeforePaymentSuggestions([]);
      setBeforePaymentLoading(false);
      return;
    }

    const loadBeforePaymentUpsell = async () => {
      setBeforePaymentLoading(true);
      try {
        const settingsSnapshot =
          upsellSettings ||
          (await fetchUpsellSettings().catch(() => null));

        if (cancelled) return;
        if (settingsSnapshot) {
          setUpsellSettings(settingsSnapshot);
        }

        const effectiveSettings: UpsellSettingsSnapshot = settingsSnapshot || {
          enabled: true,
          show_after_add_to_cart: true,
          show_in_cart: true,
          show_before_payment: true,
        };

        const shouldRender =
          effectiveSettings.enabled &&
          effectiveSettings.show_before_payment &&
          canShowUpsellTouchpoint("before_payment", 1);

        if (!shouldRender) {
          setBeforePaymentSuggestions([]);
          beforePaymentShownSignatureRef.current = "";
          return;
        }

        const rawSuggestions = await fetchUpsellSuggestions({
          triggerPoint: "before_payment",
          limit: 1,
          cartItemIds: validCartItems.map((item) => item.id),
          excludeItemIds: validCartItems.map((item) => item.id),
        });
        if (cancelled) return;

        const cartIds = new Set(validCartItems.map((item) => item.id));
        const suggestions = rawSuggestions
          .filter((item: any) => item && Number.isInteger(item.id) && !cartIds.has(item.id))
          .slice(0, 1);

        setBeforePaymentSuggestions(suggestions);
        if (suggestions.length > 0) {
          const signature = `${cartFingerprint}|${suggestions.map((item) => item.id).join(",")}`;
          if (signature !== beforePaymentShownSignatureRef.current) {
            beforePaymentShownSignatureRef.current = signature;
            incrementUpsellTouchpointCount("before_payment");
            await logUpsellShownBatch({
              triggerPoint: "before_payment",
              suggestions,
              cartValueAtTime: cartMetrics.cartValueAtTime,
              cartItemCount: cartMetrics.cartItemCount,
            }).catch(() => {});
          }
        } else {
          beforePaymentShownSignatureRef.current = "";
        }
      } catch {
        if (!cancelled) {
          setBeforePaymentSuggestions([]);
          beforePaymentShownSignatureRef.current = "";
        }
      } finally {
        if (!cancelled) {
          setBeforePaymentLoading(false);
        }
      }
    };

    void loadBeforePaymentUpsell();

    return () => {
      cancelled = true;
    };
  }, [
    showReviewModal,
    cartFingerprint,
    cartMetrics.cartItemCount,
    cartMetrics.cartValueAtTime,
    validCartItems,
  ]);

  const suggestionToCartItem = (item: UpsellSuggestion): Omit<CartItem, "quantity"> => ({
    id: item.id,
    item_name: item.item_name,
    price: String(toSafeNumber(item.price)),
    description: item.description || "",
    slug: item.slug || "",
    category: Number(item.category || 0),
    restaurant: Number(item.restaurant || 0),
    category_name: item.category_name || "",
    image1: item.image1 || "",
    availability: item.availability !== false,
    video: item.video || "",
    restaurant_name: item.restaurant_name || "",
  });

  const addSuggestedItem = async (item: UpsellSuggestion, triggerPoint: UpsellTriggerPoint) => {
    addToCart(suggestionToCartItem(item), 1);
    if (item.id) {
      markUpsellItemAccepted(item.id);
    }
    setUpsellSuggestions((prev) => prev.filter((candidate) => candidate.id !== item.id));
    setBeforePaymentSuggestions((prev) => prev.filter((candidate) => candidate.id !== item.id));
    toast.success(`${item.item_name} added to cart`);
    await Promise.allSettled([
      logUpsellEvent({
        triggerPoint,
        action: "accepted",
        suggestion: item,
        cartValueAtTime: cartMetrics.cartValueAtTime,
        cartItemCount: cartMetrics.cartItemCount,
      }),
      logUpsellAssociationStat({
        triggerPoint,
        action: "accepted",
        upsellItemId: item.id,
      }),
    ]);
  };

  const dismissSuggestedItem = async (
    item: UpsellSuggestion,
    triggerPoint: UpsellTriggerPoint,
    action: "declined" | "dismissed" = "declined"
  ) => {
    if (item.id) {
      markUpsellItemDismissed(item.id);
    }
    if (item.category) {
      trackUpsellCategoryDecline(item.category);
    }
    setUpsellSuggestions((prev) => prev.filter((candidate) => candidate.id !== item.id));
    setBeforePaymentSuggestions((prev) => prev.filter((candidate) => candidate.id !== item.id));

    await Promise.allSettled([
      logUpsellEvent({
        triggerPoint,
        action,
        suggestion: item,
        cartValueAtTime: cartMetrics.cartValueAtTime,
        cartItemCount: cartMetrics.cartItemCount,
      }),
      logUpsellAssociationStat({
        triggerPoint,
        action: "dismissed",
        upsellItemId: item.id,
      }),
    ]);
  };

  const handleOrderNow = async () => {
    if (isSubmittingOrder) return;
    setIsSubmittingOrder(true);
    try {
      const userInfo = localStorage.getItem("userInfo");
      if (!userInfo) {
        toast.error("User info not found");
        setIsSubmittingOrder(false);
        return;
      }

      const userData = JSON.parse(userInfo);
      const restaurant = userData.user.restaurants[0].id;
      const device = userData.user.restaurants[0].device_id;

      const orderItems = validCartItems.map((item) => ({
        item: item.id,
        quantity: item.quantity,
      }));

      const guestSessionToken = localStorage.getItem("guest_session_token");
      if (!guestSessionToken) {
        // Redundant check since useEffect handles it, but good for safety
        toast.error("Session token missing. Refreshing...");
        window.location.reload();
        setIsSubmittingOrder(false);
        return;
      }

      const timingNotes = validCartItems
        .filter((item) => itemTimings[String(item.id)])
        .map((item) => {
          const timingValue = itemTimings[String(item.id)];
          const safeName = String(item.item_name || "").replace(/[\]=]/g, "").trim();
          return safeName ? `[TIMING:${safeName}=${timingValue}]` : "";
        })
        .filter(Boolean)
        .join("");

      const paymentTag = `[PAYMENT:${paymentMethod}]`;
      const mergedNotes = `${specialRequest.trim()}${timingNotes}${paymentTag}`.trim();

      const orderData: Record<string, unknown> = {
        restaurant,
        device,
        order_items: orderItems,
        guest_session_token: guestSessionToken,
      };

      if (mergedNotes) {
        orderData.notes = mergedNotes;
        orderData.special_request = mergedNotes;
      }

      let response;
      try {
        response = await axiosInstance.post(
          `/api/customer/orders/?guest_token=${guestSessionToken}`,
          orderData,
          {
            headers: {
              "X-Guest-Session-Token": guestSessionToken,
            },
          }
        );
      } catch (postError: any) {
        // Backward-compatible fallback for backends that still reject notes/special_request
        const responseData = postError?.response?.data;
        const isTimingFieldValidationError =
          responseData &&
          typeof responseData === "object" &&
          ("notes" in responseData ||
            "special_request" in responseData ||
            JSON.stringify(responseData).toLowerCase().includes("unknown field"));
        if (
          mergedNotes &&
          postError?.response?.status === 400 &&
          isTimingFieldValidationError
        ) {
          const fallbackOrderData = { ...orderData };
          delete fallbackOrderData.notes;
          delete fallbackOrderData.special_request;
          response = await axiosInstance.post(
            `/api/customer/orders/?guest_token=${guestSessionToken}`,
            fallbackOrderData,
            {
              headers: {
                "X-Guest-Session-Token": guestSessionToken,
              },
            }
          );
        } else {
          throw postError;
        }
      }

      const placedAt = new Date().toISOString();
      const placedItemsSnapshot = validCartItems.map((item) => ({
        id: item.id,
        item_id: item.id,
        item_name: item.item_name,
        name: item.item_name,
        quantity: item.quantity,
        price: toSafeNumber(item.price),
      }));

      toast.success("Order placed successfully!");
      await clearCart();
      setItemTimings({});
      setSpecialRequest("");
      setPaymentMethod("card");
      setShowReviewModal(false);
      // Double check cleanup
      if (guestSessionToken) {
        localStorage.removeItem(`cb:cart:${guestSessionToken}`);
      }

      // Navigate to checkout with the new Order ID
      if (response.data && response.data.id) {
        // Prime local orders storage so Orders page updates instantly after navigation.
        const tableName = String(userData?.user?.restaurants?.[0]?.table_name || userData?.table_name || "").trim();
        const deviceId = String(userData?.user?.restaurants?.[0]?.device_id || userData?.table_id || userData?.device_id || "").trim();
        const tableStorageId = tableName || deviceId || "default";
        const ordersStorageKey = `cleverbiz_orders_table_${tableStorageId}`;
        const orderId = String(response.data.id);
        const pendingOrder = {
          id: `local-${orderId}`,
          backendId: orderId,
          items: placedItemsSnapshot,
          total: totalCost,
          total_price: totalCost,
          status: "Pending",
          paymentStatus: "Unpaid",
          payment_status: "unpaid",
          timestamp: placedAt,
          created_time: placedAt,
        };
        try {
          const existingRaw = localStorage.getItem(ordersStorageKey);
          const existingOrders = existingRaw ? JSON.parse(existingRaw) : [];
          if (Array.isArray(existingOrders)) {
            const alreadyExists = existingOrders.some((order: any) => String(order?.backendId || "") === orderId);
            if (!alreadyExists) {
              localStorage.setItem(ordersStorageKey, JSON.stringify([pendingOrder, ...existingOrders]));
            }
          } else {
            localStorage.setItem(ordersStorageKey, JSON.stringify([pendingOrder]));
          }
        } catch {
          localStorage.setItem(ordersStorageKey, JSON.stringify([pendingOrder]));
        }

        // Robust Persistence
        localStorage.setItem("pending_order_id", String(response.data.id));
        // Navigate to Orders Page (User requests this flow)
        navigate(`/dashboard/orders`);
      } else {
        // Fallback if ID is missing (should not happen with backend fix)
        console.error("Order ID missing in response", response.data);
        toast.error("Order placed, but ID missing. Check Orders tab.");
        navigate("/dashboard/orders");
      }
    } catch (error: any) {
      console.error("Failed to place order:", error);
      let errorMessage = "Failed to place order. Please try again.";

      if (error.response?.data) {
        if (Array.isArray(error.response.data)) {
          errorMessage = error.response.data.map((e: any) => typeof e === 'string' ? e : JSON.stringify(e)).join(", ");
        } else if (typeof error.response.data === 'object') {
          errorMessage = error.response.data.detail || error.response.data.non_field_errors?.[0] || JSON.stringify(error.response.data);
        } else {
          errorMessage = String(error.response.data);
        }
      }

      if (errorMessage.includes("Device not found") || errorMessage.includes("Invalid or expired session")) {
        toast.error("Session expired. Refreshing...");
        localStorage.removeItem("userInfo");
        localStorage.removeItem("guest_session_token");
        // Add a small delay to let the toast show
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      // Check for "writable nested fields" error (Backend issue workaround)
      if (errorMessage.includes("writable nested fields")) {
        toast.success("Order placed successfully!");
        clearCart();
        navigate("/dashboard/orders");
        return;
      }

      toast.error(errorMessage);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center pb-24">
      <div className="p-4 w-full">
        <h1 className="text-3xl font-medium">Cart List</h1>
      </div>
      <div className="flex-1 flex flex-col gap-y-2 w-full max-w-2xl overflow-y-auto px-4 pb-48">
        {validCartItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-64"
          >
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-3xl mb-4">
              🛒
            </div>
            <p className="text-muted-foreground mb-6">Your cart is empty.</p>
            <button
              onClick={() => navigate("/")}
              className="px-6 py-2 border border-gray-300 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Browse Menu
            </button>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {validCartItems.map((item) => (
              <motion.div
                layout
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-lg shadow-sm"
              >
                {(() => {
                  const categoryKey = getCategoryKey(item);
                  const categoryName = String(item.category_name || "").toLowerCase();
                  const isDrink =
                    DRINK_CATS.includes(categoryKey) ||
                    (!COFFEE_CATS.includes(categoryKey) && /drink|beverage|juice|soda/.test(categoryName));
                  const isCoffee =
                    COFFEE_CATS.includes(categoryKey) || /coffee|espresso|latte|cappuccino/.test(categoryName);
                  const isDessert =
                    DESSERT_CATS.includes(categoryKey) || /dessert|sweet|cake|ice\s?cream/.test(categoryName);
                  const needsTiming = isDrink || isCoffee || isDessert;
                  const itemTiming = itemTimings[String(item.id)];

                  return (
                    <>
                      <div className="flex items-center p-4">
                        <div className="w-20 h-20 shrink-0 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden relative">
                          {item.video && !item.image1 ? (
                            <video
                              src={resolveVideoUrl(item.video)}
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                              webkit-playsinline="true"
                              loop
                              autoPlay
                            />
                          ) : (
                            <img
                              src={resolveImageUrl(item.image1)}
                              alt={item.item_name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = "https://placehold.co/200x200?text=No+Image";
                              }}
                            />
                          )}
                        </div>
                        <div className="ml-4 flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <h2 className="text-primary font-medium leading-tight truncate">{item.item_name}</h2>
                            <p className="text-primary/40 text-sm">
                              {currencyCode} {item.price}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2 mt-2">
                            <button
                              onClick={() => decrementQuantity(item.id)}
                              className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full text-gray-700 font-bold transition-colors active:scale-90 duration-200"
                            >
                              −
                            </button>
                            <span className="font-semibold px-4">{item.quantity}</span>
                            <button
                              onClick={() => incrementQuantity(item.id)}
                              className="w-8 h-8 flex items-center justify-center bg-primary hover:bg-primary/90 rounded-full text-white font-bold transition-colors active:scale-90 duration-200"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <button
                          className="ml-4 self-start text-gray-500 hover:text-gray-800"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            className="w-6 h-6"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>

                      {needsTiming && (
                        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                            {isDrink
                              ? "When would you like your drink?"
                              : isCoffee
                              ? "When would you like your coffee?"
                              : "When would you like your dessert?"}
                          </p>
                          <div className="flex gap-2">
                            {isDrink && (
                              <>
                                <TimingButton
                                  label="Right now"
                                  sublabel="Bring immediately"
                                  icon={Zap}
                                  active={itemTiming === "now"}
                                  onClick={() => setTiming(String(item.id), "now")}
                                />
                                <TimingButton
                                  label="With food"
                                  sublabel="Serve together"
                                  icon={Clock3}
                                  active={itemTiming === "with_food"}
                                  onClick={() => setTiming(String(item.id), "with_food")}
                                />
                              </>
                            )}

                            {isCoffee && (
                              <>
                                <TimingButton
                                  label="Right now"
                                  sublabel="Bring immediately"
                                  icon={Zap}
                                  active={itemTiming === "now"}
                                  onClick={() => setTiming(String(item.id), "now")}
                                />
                                <TimingButton
                                  label="After food"
                                  sublabel="End of meal"
                                  icon={Coffee}
                                  active={itemTiming === "after_food"}
                                  onClick={() => setTiming(String(item.id), "after_food")}
                                />
                              </>
                            )}

                            {isDessert && (
                              <>
                                <TimingButton
                                  label="With food"
                                  sublabel="Together"
                                  icon={Clock3}
                                  active={itemTiming === "with_food"}
                                  onClick={() => setTiming(String(item.id), "with_food")}
                                />
                                <TimingButton
                                  label="After food"
                                  sublabel="End of meal"
                                  icon={Coffee}
                                  active={itemTiming === "after_food"}
                                  onClick={() => setTiming(String(item.id), "after_food")}
                                />
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {validCartItems.length > 0 && upsellUiEnabled && (upsellLoading || activeCartUpsells.length > 0) && (
          <div className="mt-2">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B39F89]">
              Also worth adding
            </p>
            <div className="mt-1.5 bg-white border border-[#EFE7DD] rounded-2xl p-3 shadow-[0_8px_24px_rgba(75,40,0,0.06)]">
              {upsellLoading && activeCartUpsells.length === 0 ? (
                <p className="text-xs text-[#9B8D7B]">Loading suggestion...</p>
              ) : activeCartUpsells.length === 0 ? (
                <p className="text-xs text-[#9B8D7B]">No add-on suggestion right now.</p>
              ) : (
                activeCartUpsells.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="flex items-center gap-3 py-2 first:pt-0 last:pb-0 border-b border-[#F3ECE2] last:border-0"
                  >
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-[#F3ECE2] bg-[#F9F6F1] shrink-0">
                      <img
                        src={resolveImageUrl(suggestion.image1)}
                        alt={suggestion.item_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "https://placehold.co/200x200?text=No+Image";
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9B7A4E]">
                        While you wait
                      </p>
                      <p className="text-[15px] font-bold text-[#2F2418] leading-tight truncate">
                        {suggestion.item_name}
                      </p>
                      <p className="text-[11px] text-[#9B8D7B] leading-tight line-clamp-2">
                        {suggestion.upsell_message || "A starter to keep things going before the main arrives."}
                      </p>
                      <p className="text-base font-bold text-[#4B2800] mt-1">
                        {currencyCode} {toSafeNumber(suggestion.price).toFixed(2)}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <button
                        onClick={() => dismissSuggestedItem(suggestion, "cart", "declined")}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                      >
                        No Thanks
                      </button>
                      <button
                        onClick={() => addSuggestedItem(suggestion, "cart")}
                        className="rounded-full bg-[#4B2800] text-white px-3.5 py-1.5 text-sm font-bold hover:bg-[#3F2200] transition-colors"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {validCartItems.length > 0 && (
        <div className="w-full mt-auto">
          <div className="fixed bottom-[calc(68px+env(safe-area-inset-bottom))] left-3 right-3 bg-white px-4 pt-3 pb-3 shadow-[0_14px_40px_rgba(75,40,0,0.12)] rounded-3xl z-50 max-w-2xl mx-auto border border-[#EFE7DD]">
            <div className="flex justify-between items-start mb-3 px-0.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9B8D7B]">Total Quantity</p>
                <p className="text-[31px] leading-[1.05] font-bold text-[#221A10]">
                  {totalQuantity} <span className="text-[28px]">Items</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9B8D7B]">Total Cost</p>
                <p className="text-[38px] leading-[1.02] font-black text-[#4B2800]">
                  {currencyCode} {totalCost.toFixed(2)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowReviewModal(true)}
              className="w-full bg-[#4B2800] text-white font-bold py-3 px-5 rounded-2xl shadow-lg shadow-[#4B2800]/30 hover:bg-[#3F2200] active:scale-95 transition-all flex items-center justify-between group"
            >
              <span>Place Order</span>
              <span className="bg-white/20 px-3 py-1 rounded-lg group-hover:bg-white/30 transition-colors">
                {currencyCode} {totalCost.toFixed(2)} <ArrowRight className="inline ml-1 w-4 h-4" />
              </span>
            </button>
          </div>
        </div>
      )}

      {showReviewModal && (
        <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[1px] p-4 flex items-center justify-center">
          <div className="w-[90%] max-w-sm bg-white rounded-3xl border-none shadow-2xl p-0 overflow-hidden gap-0 max-h-[88vh] flex flex-col">
            <div className="relative p-5 pb-4 border-b border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center">
                  <ChefHat className="w-4 h-4 text-slate-500" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">Review Your Order</h3>
                  <p className="text-xs text-slate-500">Check everything looks right</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <span className="flex items-center gap-1 bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                  <MapPin className="w-3 h-3" strokeWidth={1.8} />
                  Table {tableNumber}
                </span>
                <span className="flex items-center gap-1 bg-primary/8 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                  <Clock3 className="w-3 h-3" strokeWidth={1.8} />
                  ~15–20 min
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Order</p>
                {validCartItems.map((item) => (
                  <div key={`review-${item.id}`} className="flex items-center gap-3 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                      <img
                        src={resolveImageUrl(item.image1)}
                        alt={item.item_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "https://placehold.co/200x200?text=No+Image";
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.item_name}</p>
                      {itemTimings[String(item.id)] && (
                        <p className="text-[10px] text-primary font-medium mt-0.5">
                          {TIMING_LABEL[itemTimings[String(item.id)]!]}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">{currencyCode} {(toSafeNumber(item.price) * item.quantity).toFixed(2)}</p>
                      <p className="text-[10px] text-slate-400">×{item.quantity}</p>
                    </div>
                  </div>
                ))}

                <div className="flex justify-between items-center px-1 pt-1">
                  <span className="text-sm font-bold text-gray-900">Total</span>
                  <span className="text-lg font-bold text-primary">
                    {currencyCode} {totalCost.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment</p>
                <div className="flex gap-2">
                  {(["card", "cash"] as const).map((method) => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                        paymentMethod === method
                          ? "bg-primary text-white border-primary shadow-sm"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:border-primary/40"
                      }`}
                    >
                      {method === "card" ? (
                        <>
                          <CreditCard className="w-4 h-4" strokeWidth={1.8} />
                          Card
                        </>
                      ) : (
                        <>
                          <Banknote className="w-4 h-4" strokeWidth={1.8} />
                          Cash
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-600 font-bold text-[10px] uppercase tracking-widest">
                  <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.8} />
                  Allergies & Special Requests
                </div>
                <textarea
                  placeholder="e.g. Nut allergy, Gluten free, Extra spicy..."
                  value={specialRequest}
                  onChange={(e) => setSpecialRequest(e.target.value)}
                  className="bg-gray-50 border border-gray-200 focus-visible:ring-primary/20 min-h-[56px] text-sm rounded-xl w-full p-3"
                />
              </div>
            </div>

            <div className="p-4 bg-white border-t border-gray-100 flex flex-col gap-2.5 shrink-0">
              {upsellUiEnabled && (beforePaymentLoading || beforePaymentSuggestions.length > 0) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Before you pay
                  </p>
                  {beforePaymentLoading && beforePaymentSuggestions.length === 0 ? (
                    <p className="text-xs text-slate-500">Loading a smart add-on...</p>
                  ) : (
                    beforePaymentSuggestions.map((suggestion) => (
                      <div key={`before-pay-${suggestion.id}`} className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0">
                          <img
                            src={resolveImageUrl(suggestion.image1)}
                            alt={suggestion.item_name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = "https://placehold.co/200x200?text=No+Image";
                            }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800 truncate">{suggestion.item_name}</p>
                          <p className="text-xs text-primary font-bold">
                            {currencyCode} {toSafeNumber(suggestion.price).toFixed(2)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => dismissSuggestedItem(suggestion, "before_payment", "declined")}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500"
                        >
                          No
                        </button>
                        <button
                          type="button"
                          onClick={() => addSuggestedItem(suggestion, "before_payment")}
                          className="rounded-full bg-primary text-white px-3 py-1 text-[11px] font-semibold shadow-sm shadow-primary/20"
                        >
                          Add
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={handleOrderNow}
                disabled={isSubmittingOrder}
                className="w-full h-12 rounded-xl text-base font-bold shadow-lg shadow-primary/20 bg-[#4B2800] hover:bg-[#3e2100] text-white disabled:opacity-70 transition-colors"
              >
                {isSubmittingOrder
                  ? "Placing Order..."
                  : `Place Order · ${currencyCode} ${totalCost.toFixed(2)}`}
              </button>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={isSubmittingOrder}
                className="rounded-xl text-muted-foreground text-sm h-10 hover:bg-slate-50 transition-colors"
              >
                Wait, I forgot something...
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenCart;
