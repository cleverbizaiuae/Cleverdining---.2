import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { useEffect, useRef, useState } from "react";
import axiosInstance from "../lib/axios";
import { type CartItem, useCart } from "../context/CartContext";
import toast from "react-hot-toast";
import { motion } from "motion/react";
import { cn } from "clsx-for-tailwind";
import { API_BASE_URL } from "../lib/axios";
import { getSessionCurrencyCode } from "../utils/regionSession";
import UpsellBottomSheet from "./UpsellBottomSheet";
import { ChevronLeft, CheckCircle2, Minus, Plus } from "lucide-react";
import {
  fetchUpsellSettings,
  fetchUpsellSuggestions,
  logUpsellAssociationStat,
  logUpsellEvent,
  logUpsellShownBatch,
  summarizeCart,
  type UpsellSettingsSnapshot,
  type UpsellSuggestion,
} from "../lib/upsellApi";
import {
  canShowUpsellTouchpoint,
  incrementUpsellTouchpointCount,
  markUpsellItemAccepted,
  markUpsellItemDismissed,
  trackUpsellCategoryDecline,
} from "../lib/upsellSession";

interface ModalProps {
  isOpen: boolean;
  close: () => void;
}
interface ModalFoodDetailProps extends ModalProps {
  isOpen: boolean;
  close: () => void;
  itemId?: number;
  onAddToCart?: () => void;
}

const getImageUrl = (url: string | undefined) => {
  const fallback = "https://placehold.co/600x400?text=No+Image";
  if (!url) return fallback;
  if (url.startsWith("http://")) return url.replace("http://", "https://");
  if (url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${API_BASE_URL}${url.replace(/^\/+/, "")}`;
  return fallback;
};

export const ModalFoodDetail: React.FC<ModalFoodDetailProps> = ({
  isOpen,
  close,
  itemId,
  onAddToCart,
}) => {
  const [item, setItem] = useState<any>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [upsellSuggestions, setUpsellSuggestions] = useState<UpsellSuggestion[]>([]);
  const [upsellSettings, setUpsellSettings] = useState<UpsellSettingsSnapshot | null>(null);
  const [upsellCartMetrics, setUpsellCartMetrics] = useState({ cartValueAtTime: 0, cartItemCount: 0 });
  const upsellActiveRef = useRef(false);
  const upsellSourceItemIdRef = useRef<number | null>(null);
  const upsellSourceItemIdsRef = useRef<number[]>([]);
  const pendingUpsellActionRef = useRef<null | (() => Promise<void>)>(null);
  const { cart, addToCart } = useCart();
  const currencyCode = getSessionCurrencyCode();

  const truncatedName = item?.item_name || "Loading...";

  useEffect(() => {
    if (isOpen && itemId) {
      setIsImageLoading(true);
      axiosInstance.get(`/api/customer/items/${itemId}/`).then((res) => {
        setItem(res.data);
        setShowVideo(false);
        setQuantity(1);
      });
    } else {
      setItem(null);
      setShowVideo(false);
      setQuantity(1);
      setIsImageLoading(true);
    }
  }, [isOpen, itemId]);

  const toCartItemFromUpsell = (suggestion: UpsellSuggestion): Omit<CartItem, "quantity"> => ({
    id: suggestion.id,
    item_name: suggestion.item_name,
    price: String(suggestion.price ?? "0"),
    description: suggestion.description || "",
    slug: suggestion.slug || "",
    category: Number(suggestion.category || 0),
    restaurant: Number(suggestion.restaurant || 0),
    category_name: suggestion.category_name || "",
    image1: suggestion.image1 || "",
    availability: suggestion.availability !== false,
    video: suggestion.video || "",
    restaurant_name: suggestion.restaurant_name || "",
  });

  const showAddedToCartToast = (qty: number, name: string) => {
    toast.custom(
      (t) => (
        <div
          className={cn(
            "pointer-events-auto w-[calc(100vw-24px)] max-w-[360px] rounded-2xl bg-white border border-slate-200 shadow-xl px-4 py-3",
            "transition-all duration-250",
            t.visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
          )}
        >
          <p className="text-sm font-semibold text-slate-900">Added to cart</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {qty}x {name} added.
          </p>
        </div>
      ),
      { duration: 1900, position: "top-center" }
    );
  };

  const handleAddToCart = async () => {
    if (!item || isAddingToCart) return;

    setIsAddingToCart(true);
    addToCart(item, quantity);
    showAddedToCartToast(quantity, item.item_name || "Item");

    const nextCart = [...cart, { ...item, quantity }];
    const metrics = summarizeCart(nextCart);
    setUpsellCartMetrics(metrics);
    upsellSourceItemIdRef.current = Number(item.id);
    upsellSourceItemIdsRef.current = nextCart.map((cartItem) => Number(cartItem.id)).filter((id) => Number.isInteger(id) && id > 0);

    window.setTimeout(async () => {
      close();
      if (onAddToCart) onAddToCart();
      setIsAddingToCart(false);

      try {
        if (upsellActiveRef.current || !canShowUpsellTouchpoint("add_to_cart", 2)) {
          return;
        }
        const settingsSnapshot = await fetchUpsellSettings().catch(() => null);
        if (settingsSnapshot) setUpsellSettings(settingsSnapshot);

        const shouldRender =
          (settingsSnapshot?.enabled ?? upsellSettings?.enabled ?? true) &&
          (settingsSnapshot?.show_after_add_to_cart ?? upsellSettings?.show_after_add_to_cart ?? true);

        if (!shouldRender) return;
        const suggestionLimit = settingsSnapshot?.aggressiveness === "subtle" ? 1 : 2;
        const suggestions = await fetchUpsellSuggestions({
          triggerPoint: "add_to_cart",
          sourceItemId: Number(item.id),
          limit: suggestionLimit,
          cartItemIds: nextCart.map((cartItem) => Number(cartItem.id)).filter((id) => Number.isInteger(id) && id > 0),
          excludeItemIds: nextCart.map((cartItem) => Number(cartItem.id)).filter((id) => Number.isInteger(id) && id > 0),
        });

        if (!suggestions.length || !shouldRender) return;
        setUpsellSuggestions(suggestions);
        setUpsellOpen(true);
        upsellActiveRef.current = true;
        incrementUpsellTouchpointCount("add_to_cart");

        await logUpsellShownBatch({
          triggerPoint: "add_to_cart",
          suggestions,
          cartValueAtTime: metrics.cartValueAtTime,
          cartItemCount: metrics.cartItemCount,
          metadata: { source_item_id: item.id, source_category_id: item.category },
        });
        await Promise.allSettled(
          suggestions.map((suggestion) =>
            logUpsellAssociationStat({
              triggerPoint: "add_to_cart",
              action: "shown",
              sourceItemId: Number(item.id),
              sourceItemIds: upsellSourceItemIdsRef.current,
              upsellItemId: suggestion.id,
              metadata: { source_category_id: item.category },
            })
          )
        );
      } catch {
        // Non-blocking by design.
      }
    }, 220);
  };

  const acceptUpsellSuggestion = async (suggestion: UpsellSuggestion) => {
    addToCart(toCartItemFromUpsell(suggestion), 1);
    setUpsellOpen(false);
    toast.success(`${suggestion.item_name} added to cart`);
    pendingUpsellActionRef.current = async () => {
      if (suggestion.id) {
        markUpsellItemAccepted(suggestion.id);
      }
      await Promise.allSettled([
        logUpsellEvent({
          triggerPoint: "add_to_cart",
          action: "accepted",
          suggestion,
          cartValueAtTime: upsellCartMetrics.cartValueAtTime,
          cartItemCount: upsellCartMetrics.cartItemCount,
        }),
        logUpsellAssociationStat({
          triggerPoint: "add_to_cart",
          action: "accepted",
          sourceItemId: upsellSourceItemIdRef.current || undefined,
          sourceItemIds: upsellSourceItemIdsRef.current,
          upsellItemId: suggestion.id,
          upsellPrice: suggestion.price,
        }),
      ]);
    };
  };

  const dismissSingleSuggestion = async (suggestion: UpsellSuggestion) => {
    setUpsellOpen(false);
    pendingUpsellActionRef.current = async () => {
      if (suggestion.id) {
        markUpsellItemDismissed(suggestion.id);
      }
      if (suggestion.category) {
        trackUpsellCategoryDecline(suggestion.category);
      }
      await Promise.allSettled([
        logUpsellEvent({
          triggerPoint: "add_to_cart",
          action: "dismissed",
          suggestion,
          cartValueAtTime: upsellCartMetrics.cartValueAtTime,
          cartItemCount: upsellCartMetrics.cartItemCount,
        }),
        logUpsellAssociationStat({
          triggerPoint: "add_to_cart",
          action: "dismissed",
          sourceItemId: upsellSourceItemIdRef.current || undefined,
          sourceItemIds: upsellSourceItemIdsRef.current,
          upsellItemId: suggestion.id,
        }),
      ]);
    };
  };

  const dismissCardSuggestion = async (suggestion: UpsellSuggestion) => {
    if (suggestion.id) {
      markUpsellItemDismissed(suggestion.id);
    }
    if (suggestion.category) {
      trackUpsellCategoryDecline(suggestion.category);
    }
    setUpsellSuggestions((prev) => {
      const next = prev.filter((row) => row.id !== suggestion.id);
      if (next.length === 0) {
        setUpsellOpen(false);
      }
      return next;
    });
    await Promise.allSettled([
      logUpsellEvent({
        triggerPoint: "add_to_cart",
        action: "dismissed",
        suggestion,
        cartValueAtTime: upsellCartMetrics.cartValueAtTime,
        cartItemCount: upsellCartMetrics.cartItemCount,
      }),
      logUpsellAssociationStat({
        triggerPoint: "add_to_cart",
        action: "dismissed",
        sourceItemId: upsellSourceItemIdRef.current || undefined,
        sourceItemIds: upsellSourceItemIdsRef.current,
        upsellItemId: suggestion.id,
      }),
    ]);
  };

  const dismissManySuggestions = async (suggestions: UpsellSuggestion[]) => {
    setUpsellOpen(false);
    pendingUpsellActionRef.current = async () => {
      const tasks: Promise<unknown>[] = [];
      for (const suggestion of suggestions) {
        if (suggestion.id) {
          markUpsellItemDismissed(suggestion.id);
        }
        if (suggestion.category) {
          trackUpsellCategoryDecline(suggestion.category);
        }
        tasks.push(
          logUpsellEvent({
            triggerPoint: "add_to_cart",
            action: "dismissed",
            suggestion,
            cartValueAtTime: upsellCartMetrics.cartValueAtTime,
            cartItemCount: upsellCartMetrics.cartItemCount,
          })
        );
        tasks.push(
          logUpsellAssociationStat({
            triggerPoint: "add_to_cart",
            action: "dismissed",
            sourceItemId: upsellSourceItemIdRef.current || undefined,
            sourceItemIds: upsellSourceItemIdsRef.current,
            upsellItemId: suggestion.id,
          })
        );
      }
      await Promise.allSettled(tasks);
    };
  };

  const handleUpsellExited = async () => {
    setUpsellSuggestions([]);
    upsellActiveRef.current = false;
    const action = pendingUpsellActionRef.current;
    pendingUpsellActionRef.current = null;
    if (action) {
      window.setTimeout(() => {
        void action();
      }, 420);
    }
  };

  return (
    <Dialog open={isOpen} onClose={() => close()} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-md transition-opacity duration-300" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-6">
        <DialogPanel className="bg-white p-0 rounded-3xl shadow-2xl w-full max-w-sm h-auto max-h-[80vh] overflow-hidden relative flex flex-col animate-in zoom-in-95 duration-200 mx-auto">

          {/* Hero Media Area */}
          <div className="relative w-full h-72 shrink-0 bg-black">
            {/* Back Button */}
            <button
              onClick={close}
              className="absolute top-4 left-4 z-30 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/40 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={2.2} />
            </button>

            {showVideo && item?.video ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full h-full relative"
              >
                <video
                  src={item.video}
                  controls
                  autoPlay
                  playsInline
                  webkit-playsinline="true"
                  className="w-full h-full object-cover"
                  onClick={(e) => e.stopPropagation()}
                />
                {/* Video Controls Overlay (when playing) - simplified for native controls */}
              </motion.div>
            ) : (
              <>
                {(item?.video && !item?.image1) ? (
                  <video
                    src={item.video.startsWith("http") ? item.video : `https://cleverdining-2.onrender.com${item.video}`}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    webkit-playsinline="true"
                    loop
                    autoPlay
                    preload="metadata"
                  />
                ) : (
                  <>
                    <div className="relative w-full h-full">
                      {/* Loading Spinner */}
                      {isImageLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                          <div className="w-10 h-10 border-4 border-gray-200 border-t-primary rounded-full animate-spin"></div>
                        </div>
                      )}

                      <img
                        src={getImageUrl(item?.image1)}
                        alt={item?.item_name || "Food Item"}
                        className={cn(
                          "w-full h-full object-cover transition-opacity duration-500",
                          isImageLoading ? "opacity-0" : "opacity-100"
                        )}
                        onLoad={() => setIsImageLoading(false)}
                        onError={(e) => {
                          setIsImageLoading(false);
                          const fallback = "https://placehold.co/600x400?text=No+Image";
                          if (e.currentTarget.src !== fallback) {
                            e.currentTarget.src = fallback;
                            return;
                          }
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.parentElement?.parentElement?.querySelector('.fallback-placeholder')?.classList.remove('hidden');
                        }}
                      />
                    </div>
                  </>
                )}
                {/* Fallback Div (Hidden by default, shown on error) */}
                <div className="fallback-placeholder hidden absolute inset-0 flex flex-col items-center justify-center bg-gray-50 text-gray-400">
                  <svg className="w-12 h-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-medium">No Image Available</span>
                </div>

                {/* Video Play Button Overlay */}
                {item?.video && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="w-16 h-16 bg-white/20 border border-white/50 backdrop-blur-md rounded-full flex items-center justify-center"
                      onClick={() => setShowVideo(true)}
                    >
                      <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[18px] border-l-white border-b-[10px] border-b-transparent ml-1" />
                    </motion.button>
                  </div>
                )}
              </>
            )}
            <div className="absolute left-4 bottom-4 z-20">
              <span className="inline-flex items-center rounded-full bg-white/95 backdrop-blur-md border border-white px-3 py-1 text-sm font-bold text-slate-900 shadow-sm">
                {currencyCode} {(Number(item?.price || 0) * quantity).toFixed(2)}
              </span>
            </div>
            {/* Gradient Overlay for text readability if needed, though design says -mt-4 pulls white card up */}
          </div>

          {/* Content Body */}
          <div className="flex-1 flex flex-col px-6 pt-6 pb-6 overflow-y-auto">
            <div className="flex flex-col items-center text-center space-y-4">
              <h3 className="text-3xl font-bold text-foreground tracking-tight leading-tight">
                {truncatedName}
              </h3>

              {/* Meta Info Row */}
              <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-medium">
                  Popular
                </span>
                <span className="w-1 h-1 bg-gray-300 rounded-full" />
                <span className="flex items-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  20-30 min
                </span>
              </div>

              <p className="text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
                {item?.description || "No description available for this item."}
              </p>
            </div>
          </div>

          {/* Sticky Action Bar */}
          <div className="bg-white border-t border-gray-100 p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2">
              {/* Quantity Selector - Compact for Mobile */}
              <div className="flex items-center bg-gray-50 p-1 rounded-full border border-gray-100 shrink-0">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                  className={cn(
                    "w-10 h-10 flex items-center justify-center rounded-full shadow-sm transition-colors",
                    quantity <= 1
                      ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                      : "bg-white text-gray-600 hover:bg-gray-50 active:scale-95"
                  )}
                >
                  <Minus className="w-4 h-4" strokeWidth={2.4} />
                </button>
                <span className="w-8 text-center font-bold text-lg tabular-nums text-foreground">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 flex items-center justify-center bg-foreground text-background rounded-full shadow-md hover:bg-black/90 transition-colors active:scale-95"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.4} />
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={isAddingToCart}
                className={cn(
                  "flex-1 h-12 sm:h-14 px-3 text-white font-bold rounded-full flex items-center justify-center gap-2 transition-all active:scale-[0.98] min-w-0",
                  isAddingToCart
                    ? "bg-emerald-500 shadow-xl shadow-emerald-500/25 scale-[1.01]"
                    : "bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20"
                )}
              >
                {isAddingToCart ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-200 animate-pulse" strokeWidth={2.4} />
                    <span className="text-sm sm:text-base font-semibold whitespace-nowrap truncate px-1">Added</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm sm:text-base font-semibold whitespace-nowrap truncate px-1">Add to Cart</span>
                    <span className="text-sm sm:text-base font-bold whitespace-nowrap">
                      {currencyCode} {(Number(item?.price || 0) * quantity).toFixed(2)}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

        </DialogPanel>
      </div>
      <UpsellBottomSheet
        open={upsellOpen}
        suggestions={upsellSuggestions}
        currencyCode={currencyCode}
        onAccept={acceptUpsellSuggestion}
        onDeclineSingle={dismissSingleSuggestion}
        onDismissSingle={dismissCardSuggestion}
        onDismissMany={dismissManySuggestions}
        onExited={handleUpsellExited}
      />
    </Dialog>
  );
};

interface ModalAssistanceProps extends ModalProps {
  confirm: () => void;
  tableName?: string;
}

export const ModalAssistance: React.FC<ModalAssistanceProps> = ({
  isOpen,
  close,
  confirm,
  tableName,
}) => {
  return (
    <Dialog
      open={isOpen}
      onClose={() => close()}
      className="relative z-50 transition duration-300 ease-out data-[closed]:opacity-0"
      transition={true}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm animate-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M12 13v6" />
                <path d="M12 17h.01" />
              </svg>
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Need assistance?
            </h3>
            <p className="text-gray-500 text-sm mb-1">
              Do you want a staff member to come to your table?
            </p>
            {tableName && (
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-6">
                Table {tableName}
              </p>
            )}

            <div className="flex gap-3 w-full">
              <button
                onClick={close}
                className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                className="flex-1 py-3 px-4 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                Confirm
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
