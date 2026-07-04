import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { useEffect, useRef, useState } from "react";
import { type CartItem, useCart } from "../context/CartContext";
import toast from "react-hot-toast";
import { motion } from "motion/react";
import { cn } from "clsx-for-tailwind";
import { cachedGet } from "../lib/requestCache";
import { resolveMediaUrl } from "../lib/media";
import { getSessionCurrencyCode } from "../utils/regionSession";
import UpsellBottomSheet from "./UpsellBottomSheet";
import { OptimizedImage } from "./OptimizedImage";
import { CheckCircle2, Minus, Plus, ShoppingBag, X } from "lucide-react";
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
  getEffectiveUpsellAggressiveness,
  getUpsellSessionCap,
  getUpsellTriggerLimit,
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
  const [upsellTriggerItem, setUpsellTriggerItem] = useState<any>(null);
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
      cachedGet(`/api/customer/items/${itemId}/`, {}, { ttlMs: 60_000 }).then((res) => {
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
            "pointer-events-auto w-[calc(100vw-24px)] max-w-[360px] rounded-2xl bg-card border border-border shadow-xl shadow-black/30 px-4 py-3",
            "transition-all duration-250",
            t.visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
          )}
        >
          <p className="text-sm font-semibold text-foreground">Added to cart</p>
          <p className="text-xs text-muted-foreground mt-0.5">
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
    const added = await addToCart(item, quantity);
    if (!added) {
      toast.error("Could not add this item. Please try again.");
      setIsAddingToCart(false);
      return;
    }
    showAddedToCartToast(quantity, item.item_name || "Item");

    const nextCart = [...cart, { ...item, quantity }];
    const metrics = summarizeCart(nextCart);
    setUpsellCartMetrics(metrics);
    setUpsellTriggerItem(item);
    upsellSourceItemIdRef.current = Number(item.id);
    upsellSourceItemIdsRef.current = nextCart.map((cartItem) => Number(cartItem.id)).filter((id) => Number.isInteger(id) && id > 0);

    window.setTimeout(async () => {
      close();
      if (onAddToCart) onAddToCart();
      setIsAddingToCart(false);

      try {
        const settingsSnapshot = await fetchUpsellSettings().catch(() => null);
        if (settingsSnapshot) setUpsellSettings(settingsSnapshot);
        const effectiveAggressiveness = getEffectiveUpsellAggressiveness(settingsSnapshot?.aggressiveness || "moderate");
        const suggestionLimit = 1;
        const candidateLimit = 6;
        const triggerLimit = Math.max(2, getUpsellTriggerLimit("add_to_cart", effectiveAggressiveness));
        const sessionLimit = getUpsellSessionCap(effectiveAggressiveness);

        if (upsellActiveRef.current || !canShowUpsellTouchpoint("add_to_cart", triggerLimit, sessionLimit)) {
          return;
        }

        const shouldRender =
          (settingsSnapshot?.enabled ?? upsellSettings?.enabled ?? true) &&
          (settingsSnapshot?.show_after_add_to_cart ?? upsellSettings?.show_after_add_to_cart ?? true);

        if (!shouldRender) return;
        const rawSuggestions = await fetchUpsellSuggestions({
          triggerPoint: "add_to_cart",
          sourceItemId: Number(item.id),
          limit: candidateLimit,
          cartItemIds: nextCart.map((cartItem) => Number(cartItem.id)).filter((id) => Number.isInteger(id) && id > 0),
          excludeItemIds: nextCart.map((cartItem) => Number(cartItem.id)).filter((id) => Number.isInteger(id) && id > 0),
        });
        const cartCategoryIds = new Set(
          nextCart
            .map((cartItem) => Number(cartItem.category))
            .filter((categoryId) => Number.isInteger(categoryId) && categoryId > 0)
        );
        const suggestions = rawSuggestions
          .filter((suggestion) => {
            const suggestionCategoryId = Number(suggestion.category);
            return !Number.isInteger(suggestionCategoryId) || suggestionCategoryId <= 0 || !cartCategoryIds.has(suggestionCategoryId);
          })
          .slice(0, suggestionLimit);

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
    const added = await addToCart(toCartItemFromUpsell(suggestion), 1);
    if (!added) {
      toast.error("Could not add this suggestion. Please try again.");
      return;
    }
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

  const declineSingleSuggestion = async (suggestion: UpsellSuggestion) => {
    setUpsellOpen(false);
    pendingUpsellActionRef.current = async () => {
      if (suggestion.id) {
        markUpsellItemDismissed(suggestion.id);
      }
      if (suggestion.category) {
        trackUpsellCategoryDecline(suggestion.category, 1);
      }
      await Promise.allSettled([
        logUpsellEvent({
          triggerPoint: "add_to_cart",
          action: "declined",
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
      trackUpsellCategoryDecline(suggestion.category, 0.5);
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
          trackUpsellCategoryDecline(suggestion.category, 0.5);
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
    setUpsellTriggerItem(null);
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
    <>
    <Dialog open={isOpen} onClose={() => close()} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300" />
      <div className="fixed inset-0 flex w-screen items-center justify-center sm:p-6">
        <DialogPanel className="relative mx-auto flex h-full w-full max-w-lg flex-col overflow-hidden border-none bg-background p-0 text-foreground shadow-2xl animate-in slide-in-from-bottom-8 duration-300 sm:h-auto sm:max-h-[90vh] sm:rounded-3xl">

          {/* Hero Media Area */}
          <div className="relative h-[40vh] w-full shrink-0 bg-black sm:h-80">
            {/* Back Button */}
            <button
              onClick={close}
              className="absolute top-4 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-md transition-colors hover:bg-black/40"
            >
              <X className="h-5 w-5" strokeWidth={1.8} />
            </button>

            {showVideo && item?.video ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full h-full relative"
              >
                <video
                  src={resolveMediaUrl(item.video, "")}
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
                    src={resolveMediaUrl(item.video, "")}
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
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-secondary">
                          <div className="w-10 h-10 border-4 border-white/10 border-t-primary rounded-full animate-spin"></div>
                        </div>
                      )}

                      <OptimizedImage
                        src={item?.image1}
                        alt={item?.item_name || "Food Item"}
                        width={600}
                        height={400}
                        className={cn(
                          "w-full h-full object-cover transition-opacity duration-500",
                          isImageLoading ? "opacity-0" : "opacity-100"
                        )}
                        onLoad={() => setIsImageLoading(false)}
                        onError={() => {
                          setIsImageLoading(false);
                        }}
                      />
                    </div>
                  </>
                )}
                {/* Fallback Div (Hidden by default, shown on error) */}
                <div className="fallback-placeholder hidden absolute inset-0 flex flex-col items-center justify-center bg-secondary text-muted-foreground">
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
          <div className="relative z-10 -mt-4 flex flex-1 flex-col overflow-y-auto rounded-t-3xl bg-background px-6 pb-6 pt-6">
            <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-white/15" />
            <div className="flex flex-col items-center text-center space-y-4">
              <h3 className="text-3xl font-bold text-foreground tracking-tight leading-tight">
                {truncatedName}
              </h3>

              {/* Meta Info Row */}
              <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  Popular
                </span>
                <span className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
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
          <div className="border-t border-border bg-background p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2">
              {/* Quantity Selector - Compact for Mobile */}
              <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-secondary/70 p-1.5 sm:gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full shadow-sm transition-colors active:scale-90 sm:h-12 sm:w-12",
                    quantity <= 1
                      ? "bg-white/5 text-muted-foreground/40 cursor-not-allowed"
                      : "bg-card text-foreground hover:bg-white/10 active:scale-95"
                  )}
                >
                  <Minus className="w-4 h-4" strokeWidth={2.4} />
                </button>
                <span className="w-6 text-center text-lg font-bold tabular-nums text-foreground sm:w-8 sm:text-xl">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-md transition-colors hover:bg-primary/90 active:scale-90 sm:h-12 sm:w-12"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.4} />
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={isAddingToCart}
                className={cn(
                  "flex h-14 min-w-0 flex-1 items-center justify-center gap-2 truncate rounded-full px-4 text-sm font-bold text-white shadow-xl transition-transform active:scale-[0.98] sm:h-16 sm:text-base",
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
                    <ShoppingBag className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" strokeWidth={1.8} />
                    <span className="truncate px-1 font-semibold whitespace-nowrap">Add</span>
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
    </Dialog>
    <UpsellBottomSheet
        open={upsellOpen}
        suggestions={upsellSuggestions}
        triggerItem={upsellTriggerItem}
        currencyCode={currencyCode}
        onAccept={acceptUpsellSuggestion}
        onDeclineSingle={declineSingleSuggestion}
        onDismissSingle={dismissCardSuggestion}
        onDismissMany={dismissManySuggestions}
        onExited={handleUpsellExited}
      />
    </>
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
      <DialogBackdrop className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl shadow-black/40 animate-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
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

            <h3 className="text-xl font-bold text-foreground mb-2">
              Need Assistance?
            </h3>
            <p className="text-muted-foreground text-sm mb-1">
              Do you want a staff member to come to your table?
            </p>
            {tableName && (
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-6">
                Table {tableName}
              </p>
            )}

            <div className="flex w-full flex-col gap-3">
              <button
                onClick={confirm}
                className="h-12 w-full rounded-xl bg-primary px-4 text-white font-bold transition-colors hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-[0.98]"
              >
                Call Waiter
              </button>
              <button
                onClick={close}
                className="h-12 w-full rounded-xl border border-border px-4 text-secondary-foreground font-medium transition-colors hover:bg-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
