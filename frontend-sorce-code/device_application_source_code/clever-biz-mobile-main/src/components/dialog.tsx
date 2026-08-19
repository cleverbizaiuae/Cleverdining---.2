import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { useEffect, useState } from "react";
import { useCart, type CartItem } from "../context/CartContext";
import toast from "react-hot-toast";
import { motion } from "motion/react";
import { cn } from "clsx-for-tailwind";
import { cachedGet } from "../lib/requestCache";
import { resolveMediaUrl } from "../lib/media";
import { getSessionCurrencyCode } from "../utils/regionSession";
import { OptimizedImage } from "./OptimizedImage";
import { CheckCircle2, Minus, Plus, ShoppingBag, UserRound, X } from "lucide-react";
import {
  fetchUpsellSuggestions,
  prefetchUpsellSuggestions,
  summarizeCart,
} from "../lib/upsellApi";
import { getUpsellExcludedItemIds } from "../lib/upsellSession";
import { getEffectiveItemPrice, getLineTotal, hasItemDiscount } from "../utils/pricing";

interface ModalProps {
  isOpen: boolean;
  close: () => void;
}

export type MenuItemAddedDetail = {
  item: Omit<CartItem, "quantity">;
  nextCart: CartItem[];
  metrics: {
    cartValueAtTime: number;
    cartItemCount: number;
  };
};

interface ModalFoodDetailProps extends ModalProps {
  isOpen: boolean;
  close: () => void;
  itemId?: number;
  initialItem?: any;
  onAddToCart?: (detail: MenuItemAddedDetail) => void;
}

const isUsableMenuItem = (candidate: unknown) => {
  if (!candidate || typeof candidate !== "object") return false;
  const record = candidate as Record<string, unknown>;
  const price = Number(String(record.price || "").replace(/[^0-9.-]/g, ""));
  return (
    Number.isInteger(Number(record.id)) &&
    Number(record.id) > 0 &&
    typeof record.item_name === "string" &&
    record.item_name.trim().length > 0 &&
    Number.isFinite(price) &&
    price > 0
  );
};

export const ModalFoodDetail: React.FC<ModalFoodDetailProps> = ({
  isOpen,
  close,
  itemId,
  initialItem,
  onAddToCart,
}) => {
  const [item, setItem] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const { cart, addToCart } = useCart();
  const currencyCode = getSessionCurrencyCode();
  const effectiveUnitPrice = item ? getEffectiveItemPrice(item) : 0;
  const originalUnitPrice = Number(String(item?.price || "0").replace(/[^0-9.-]/g, "")) || 0;
  const hasDiscount = item ? hasItemDiscount(item) : false;

  const truncatedName = item?.item_name || "Loading...";
  const hasValidItem =
    item &&
    Number.isInteger(Number(item.id)) &&
    Number(item.id) > 0 &&
    typeof item.item_name === "string" &&
    item.item_name.trim().length > 0 &&
    Number.isFinite(Number(String(item.price || "").replace(/[^0-9.-]/g, ""))) &&
    Number(String(item.price || "").replace(/[^0-9.-]/g, "")) > 0;

  useEffect(() => {
    let cancelled = false;
    if (isOpen && itemId) {
      setIsImageLoading(true);
      setLoadError(false);
      if (initialItem) {
        setItem(initialItem);
        setShowVideo(false);
        setQuantity(1);
      } else {
        setItem(null);
      }

      cachedGet(`/api/customer/items/${itemId}/`, { timeout: 3500 }, { ttlMs: 60_000 })
        .then((res) => {
          if (cancelled) return;
          if (isUsableMenuItem(res.data)) {
            setItem(res.data);
            setLoadError(false);
          } else if (!initialItem) {
            setItem(null);
            setLoadError(true);
          } else {
            setLoadError(false);
          }
          setShowVideo(false);
          setQuantity(1);
        })
        .catch(() => {
          if (cancelled) return;
          setLoadError(!initialItem);
          setIsImageLoading(false);
        });
    } else {
      setItem(null);
      setLoadError(false);
      setShowVideo(false);
      setQuantity(1);
      setIsImageLoading(true);
    }
    return () => {
      cancelled = true;
    };
  }, [isOpen, itemId, initialItem]);

  useEffect(() => {
    if (!isOpen || !hasValidItem) return;
    const cartItemIds = Array.from(
      new Set(
        [...cart.map((entry) => Number(entry.id)), Number(item.id)]
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );
    const excludeItemIds = Array.from(
      new Set([...cartItemIds, ...getUpsellExcludedItemIds()])
    );
    void fetchUpsellSuggestions({
      triggerPoint: "add_to_cart",
      sourceItemId: Number(item.id),
      restaurantId: Number(item.restaurant || 0) || undefined,
      limit: 6,
      cartItemIds,
      excludeItemIds,
    }).then((menuSuggestions) => {
      prefetchUpsellSuggestions({
        triggerPoint: "cart",
        sourceItemId: Number(item.id),
        restaurantId: Number(item.restaurant || 0) || undefined,
        limit: 2,
        cartItemIds,
        excludeItemIds: Array.from(
          new Set([
            ...excludeItemIds,
            ...menuSuggestions.map((suggestion) => suggestion.id),
          ])
        ),
      });
    }).catch(() => {
      // The live add action can retry if this background warm misses.
    });
  }, [cart, hasValidItem, isOpen, item]);

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
    if (!hasValidItem || isAddingToCart) {
      toast.error(loadError ? "Could not load this item. Please try another item." : "Please wait for the item to load.");
      return;
    }

    setIsAddingToCart(true);
    const cartItem: Omit<CartItem, "quantity"> = {
      id: Number(item.id),
      item_name: String(item.item_name || "").trim(),
      price: String(item.price || "0"),
      discount_percentage: Number(item.discount_percentage || 0),
      final_price: item.final_price,
      description: String(item.description || ""),
      slug: String(item.slug || ""),
      category: Number(item.category || 0),
      restaurant: Number(item.restaurant || 0),
      category_name: String(item.category_name || ""),
      image1: String(item.image1 || ""),
      availability: item.availability !== false,
      video: String(item.video || ""),
      restaurant_name: String(item.restaurant_name || ""),
    };

    const added = await addToCart(cartItem, quantity);
    if (!added) {
      toast.error("Could not add this item. Please try again.");
      setIsAddingToCart(false);
      return;
    }
    showAddedToCartToast(quantity, item.item_name || "Item");

    const existingCartItem = cart.find((entry) => entry.id === cartItem.id);
    const nextCart = existingCartItem
      ? cart.map((entry) =>
          entry.id === cartItem.id
            ? { ...entry, quantity: entry.quantity + quantity }
            : entry
        )
      : [...cart, { ...cartItem, quantity }];
    const metrics = summarizeCart(nextCart);
    const addedDetail = {
      item: cartItem,
      nextCart,
      metrics,
    };

    window.setTimeout(async () => {
      close();
      if (onAddToCart) onAddToCart(addedDetail);
      setIsAddingToCart(false);
    }, 80);
  };

  return (
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
                {currencyCode} {getLineTotal({ price: effectiveUnitPrice }, quantity).toFixed(2)}
              </span>
              {hasDiscount && (
                <span className="ml-2 inline-flex rounded-full bg-red-500 px-2 py-1 text-[11px] font-bold text-white shadow-sm">
                  {Number(item.discount_percentage).toFixed(0)}% OFF
                </span>
              )}
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
              <div className="flex items-center justify-center text-sm text-muted-foreground">
                <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  Popular
                </span>
              </div>

              <p className="text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
                {loadError ? "Could not load this item. Please close and try again." : item?.description || "No description available for this item."}
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
                  disabled={quantity <= 1 || !hasValidItem}
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
                  disabled={!hasValidItem}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-md transition-colors hover:bg-primary/90 active:scale-90 sm:h-12 sm:w-12"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.4} />
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={isAddingToCart || !hasValidItem}
                className={cn(
                  "flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm font-bold text-white shadow-xl transition-transform active:scale-[0.98] sm:h-16 sm:px-4 sm:text-base",
                  isAddingToCart
                    ? "bg-emerald-500 shadow-xl shadow-emerald-500/25 scale-[1.01]"
                    : !hasValidItem
                      ? "bg-slate-400 text-white shadow-none"
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
                    <span className="shrink-0 font-semibold whitespace-nowrap">{hasValidItem ? "Add" : "Loading"}</span>
                    <span className="flex min-w-0 flex-col items-end leading-tight">
                      <span className="whitespace-nowrap text-sm font-bold sm:text-base">
                        {currencyCode} {getLineTotal({ price: effectiveUnitPrice }, quantity).toFixed(2)}
                      </span>
                      {hasDiscount && (
                        <span className="whitespace-nowrap text-[10px] font-semibold text-white/70 line-through sm:text-xs">
                          {currencyCode} {(originalUnitPrice * quantity).toFixed(2)}
                        </span>
                      )}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

        </DialogPanel>
      </div>
    </Dialog>
  );
};

interface ModalAssistanceProps extends ModalProps {
  confirm: () => void | Promise<void>;
  tableName?: string;
  isRequesting?: boolean;
}

export const ModalAssistance: React.FC<ModalAssistanceProps> = ({
  isOpen,
  close,
  confirm,
  tableName,
  isRequesting = false,
}) => {
  return (
    <Dialog
      open={isOpen}
      onClose={() => close()}
      className="relative z-50 transition duration-300 ease-out data-[closed]:opacity-0"
      transition={true}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/45 backdrop-blur-sm" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="w-[85%] max-w-[320px] overflow-hidden rounded-2xl border border-slate-100 bg-white p-0 text-slate-900 shadow-xl animate-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center px-5 pt-5 pb-4 text-center">
            <UserRound className="mb-3 h-6 w-6 text-[#0055FE]" strokeWidth={1.8} />
            <h3 className="text-base font-bold text-slate-900">Call a Waiter?</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              A staff member will be with you at{" "}
              <span className="font-semibold text-slate-600">{tableName || "your table"}</span> shortly.
            </p>
          </div>

          <div className="flex gap-2.5 px-5 pb-5">
            <button
              onClick={close}
              disabled={isRequesting}
              className="h-9 flex-1 rounded-xl text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void confirm()}
              disabled={isRequesting}
              className="h-9 flex-1 rounded-xl bg-[#0055FE] text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0044dd] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRequesting ? "Calling..." : "Call Waiter"}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
