import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, ChefHat, Clock3, Coffee, X, Zap } from "lucide-react";
import { useCart, type CartItem } from "../context/CartContext";
import axiosInstance from "../lib/axios";
import { API_BASE_URL } from "../lib/axios";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion"; // Corrected from "motion/react"
import { useEffect, useMemo, useState } from "react";
import { getSessionCurrencyCode } from "../utils/regionSession";
import {
  fetchUpsellSuggestions,
  logUpsellEvent,
  logUpsellShownBatch,
  summarizeCart,
  type UpsellSuggestion,
  type UpsellTriggerPoint,
} from "../lib/upsellApi";
import { markUpsellItemDismissed, trackUpsellCategoryDecline } from "../lib/upsellSession";

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
  const [upsellLoading, setUpsellLoading] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [itemTimings, setItemTimings] = useState<Record<string, TimingValue>>({});
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("card");
  const [specialRequest, setSpecialRequest] = useState("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
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
      return;
    }

    const fetchUpsellSuggestionsForTrigger = async (triggerPoint: UpsellTriggerPoint) => {
      const targetSetter = triggerPoint === "before_payment" ? setBeforePaymentSuggestions : setUpsellSuggestions;
      setUpsellLoading(true);
      try {
        const rawSuggestions = await fetchUpsellSuggestions({
          triggerPoint,
          limit: triggerPoint === "cart" ? 4 : 2,
        });
        const cartIds = new Set(validCartItems.map((item) => item.id));
        const cleanedSuggestions = rawSuggestions
          .filter((item: any) => item && Number.isInteger(item.id) && !cartIds.has(item.id))
          .slice(0, triggerPoint === "cart" ? 4 : 2);

        if (!cancelled) {
          targetSetter(cleanedSuggestions);
          await logUpsellShownBatch({
            triggerPoint,
            suggestions: cleanedSuggestions,
            cartValueAtTime: cartMetrics.cartValueAtTime,
            cartItemCount: cartMetrics.cartItemCount,
          });
        }
      } catch (error) {
        if (!cancelled) {
          targetSetter([]);
        }
      } finally {
        if (!cancelled) {
          setUpsellLoading(false);
        }
      }
    };

    fetchUpsellSuggestionsForTrigger("cart");
    fetchUpsellSuggestionsForTrigger("before_payment");
    return () => {
      cancelled = true;
    };
  }, [cartFingerprint, cartMetrics.cartItemCount, cartMetrics.cartValueAtTime, validCartItems]);

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
    toast.success(`${item.item_name} added to cart`);
    await logUpsellEvent({
      triggerPoint,
      action: "accepted",
      suggestion: item,
      cartValueAtTime: cartMetrics.cartValueAtTime,
      cartItemCount: cartMetrics.cartItemCount,
    });
  };

  const dismissSuggestion = async (item: UpsellSuggestion, triggerPoint: UpsellTriggerPoint) => {
    if (item.id) {
      markUpsellItemDismissed(item.id);
    }
    if (item.category) {
      trackUpsellCategoryDecline(item.category);
    }
    if (triggerPoint === "before_payment") {
      setBeforePaymentSuggestions((prev) => prev.filter((entry) => entry.id !== item.id));
    } else {
      setUpsellSuggestions((prev) => prev.filter((entry) => entry.id !== item.id));
    }
    await logUpsellEvent({
      triggerPoint,
      action: "dismissed",
      suggestion: item,
      cartValueAtTime: cartMetrics.cartValueAtTime,
      cartItemCount: cartMetrics.cartItemCount,
    });
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

        {validCartItems.length > 0 && (
          <div className="mt-4 bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Recommended Add-ons</h3>
              {upsellLoading && <span className="text-xs text-gray-400">Loading...</span>}
            </div>
            {upsellSuggestions.length === 0 ? (
              <p className="text-xs text-gray-500">No add-on suggestions right now.</p>
            ) : (
              <div className="space-y-3">
                {upsellSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{suggestion.item_name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {suggestion.upsell_message || "You might like this add-on."}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        {currencyCode} {toSafeNumber(suggestion.price).toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={() => addSuggestedItem(suggestion, "cart")}
                      className="shrink-0 rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-semibold hover:bg-blue-100 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => dismissSuggestion(suggestion, "cart")}
                      className="shrink-0 rounded-full border border-gray-200 text-gray-500 px-3 py-1 text-xs font-semibold hover:bg-gray-50 transition-colors"
                    >
                      No Thanks
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {validCartItems.length > 0 && (
        <div className="w-full mt-auto">
          <div className="fixed bottom-24 left-4 right-4 bg-white p-4 shadow-xl rounded-2xl z-50 max-w-2xl mx-auto border border-gray-100">
            {beforePaymentSuggestions.length > 0 && (
              <div className="mb-4 border border-blue-100 bg-blue-50/40 rounded-xl p-3">
                <p className="text-xs font-semibold text-blue-700 mb-2">Before You Pay</p>
                {beforePaymentSuggestions.slice(0, 2).map((suggestion) => (
                  <div key={`bp-${suggestion.id}`} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{suggestion.item_name}</p>
                      <p className="text-xs text-gray-500 truncate">{suggestion.upsell_message || "Last-minute add-on suggestion."}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => dismissSuggestion(suggestion, "before_payment")}
                        className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-white"
                      >
                        No
                      </button>
                      <button
                        onClick={() => addSuggestedItem(suggestion, "before_payment")}
                        className="rounded-full bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-600">Total Quantity: <span className="font-bold text-blue-600">{totalQuantity}</span></span>
              <span className="text-gray-600">Total Cost: <span className="font-bold text-blue-600">{currencyCode} {totalCost.toFixed(2)}</span></span>
            </div>
            <button
              onClick={() => setShowReviewModal(true)}
              className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-between group"
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
          <div className="w-[92%] max-w-[380px] bg-white rounded-[22px] shadow-2xl border border-slate-100 overflow-hidden max-h-[88vh] flex flex-col">
            <div className="relative px-5 pt-5 pb-4 text-center border-b border-slate-100">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="w-11 h-11 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-2">
                <ChefHat className="w-5 h-5 text-slate-500" strokeWidth={1.8} />
              </div>
              <h3 className="text-[28px] leading-none font-bold text-slate-900 tracking-tight">Review Your Order</h3>
              <p className="text-xs text-slate-500 mt-1">We want your meal to be perfect.</p>
              <p className="text-[11px] text-slate-400 mt-1.5">Table {tableNumber}</p>
            </div>

            <div className="px-5 py-4 overflow-y-auto space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                  <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.8} />
                  Allergies & Special Requests
                </div>
                <textarea
                  placeholder="e.g. Nut allergy, Gluten free, Extra spicy..."
                  value={specialRequest}
                  onChange={(e) => setSpecialRequest(e.target.value)}
                  className="w-full bg-white border border-slate-300 focus-visible:ring-primary/20 focus:outline-none focus:border-primary/30 min-h-[60px] text-sm rounded-xl p-3"
                />
              </div>

              <div className="space-y-2.5">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Your Order:</p>
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  {validCartItems.map((item) => (
                    <div key={`review-${item.id}`} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {item.quantity}x {item.item_name}
                        </p>
                        {itemTimings[String(item.id)] && (
                          <p className="text-[10px] text-primary font-medium mt-0.5">
                            {TIMING_LABEL[itemTimings[String(item.id)]!]}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-slate-800 shrink-0">
                        {currencyCode} {(toSafeNumber(item.price) * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center px-1 pt-0.5">
                  <span className="text-xl font-bold text-slate-900">Total</span>
                  <span className="text-xl font-bold text-slate-900">
                    {currencyCode} {totalCost.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 pt-1 bg-white border-t border-slate-100 flex flex-col gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleOrderNow}
                disabled={isSubmittingOrder}
                className="w-full h-11 rounded-xl text-base font-bold shadow-lg bg-[#4B2800] hover:bg-[#3e2100] text-white disabled:opacity-70 transition-colors"
              >
                {isSubmittingOrder
                  ? "Placing Order..."
                  : `Place Order · ${currencyCode} ${totalCost.toFixed(2)}`}
              </button>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={isSubmittingOrder}
                className="rounded-xl text-slate-500 text-sm h-9 hover:bg-slate-50 transition-colors"
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
