import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Banknote, ChefHat, Clock3, Coffee, CreditCard, MapPin, Minus, Plus, ShoppingCart, Trash2, X, Zap } from "lucide-react";
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
  isUpsellTriggerEnabled,
  logUpsellAssociationStat,
  logUpsellEvent,
  logUpsellShownBatch,
  summarizeCart,
  type UpsellSettingsSnapshot,
  type UpsellSuggestion,
  type UpsellTriggerPoint,
} from "../lib/upsellApi";
import {
  canShowUpsellSession,
  canShowUpsellTouchpoint,
  getUpsellExcludedItemIds,
  getUpsellSessionCap,
  getUpsellTriggerLimit,
  incrementUpsellTouchpointCount,
  markUpsellItemAccepted,
  markUpsellItemDismissed,
  markUpsellItemsShown,
  trackUpsellCategoryDecline,
} from "../lib/upsellSession";
import { getTableIdentity, setLocalStorageSynced } from "../lib/tableIdentity";
import { OptimizedImage } from "../components/OptimizedImage";
import { useActiveBrandConfig } from "../lib/useBrandConfig";
import {
  getDiscountPercent,
  getEffectiveItemPrice,
  getLineTotal,
  getOriginalItemPrice,
  hasItemDiscount,
  toSafeNumber,
} from "../utils/pricing";

const DRINK_CATS = ["c2"];
const COFFEE_CATS = ["c6"];
const DESSERT_CATS = ["c3"];

const DEFAULT_UPSELL_SETTINGS: UpsellSettingsSnapshot = {
  enabled: true,
  show_after_add_to_cart: true,
  show_in_cart: true,
  show_before_payment: true,
  aggressiveness: "moderate",
};

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
          : "bg-secondary text-secondary-foreground border-border hover:border-primary/40 hover:bg-primary/10"
      }`}
    >
      <Icon className={`w-4 h-4 ${active ? "text-white" : "text-muted-foreground"}`} strokeWidth={1.8} />
      <span className="text-xs font-bold leading-tight">{label}</span>
      <span className={`text-[10px] leading-tight ${active ? "text-white/70" : "text-muted-foreground"}`}>
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
  const [, setUpsellLoading] = useState(false);
  const [, setBeforePaymentLoading] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [itemTimings, setItemTimings] = useState<Record<string, TimingValue>>({});
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("card");
  const [specialRequest, setSpecialRequest] = useState("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const cartShownSignatureRef = useRef("");
  const beforePaymentShownSignatureRef = useRef("");
  const tableInfo = useMemo(() => getTableIdentity(), []);
  const brandConfig = useActiveBrandConfig();
  const payBeforeOrder = brandConfig.payBeforeOrder;

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

  const resolveVideoUrl = (url?: string) => {
    if (!url) return "";
    if (url.startsWith("http://")) return url.replace("http://", "https://");
    if (url.startsWith("https://")) return url;
    if (url.startsWith("/")) return `${API_BASE_URL}${url.replace(/^\/+/, "")}`;
    return "";
  };

  const totalQuantity = validCartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalCost = validCartItems.reduce(
    (sum, item) => sum + getLineTotal(item, item.quantity),
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
  const validCartItemIds = useMemo(() => validCartItems.map((item) => item.id), [validCartItems]);
  const cartRestaurantId = useMemo(() => {
    const fromCart = validCartItems
      .map((item) => Number(item.restaurant || 0))
      .find((id) => Number.isInteger(id) && id > 0);
    if (fromCart) return fromCart;
    try {
      const raw = localStorage.getItem("userInfo");
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      const fromSession = Number(parsed?.user?.restaurants?.[0]?.id ?? parsed?.restaurant_id ?? parsed?.restaurant);
      return Number.isInteger(fromSession) && fromSession > 0 ? fromSession : undefined;
    } catch {
      return undefined;
    }
  }, [validCartItems]);

  useEffect(() => {
    const userInfo = localStorage.getItem("userInfo");
    const guestSessionToken = localStorage.getItem("guest_session_token");

    if (userInfo && !guestSessionToken) {
      toast.error("Table session expired. Please scan the QR code again.");
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
    if (validCartItems.length === 0) {
      setUpsellSuggestions([]);
      setUpsellLoading(false);
      cartShownSignatureRef.current = "";
      return;
    }

    const cartIds = new Set(validCartItems.map((item) => item.id));
    const excludedItemIds = Array.from(new Set([...validCartItemIds, ...getUpsellExcludedItemIds()]));
    const currentSettings = upsellSettings || DEFAULT_UPSELL_SETTINGS;
    const currentAggressiveness = currentSettings.aggressiveness || "moderate";
    const triggerLimit = getUpsellTriggerLimit("cart", currentAggressiveness);
    const shouldRenderCart =
      isUpsellTriggerEnabled(currentSettings, "cart") &&
      canShowUpsellSession(currentAggressiveness);

    const recordCartShown = (suggestions: UpsellSuggestion[]) => {
      if (!suggestions.length) {
        cartShownSignatureRef.current = "";
        return;
      }

      const signature = `${cartFingerprint}|${suggestions.map((item) => item.id).join(",")}`;
      if (signature === cartShownSignatureRef.current) return;

      cartShownSignatureRef.current = signature;
      markUpsellItemsShown(suggestions.map((suggestion) => suggestion.id));
      incrementUpsellTouchpointCount("cart", suggestions.length);
      void logUpsellShownBatch({
        triggerPoint: "cart",
        suggestions,
        cartValueAtTime: cartMetrics.cartValueAtTime,
        cartItemCount: cartMetrics.cartItemCount,
      });
      void Promise.allSettled(
        suggestions.map((suggestion) =>
          logUpsellAssociationStat({
            triggerPoint: "cart",
            action: "shown",
            sourceItemIds: validCartItemIds,
            upsellItemId: suggestion.id,
          })
        )
      );
    };

    const applyCartSuggestions = (resolvedSuggestions: UpsellSuggestion[], limit = triggerLimit) => {
      if (cancelled) return;
      const suggestions = resolvedSuggestions
        .filter((item) => item && Number.isInteger(item.id) && !cartIds.has(item.id))
        .slice(0, limit);
      setUpsellSuggestions(suggestions);
      setUpsellLoading(false);
      recordCartShown(suggestions);
    };

    setUpsellLoading(shouldRenderCart);

    const loadCartUpsells = async () => {
      try {
        const settingsPromise = fetchUpsellSettings({ force: true }).catch(() => null);
        const suggestionsPromise = fetchUpsellSuggestions({
          triggerPoint: "cart",
          limit: triggerLimit,
          restaurantId: cartRestaurantId,
          cartItemIds: validCartItemIds,
          excludeItemIds: excludedItemIds,
        }, { force: true });
        const [settingsSnapshot, rawSuggestions] = await Promise.all([
          settingsPromise,
          suggestionsPromise,
        ]);
        if (cancelled) return;

        if (settingsSnapshot) {
          setUpsellSettings(settingsSnapshot);
        }

        const effectiveSettings: UpsellSettingsSnapshot = settingsSnapshot || currentSettings;

        const effectiveAggressiveness = effectiveSettings.aggressiveness || "moderate";
        const effectiveTriggerLimit = getUpsellTriggerLimit("cart", effectiveAggressiveness);
        const shouldRenderCart =
          isUpsellTriggerEnabled(effectiveSettings, "cart") &&
          canShowUpsellSession(effectiveAggressiveness);

        if (!shouldRenderCart) {
          setUpsellSuggestions([]);
          setUpsellLoading(false);
          cartShownSignatureRef.current = "";
          return;
        }

        applyCartSuggestions(rawSuggestions, effectiveTriggerLimit);
      } catch {
        // Keep the last valid LLM result visible during transient mobile
        // network failures. A later cart change will request fresh context.
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
  }, [cartFingerprint, cartMetrics.cartItemCount, cartMetrics.cartValueAtTime, cartRestaurantId, validCartItems, validCartItemIds]);

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

    const cartIds = new Set(validCartItems.map((item) => item.id));
    const excludedItemIds = Array.from(new Set([...validCartItemIds, ...getUpsellExcludedItemIds()]));
    const currentSettings = upsellSettings || DEFAULT_UPSELL_SETTINGS;
    const currentAggressiveness = currentSettings.aggressiveness || "moderate";
    const triggerLimit = getUpsellTriggerLimit("before_payment", currentAggressiveness);
    const sessionLimit = getUpsellSessionCap(currentAggressiveness);
    const shouldRender =
      isUpsellTriggerEnabled(currentSettings, "before_payment") &&
      canShowUpsellSession(currentAggressiveness) &&
      canShowUpsellTouchpoint("before_payment", triggerLimit, sessionLimit);

    const recordBeforePaymentShown = (suggestions: UpsellSuggestion[]) => {
      if (!suggestions.length) {
        beforePaymentShownSignatureRef.current = "";
        return;
      }

      const signature = `${cartFingerprint}|${suggestions.map((item) => item.id).join(",")}`;
      if (signature === beforePaymentShownSignatureRef.current) return;

      beforePaymentShownSignatureRef.current = signature;
      markUpsellItemsShown(suggestions.map((suggestion) => suggestion.id));
      incrementUpsellTouchpointCount("before_payment", suggestions.length);
      void logUpsellShownBatch({
        triggerPoint: "before_payment",
        suggestions,
        cartValueAtTime: cartMetrics.cartValueAtTime,
        cartItemCount: cartMetrics.cartItemCount,
      });
      void Promise.allSettled(
        suggestions.map((suggestion) =>
          logUpsellAssociationStat({
            triggerPoint: "before_payment",
            action: "shown",
            sourceItemIds: validCartItemIds,
            upsellItemId: suggestion.id,
          })
        )
      );
    };

    const applyBeforePaymentSuggestions = (resolvedSuggestions: UpsellSuggestion[], limit = triggerLimit) => {
      if (cancelled) return;
      const suggestions = resolvedSuggestions
        .filter((item) => item && Number.isInteger(item.id) && !cartIds.has(item.id))
        .slice(0, limit);
      setBeforePaymentSuggestions(suggestions);
      setBeforePaymentLoading(false);
      recordBeforePaymentShown(suggestions);
    };

    if (!shouldRender) {
      setBeforePaymentSuggestions([]);
      setBeforePaymentLoading(false);
      beforePaymentShownSignatureRef.current = "";
    }

    setBeforePaymentLoading(shouldRender);

    const loadBeforePaymentUpsell = async () => {
      try {
        const settingsSnapshot = await fetchUpsellSettings({ force: true }).catch(() => null);

        if (cancelled) return;
        if (settingsSnapshot) {
          setUpsellSettings(settingsSnapshot);
        }

        const effectiveSettings: UpsellSettingsSnapshot = settingsSnapshot || currentSettings;

        const effectiveAggressiveness = effectiveSettings.aggressiveness || "moderate";
        const effectiveTriggerLimit = getUpsellTriggerLimit("before_payment", effectiveAggressiveness);
        const effectiveSessionLimit = getUpsellSessionCap(effectiveAggressiveness);
        const shouldRenderRemote =
          isUpsellTriggerEnabled(effectiveSettings, "before_payment") &&
          canShowUpsellSession(effectiveAggressiveness) &&
          canShowUpsellTouchpoint("before_payment", effectiveTriggerLimit, effectiveSessionLimit);

        if (!shouldRenderRemote) {
          setBeforePaymentSuggestions([]);
          setBeforePaymentLoading(false);
          beforePaymentShownSignatureRef.current = "";
          return;
        }

        const rawSuggestions = await fetchUpsellSuggestions({
          triggerPoint: "before_payment",
          limit: effectiveTriggerLimit,
          restaurantId: cartRestaurantId,
          cartItemIds: validCartItemIds,
          excludeItemIds: excludedItemIds,
        }, { force: true });
        applyBeforePaymentSuggestions(rawSuggestions, effectiveTriggerLimit);
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
    cartRestaurantId,
    validCartItems,
    validCartItemIds,
  ]);

  const suggestionToCartItem = (item: UpsellSuggestion): Omit<CartItem, "quantity"> => ({
    id: item.id,
    item_name: item.item_name,
    price: String(toSafeNumber(item.price)),
    discount_percentage: getDiscountPercent(item),
    final_price: item.final_price,
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
    const added = await addToCart(suggestionToCartItem(item), 1);
    if (!added) {
      toast.error("Could not add this suggestion. Please try again.");
      return;
    }
    if (item.id) {
      markUpsellItemAccepted(item.id);
    }
    setUpsellSuggestions((prev) => prev.filter((candidate) => candidate.id !== item.id));
    setBeforePaymentSuggestions((prev) => prev.filter((candidate) => candidate.id !== item.id));
    toast.success(`${item.item_name} added to cart`);
    void Promise.allSettled([
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
        sourceItemIds: validCartItemIds,
        upsellItemId: item.id,
        upsellPrice: getEffectiveItemPrice(item),
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
      trackUpsellCategoryDecline(item.category, action === "dismissed" ? 0.5 : 1);
    }
    setUpsellSuggestions((prev) => prev.filter((candidate) => candidate.id !== item.id));
    setBeforePaymentSuggestions((prev) => prev.filter((candidate) => candidate.id !== item.id));

    void Promise.allSettled([
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
        sourceItemIds: validCartItemIds,
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
        .join(" ");

      const paymentTag = `[PAYMENT:${paymentMethod}]`;
      const mergedNotes = [specialRequest.trim(), timingNotes, paymentTag].filter(Boolean).join(" ");

      const orderData: Record<string, unknown> = {
        restaurant,
        device,
        order_items: orderItems,
        guest_session_token: guestSessionToken,
        payment_method: paymentMethod,
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
      const backendItemsSnapshot = Array.isArray(response?.data?.order_items)
        ? response.data.order_items
        : Array.isArray(response?.data?.items)
          ? response.data.items
          : null;
      const placedItemsSnapshot = backendItemsSnapshot || validCartItems.map((item) => ({
        id: item.id,
        item_id: item.id,
        item_name: item.item_name,
        name: item.item_name,
        quantity: item.quantity,
        price: getEffectiveItemPrice(item),
      }));
      const orderTotal = Number(
        toSafeNumber(response?.data?.total_price ?? response?.data?.total ?? totalCost).toFixed(2)
      );

      toast.success(
        payBeforeOrder && paymentMethod === "card"
          ? "Order saved. Redirecting to secure payment..."
          : "Order placed successfully!"
      );

      try {
        const { getPlayerSession } = await import("../lib/playerSession");
        const player = getPlayerSession();
        if (player?.phone && player?.name && player.name !== "Guest") {
          const points = Math.max(1, Math.floor(orderTotal));
          await axiosInstance.post("/api/loyalty/earn", {
            phone: player.phone,
            name: player.name,
            points,
            orderId: response?.data?.id,
            restaurantId: tableInfo.restaurantId,
            amount: orderTotal,
            description: `Order ${currencyCode} ${orderTotal.toFixed(0)} - ${points} pts earned`,
          });
        }
      } catch {
        // Loyalty is non-blocking. Order placement must never fail because points failed.
      }

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
        const ordersStorageKey = tableInfo.ordersStorageKey;
        const orderId = String(response.data.id);
        const pendingOrder = {
          id: `local-${orderId}`,
          backendId: orderId,
          items: placedItemsSnapshot,
          total: orderTotal,
          total_price: orderTotal,
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
              setLocalStorageSynced(ordersStorageKey, JSON.stringify([pendingOrder, ...existingOrders]));
            }
          } else {
            setLocalStorageSynced(ordersStorageKey, JSON.stringify([pendingOrder]));
          }
        } catch {
          setLocalStorageSynced(ordersStorageKey, JSON.stringify([pendingOrder]));
        }

        // Robust Persistence
        setLocalStorageSynced("pending_order_id", String(response.data.id));

        if (payBeforeOrder && paymentMethod === "card") {
          try {
            const checkoutResponse = await axiosInstance.post(
              `/api/customer/create-checkout-session/${response.data.id}/?guest_token=${guestSessionToken}`,
              { provider: "card" },
              {
                headers: {
                  "X-Guest-Session-Token": guestSessionToken,
                },
              }
            );
            const checkoutUrl = checkoutResponse?.data?.url;
            const stripeSessionId =
              checkoutResponse?.data?.sessionId || checkoutResponse?.data?.session_id;

            if (checkoutUrl) {
              window.location.assign(checkoutUrl);
              return;
            }

            if (stripeSessionId && import.meta.env.VITE_STRIPE_PK) {
              const { loadStripe } = await import("@stripe/stripe-js");
              const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PK);
              const result = await stripe?.redirectToCheckout({ sessionId: stripeSessionId });
              if (result?.error) throw result.error;
              return;
            }

            throw new Error("The payment provider did not return a checkout link.");
          } catch (checkoutError: any) {
            console.error("Order created but checkout could not start:", checkoutError);
            toast.error(
              checkoutError?.response?.data?.error ||
                checkoutError?.message ||
                "Payment could not start. Retry from My Orders."
            );
            navigate("/dashboard/orders");
            return;
          }
        }

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
    <div className="min-h-full bg-background text-foreground flex flex-col items-center pb-[160px]">
      <div className="w-full border-b border-border/30 bg-background/80 p-6 pb-4 shadow-sm shadow-black/20 backdrop-blur-md z-10">
        <h1 className="text-2xl font-black tracking-tight text-foreground">Your Order</h1>
        <p className="text-sm text-muted-foreground mt-1">Table {tableNumber} · Check your items before ordering</p>
      </div>
      <div className="flex-1 flex flex-col gap-y-3 w-full max-w-2xl overflow-y-auto px-4 pt-4 pb-48">
        {validCartItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-64 space-y-4"
          >
            <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center text-2xl">
              <ShoppingCart className="w-7 h-7 text-muted-foreground" strokeWidth={1.8} />
            </div>
            <p className="text-muted-foreground">Your cart is empty</p>
            <button
              onClick={() => navigate("/")}
              className="px-6 py-2.5 border border-border rounded-xl bg-card text-sm font-medium hover:bg-secondary transition-colors"
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
                className="bg-card rounded-2xl p-3 pr-4 shadow-[0_16px_36px_rgba(0,0,0,0.18)] border border-border"
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
                  const unitPrice = getEffectiveItemPrice(item);
                  const originalPrice = getOriginalItemPrice(item);
                  const discounted = hasItemDiscount(item);

                  return (
                    <>
                      <div className="flex items-center">
                        <div className="w-20 h-20 shrink-0 rounded-xl bg-secondary overflow-hidden relative shadow-md shadow-black/20">
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
                            <OptimizedImage
                              src={item.image1}
                              alt={item.item_name}
                              width={80}
                              height={80}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="ml-4 flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <h2 className="font-bold text-sm text-foreground leading-tight truncate">{item.item_name}</h2>
                            <div className="mb-3">
                              <p className="text-primary font-bold text-sm">
                                {currencyCode} {unitPrice.toFixed(2)}
                              </p>
                              {discounted && (
                                <p className="text-[11px] text-muted-foreground line-through">
                                  {currencyCode} {originalPrice.toFixed(2)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => decrementQuantity(item.id)}
                              className="w-7 h-7 flex items-center justify-center bg-secondary hover:bg-white/10 rounded-full text-secondary-foreground transition-colors active:scale-90 duration-200"
                              aria-label={`Decrease ${item.item_name} quantity`}
                            >
                              <Minus className="w-3 h-3" strokeWidth={1.8} />
                            </button>
                            <span className="text-sm font-semibold w-4 text-center text-foreground">{item.quantity}</span>
                            <button
                              onClick={() => incrementQuantity(item.id)}
                              className="w-7 h-7 flex items-center justify-center bg-primary hover:bg-primary/90 rounded-full text-white transition-colors active:scale-90 duration-200"
                              aria-label={`Increase ${item.item_name} quantity`}
                            >
                              <Plus className="w-3 h-3" strokeWidth={1.8} />
                            </button>
                          </div>
                        </div>
                        <button
                          className="ml-4 self-start text-muted-foreground hover:text-red-500 transition-colors"
                          onClick={() => removeFromCart(item.id)}
                          aria-label={`Remove ${item.item_name}`}
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                        </button>
                      </div>

                      {needsTiming && (
                        <div className="border-t border-border mt-3 pt-3">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
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

        {validCartItems.length > 0 && upsellUiEnabled && activeCartUpsells.length > 0 && (
          <div className="mt-2">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Also worth adding
            </p>
            <div className="mt-1.5 bg-card border border-border rounded-2xl p-3 shadow-[0_16px_36px_rgba(0,0,0,0.18)]">
              {activeCartUpsells.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="flex items-center gap-3 py-2 first:pt-0 last:pb-0 border-b border-border last:border-0"
                  >
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-border bg-secondary shrink-0">
                      <OptimizedImage
                        src={suggestion.image1}
                        alt={suggestion.item_name}
                        width={56}
                        height={56}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                        Complete your order
                      </p>
                      <p className="text-[15px] font-bold text-foreground leading-tight truncate">
                        {suggestion.item_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
                        {suggestion.upsell_message || "A starter to keep things going before the main arrives."}
                      </p>
                      <p className="text-base font-bold text-primary mt-1">
                        {currencyCode} {getEffectiveItemPrice(suggestion).toFixed(2)}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <button
                        onClick={() => dismissSuggestedItem(suggestion, "cart", "declined")}
                        className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary"
                      >
                        No Thanks
                      </button>
                      <button
                        onClick={() => addSuggestedItem(suggestion, "cart")}
                        className="rounded-full bg-primary text-white px-3.5 py-1.5 text-sm font-bold hover:bg-primary/90 transition-colors"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
      {validCartItems.length > 0 && (
        <div className="w-full mt-auto">
          <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 rounded-t-3xl border-t border-border bg-card/95 p-4 shadow-[0_-14px_34px_rgba(0,0,0,0.34)] backdrop-blur-lg">
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Quantity</p>
                <p className="font-bold text-lg text-foreground">
                  {totalQuantity} Items
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Cost</p>
                <p className="font-bold text-2xl text-primary">
                  {currencyCode} {totalCost.toFixed(2)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowReviewModal(true)}
              className="w-full h-14 bg-primary text-white text-lg font-bold px-6 rounded-xl shadow-xl shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-between group"
            >
              <span>Place Order</span>
              <span className="flex items-center gap-2">
                {currencyCode} {totalCost.toFixed(2)}
                <span className="bg-white/20 rounded-full p-0.5 group-hover:bg-white/30 transition-colors">
                  <ArrowRight className="w-5 h-5" strokeWidth={1.8} />
                </span>
              </span>
            </button>
          </div>
        </div>
      )}

      {showReviewModal && (
        <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[1px] p-4 flex items-center justify-center">
          <div className="w-[92%] max-w-sm bg-card text-foreground rounded-3xl border border-border shadow-2xl shadow-black/40 p-0 overflow-hidden gap-0 max-h-[88vh] flex flex-col">
            <div className="relative p-5 pb-4 border-b border-border shrink-0">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full border border-border text-muted-foreground hover:bg-secondary flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-secondary border border-border flex items-center justify-center">
                  <ChefHat className="w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground leading-tight">Review Your Order</h3>
                  <p className="text-xs text-slate-500">Check everything looks right</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <span className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs font-semibold px-2.5 py-1 rounded-full">
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
                      <div key={`review-${item.id}`} className="flex items-center gap-3 bg-secondary rounded-xl p-2.5 border border-border">
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-background shrink-0">
                      <OptimizedImage
                        src={item.image1}
                        alt={item.item_name}
                        width={44}
                        height={44}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{item.item_name}</p>
                      {itemTimings[String(item.id)] && (
                        <p className="text-[10px] text-primary font-medium mt-0.5">
                          {TIMING_LABEL[itemTimings[String(item.id)]!]}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground">{currencyCode} {getLineTotal(item, item.quantity).toFixed(2)}</p>
                      {hasItemDiscount(item) && (
                        <p className="text-[10px] text-slate-400 line-through">
                          {currencyCode} {(getOriginalItemPrice(item) * item.quantity).toFixed(2)}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400">×{item.quantity}</p>
                    </div>
                  </div>
                ))}

                <div className="flex justify-between items-center px-1 pt-1">
                  <span className="text-sm font-bold text-foreground">Total</span>
                  <span className="text-lg font-bold text-primary">
                    {currencyCode} {totalCost.toFixed(2)}
                  </span>
                </div>
              </div>

              {payBeforeOrder && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Method</p>
                  <div className="flex gap-2">
                    {(["card", "cash"] as const).map((method) => (
                      <button
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                          paymentMethod === method
                            ? "bg-primary text-white border-primary shadow-sm"
                            : "bg-secondary text-secondary-foreground border-border hover:border-primary/40"
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
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground font-bold text-[10px] uppercase tracking-widest">
                  <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.8} />
                  Allergies & Special Requests
                </div>
                <textarea
                  placeholder="e.g. Nut allergy, Gluten free, Extra spicy..."
                  value={specialRequest}
                  onChange={(e) => setSpecialRequest(e.target.value)}
                  className="bg-secondary border border-border focus-visible:ring-primary/20 min-h-[56px] text-sm rounded-xl w-full p-3 resize-none text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="p-4 bg-card border-t border-border flex flex-col gap-2.5 shrink-0">
              {upsellUiEnabled && beforePaymentSuggestions.length > 0 && (
                <div className="rounded-xl border border-border bg-secondary p-2.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Before you pay
                  </p>
                  {beforePaymentSuggestions.map((suggestion) => (
                      <div key={`before-pay-${suggestion.id}`} className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-border bg-background shrink-0">
                          <OptimizedImage
                            src={suggestion.image1}
                            alt={suggestion.item_name}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">{suggestion.item_name}</p>
                          <p className="text-[10px] leading-tight text-muted-foreground line-clamp-2">
                            {suggestion.upsell_message || "A final addition before you confirm."}
                          </p>
                          <p className="text-xs text-primary font-bold">
                            {currencyCode} {getEffectiveItemPrice(suggestion).toFixed(2)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => dismissSuggestedItem(suggestion, "before_payment", "declined")}
                          className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
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
                    ))}
                </div>
              )}
              <button
                type="button"
                onClick={handleOrderNow}
                disabled={isSubmittingOrder}
                className="w-full h-14 rounded-xl text-base font-bold shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-white disabled:opacity-70 transition-colors"
              >
                {isSubmittingOrder
                  ? payBeforeOrder && paymentMethod === "card"
                    ? "Starting Secure Payment..."
                    : "Placing Order..."
                  : payBeforeOrder && paymentMethod === "card"
                  ? `Pay ${currencyCode} ${totalCost.toFixed(2)} · Card`
                  : `Place Order · ${currencyCode} ${totalCost.toFixed(2)}`}
              </button>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={isSubmittingOrder}
                className="rounded-xl text-muted-foreground text-sm h-10 hover:bg-secondary transition-colors"
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
