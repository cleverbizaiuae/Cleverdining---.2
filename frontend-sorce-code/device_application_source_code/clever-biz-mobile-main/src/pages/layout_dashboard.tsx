/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ModalFoodDetail,
  ModalAssistance,
  type MenuItemAddedDetail,
} from "@/components/dialog";
import UpsellBottomSheet from "@/components/UpsellBottomSheet";
import { useWebSocket } from "@/components/WebSocketContext";
import { cn } from "clsx-for-tailwind";
import { motion, AnimatePresence } from "motion/react";
import toast from "react-hot-toast";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { CartProvider, type CartItem, useCart } from "../context/CartContext";
import { type CategoryItemType, CategoryItem } from "./dashboard/category-item";
import { FoodItemTypes } from "./dashboard/food-items";
import { FoodItemCard } from "./dashboard/food-item-card";
import { BottomNav } from "@/components/BottomNav";
import { Facebook, Globe, Instagram, Loader2, Music2, Search, Twitter, UtensilsCrossed } from "lucide-react";
import { Logo } from "@/components/icons/brandLogo";
import { Footer } from "../components/Footer";
import {
  canShowUpsellSession,
  incrementUpsellTouchpointCount,
  getUpsellExcludedItemIds,
  markUpsellItemAccepted,
  markUpsellItemDismissed,
  markUpsellItemsShown,
  trackUpsellCategoryDecline,
  trackUpsellCategoryView,
} from "../lib/upsellSession";
import {
  fetchUpsellSettings,
  fetchUpsellSuggestions,
  logUpsellAssociationStat,
  logUpsellEvent,
  logUpsellShownBatch,
  prefetchUpsellSuggestions,
  type UpsellSettingsSnapshot,
  type UpsellSuggestion,
} from "../lib/upsellApi";
import { FONT_PRESETS, shouldRenderBrandExperience, useActiveBrandConfig } from "@/lib/useBrandConfig";
import { cachedGet, invalidateApiCache } from "@/lib/requestCache";
import { getSessionCurrencyCode } from "../utils/regionSession";
import { getEffectiveItemPrice } from "../utils/pricing";

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = (hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `rgba(0, 85, 254, ${alpha})`;
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToHsl(hex: string): string {
  const cleaned = (hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return "221 100% 50%";
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        hue = ((b - r) / d + 2) / 6;
        break;
      default:
        hue = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return `${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(lum * 100)}%`;
}

function getFontFamily(fontPreset: string): string {
  return FONT_PRESETS.find((font) => font.value === fontPreset)?.family || FONT_PRESETS[0].family;
}

const toCartItemFromUpsell = (suggestion: UpsellSuggestion): Omit<CartItem, "quantity"> => ({
  id: suggestion.id,
  item_name: suggestion.item_name,
  price: String(suggestion.price ?? "0"),
  discount_percentage: Number(suggestion.discount_percentage || 0),
  final_price: suggestion.final_price,
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

const getRestaurantIdFromStorage = (): number | null => {
  try {
    const userInfo = localStorage.getItem("userInfo");
    if (!userInfo) return null;
    const parsedUserInfo = JSON.parse(userInfo);
    const restaurantId = parsedUserInfo?.user?.restaurants?.[0]?.id;
    return Number.isFinite(Number(restaurantId)) ? Number(restaurantId) : null;
  } catch {
    return null;
  }
};

const normalizeListPayload = <T,>(payload: any): T[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const getMenuCacheKey = (restaurantId: number | null | undefined, kind: "categories" | "items") =>
  `cb:menu:v2:${restaurantId || "unknown"}:${kind}`;

const MENU_CACHE_MAX_AGE_MS = 5 * 60_000;

const readMenuCache = <T,>(restaurantId: number | null | undefined, kind: "categories" | "items"): T[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(getMenuCacheKey(restaurantId, kind)) || "null");
    if (!parsed || !Array.isArray(parsed.rows) || !Number.isFinite(Number(parsed.savedAt))) return [];
    if (Date.now() - Number(parsed.savedAt) > MENU_CACHE_MAX_AGE_MS) return [];
    return parsed.rows as T[];
  } catch {
    return [];
  }
};

const writeMenuCache = (restaurantId: number | null | undefined, kind: "categories" | "items", value: unknown[]) => {
  if (!restaurantId || !Array.isArray(value) || value.length === 0) return;
  try {
    localStorage.setItem(
      getMenuCacheKey(restaurantId, kind),
      JSON.stringify({ savedAt: Date.now(), rows: value })
    );
  } catch {
    // Local cache is an enhancement only.
  }
};

const MenuCartReconciler = ({
  items,
  restaurantId,
  ready,
}: {
  items: FoodItemTypes[];
  restaurantId: number | null;
  ready: boolean;
}) => {
  const { reconcileCartWithMenu } = useCart();

  useEffect(() => {
    if (!ready || !restaurantId || !items.length) return;
    reconcileCartWithMenu(
      items.map((item) => ({
        id: item.id,
        item_name: item.item_name,
        price: String(item.price),
        discount_percentage: Number(item.discount_percentage || 0),
        description: item.description || "",
        slug: item.slug || "",
        category: Number(item.category || 0),
        restaurant: Number(item.restaurant || restaurantId || 0),
        category_name: item.category_name || "",
        image1: item.image1 || "",
        availability: item.availability !== false,
        video: item.video || "",
        restaurant_name: item.restaurant_name || "",
      })),
      restaurantId
    );
  }, [items, ready, reconcileCartWithMenu, restaurantId]);

  return null;
};

const MenuUpsellPrimer = ({ items }: { items: FoodItemTypes[] }) => {
  const { cart } = useCart();
  const cartItemIds = useMemo(
    () => cart.map((item) => Number(item.id)).filter((id) => Number.isInteger(id) && id > 0),
    [cart]
  );
  const cartFingerprint = cartItemIds.join(",");

  useEffect(() => {
    if (!items.length) return;
    let cancelled = false;
    let timer: number | null = null;
    const wait = (delayMs: number) => new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, delayMs);
    });
    const primeVisibleItems = async () => {
      await wait(180);
      const visibleItems = items
        .filter((item) => item.availability !== false && Number(item.id) > 0)
        .slice(0, 8);
      for (const item of visibleItems) {
        if (cancelled) return;
        const nextCartItemIds = Array.from(new Set([...cartItemIds, Number(item.id)]));
        const excludeItemIds = Array.from(
          new Set([...nextCartItemIds, ...getUpsellExcludedItemIds()])
        );
        try {
          await fetchUpsellSuggestions({
            triggerPoint: "add_to_cart",
            sourceItemId: Number(item.id),
            restaurantId: Number(item.restaurant || 0) || undefined,
            limit: 6,
            cartItemIds: nextCartItemIds,
            excludeItemIds,
          });
        } catch {
          // The selected item detail and live add request will retry.
        }
        if (!cancelled) await wait(120);
      }
    };
    void primeVisibleItems();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [cartFingerprint, items]);

  return null;
};

const MenuPageUpsellHost = ({ pendingDetail }: { pendingDetail: MenuItemAddedDetail | null }) => {
  const { addToCart } = useCart();
  const location = useLocation();
  const currencyCode = getSessionCurrencyCode();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<UpsellSuggestion[]>([]);
  const [triggerItem, setTriggerItem] = useState<any>(null);
  const [settings, setSettings] = useState<UpsellSettingsSnapshot | null>(null);
  const [cartMetrics, setCartMetrics] = useState({ cartValueAtTime: 0, cartItemCount: 0 });
  const sourceItemIdRef = useRef<number | null>(null);
  const sourceItemIdsRef = useRef<number[]>([]);
  const activeRef = useRef(false);
  const requestSeqRef = useRef(0);
  const shownSignatureRef = useRef("");
  const processedPendingDetailRef = useRef("");
  const pendingActionRef = useRef<null | (() => Promise<void>)>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUpsellSettings({ force: true })
      .then((snapshot) => {
        if (!cancelled) setSettings(snapshot);
      })
      .catch(() => {
        // Keep default behavior if settings are temporarily unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const closeActiveSheet = useCallback(() => {
    requestSeqRef.current += 1;
    activeRef.current = false;
    pendingActionRef.current = null;
    setLoading(false);
    setOpen(false);
    setSuggestions([]);
    setTriggerItem(null);
  }, []);

  useEffect(() => {
    if (open || suggestions.length) {
      closeActiveSheet();
    }
  }, [closeActiveSheet, location.pathname]);

  useEffect(() => {
    window.addEventListener("cleverbiz:upsell-sheet-close", closeActiveSheet);
    return () => window.removeEventListener("cleverbiz:upsell-sheet-close", closeActiveSheet);
  }, [closeActiveSheet]);

  const recordShown = useCallback(
    (
      shownItems: UpsellSuggestion[],
      item: any,
      cartItemIds: number[],
      metrics: { cartValueAtTime: number; cartItemCount: number },
      source: "llm"
    ) => {
      if (!shownItems.length) return;
      const signature = [
        source,
        item?.id || "unknown",
        cartItemIds.join(","),
        shownItems.map((suggestion) => suggestion.id).join(","),
      ].join(":");
      if (shownSignatureRef.current === signature) return;
      shownSignatureRef.current = signature;

      markUpsellItemsShown(shownItems.map((suggestion) => suggestion.id));
      incrementUpsellTouchpointCount("add_to_cart", shownItems.length);
      void logUpsellShownBatch({
        triggerPoint: "add_to_cart",
        suggestions: shownItems,
        cartValueAtTime: metrics.cartValueAtTime,
        cartItemCount: metrics.cartItemCount,
        metadata: { source_item_id: item.id, source_category_id: item.category, surface: "menu_page", source },
      });
      void Promise.allSettled(
        shownItems.map((suggestion) =>
          logUpsellAssociationStat({
            triggerPoint: "add_to_cart",
            action: "shown",
            sourceItemId: Number(item.id),
            sourceItemIds: cartItemIds,
            upsellItemId: suggestion.id,
            metadata: { source_category_id: item.category, surface: "menu_page", source },
          })
        )
      );
    },
    []
  );

  const handleMenuItemAddedDetail = useCallback(
    (detail?: MenuItemAddedDetail) => {
      const item = detail?.item;
      const nextCart = Array.isArray(detail?.nextCart) ? detail.nextCart : [];
      const metrics = detail?.metrics || { cartValueAtTime: 0, cartItemCount: 0 };

      if (!item?.id || !nextCart.length) return;
      const requestId = requestSeqRef.current + 1;
      requestSeqRef.current = requestId;
      pendingActionRef.current = null;
      shownSignatureRef.current = "";
      if (activeRef.current) {
        setOpen(false);
      }

      const cartItemIds = nextCart
        .map((cartItem) => Number(cartItem.id))
        .filter((id) => Number.isInteger(id) && id > 0);
      const excludedItemIds = Array.from(new Set([...cartItemIds, ...getUpsellExcludedItemIds()]));
      setTriggerItem(item);
      setCartMetrics(metrics);
      sourceItemIdRef.current = Number(item.id);
      sourceItemIdsRef.current = cartItemIds;

      const shouldOpenImmediately =
        (settings?.enabled ?? true) &&
        (settings?.show_after_add_to_cart ?? true) &&
        canShowUpsellSession(settings?.aggressiveness || "moderate");

      activeRef.current = shouldOpenImmediately;
      setLoading(shouldOpenImmediately);
      setSuggestions([]);
      setOpen(shouldOpenImmediately);

      const settingsPromise = fetchUpsellSettings({ force: true }).catch(() => null);
      const suggestionPromise = fetchUpsellSuggestions({
        triggerPoint: "add_to_cart",
        sourceItemId: Number(item.id),
        restaurantId: Number(item.restaurant || 0) || undefined,
        limit: 6,
        cartItemIds,
        excludeItemIds: excludedItemIds,
      }, { force: true });

      void Promise.all([settingsPromise, suggestionPromise])
        .then(([settingsSnapshot, rawSuggestions]) => {
          if (requestSeqRef.current !== requestId) return [];
          if (settingsSnapshot) setSettings(settingsSnapshot);
          if (
            settingsSnapshot &&
            (
              !settingsSnapshot.enabled ||
              !settingsSnapshot.show_after_add_to_cart ||
              !canShowUpsellSession(settingsSnapshot.aggressiveness || "moderate")
            )
          ) {
            setLoading(false);
            setOpen(false);
            setSuggestions([]);
            activeRef.current = false;
            return [];
          }
          const remoteSuggestions = Array.isArray(rawSuggestions) ? rawSuggestions.slice(0, 1) : [];
          if (!remoteSuggestions.length) {
            // Mandatory add-to-cart decisions never use a client-side item fallback.
            setSuggestions([]);
            setLoading(false);
            setOpen(false);
            activeRef.current = false;
            return;
          }
          setLoading(false);
          setSuggestions(remoteSuggestions);
          activeRef.current = true;
          setOpen(true);
          recordShown(remoteSuggestions, item, cartItemIds, metrics, "llm");
          prefetchUpsellSuggestions({
            triggerPoint: "cart",
            sourceItemId: Number(item.id),
            restaurantId: Number(item.restaurant || 0) || undefined,
            limit: 2,
            cartItemIds,
            excludeItemIds: Array.from(
              new Set([
                ...cartItemIds,
                ...getUpsellExcludedItemIds(),
                ...remoteSuggestions.map((suggestion) => suggestion.id),
              ])
            ),
          });
          return remoteSuggestions;
        })
        .catch(() => {
          if (requestSeqRef.current !== requestId) return;
          setSuggestions([]);
          setLoading(false);
          setOpen(false);
          activeRef.current = false;
        });
    },
    [recordShown, settings]
  );

  useEffect(() => {
    if (pendingDetail) {
      const signature = [
        pendingDetail.item?.id || "unknown",
        pendingDetail.metrics?.cartItemCount || 0,
        pendingDetail.metrics?.cartValueAtTime || 0,
        (pendingDetail.nextCart || []).map((item) => `${item.id}:${item.quantity || 1}`).join(","),
      ].join(":");
      if (processedPendingDetailRef.current === signature) return;
      processedPendingDetailRef.current = signature;
      void handleMenuItemAddedDetail(pendingDetail);
    }
  }, [handleMenuItemAddedDetail, pendingDetail]);

  useEffect(() => {
    const handleMenuItemAdded = (event: Event) => {
      void handleMenuItemAddedDetail((event as CustomEvent<MenuItemAddedDetail>).detail);
    };
    window.addEventListener("cleverbiz:menu-item-added", handleMenuItemAdded);
    return () => window.removeEventListener("cleverbiz:menu-item-added", handleMenuItemAdded);
  }, [handleMenuItemAddedDetail]);

  const acceptSuggestion = async (suggestion: UpsellSuggestion) => {
    requestSeqRef.current += 1;
    pendingActionRef.current = null;
    activeRef.current = false;
    setLoading(false);
    setOpen(false);
    setSuggestions([]);
    setTriggerItem(null);
    const added = await addToCart(toCartItemFromUpsell(suggestion), 1);
    if (!added) {
      toast.error("Could not add this suggestion. Please try again.");
      return;
    }
    toast.success(`${suggestion.item_name} added to cart`);
    markUpsellItemAccepted(suggestion.id);
    const nextCartItemIds = Array.from(
      new Set([...sourceItemIdsRef.current, suggestion.id])
    );
    prefetchUpsellSuggestions({
      triggerPoint: "cart",
      sourceItemId: suggestion.id,
      restaurantId: Number(suggestion.restaurant || triggerItem?.restaurant || 0) || undefined,
      limit: 2,
      cartItemIds: nextCartItemIds,
      excludeItemIds: Array.from(
        new Set([...nextCartItemIds, ...getUpsellExcludedItemIds()])
      ),
    });
    void Promise.allSettled([
      logUpsellEvent({
        triggerPoint: "add_to_cart",
        action: "accepted",
        suggestion,
        cartValueAtTime: cartMetrics.cartValueAtTime,
        cartItemCount: cartMetrics.cartItemCount,
        metadata: { surface: "menu_page" },
      }),
      logUpsellAssociationStat({
        triggerPoint: "add_to_cart",
        action: "accepted",
        sourceItemId: sourceItemIdRef.current || undefined,
        sourceItemIds: sourceItemIdsRef.current,
        upsellItemId: suggestion.id,
        upsellPrice: getEffectiveItemPrice(suggestion),
        metadata: { surface: "menu_page" },
      }),
    ]);
  };

  const declineSuggestion = async (suggestion: UpsellSuggestion) => {
    requestSeqRef.current += 1;
    setOpen(false);
    pendingActionRef.current = async () => {
      markUpsellItemDismissed(suggestion.id);
      if (suggestion.category) {
        trackUpsellCategoryDecline(suggestion.category, 1);
      }
      await Promise.allSettled([
        logUpsellEvent({
          triggerPoint: "add_to_cart",
          action: "declined",
          suggestion,
          cartValueAtTime: cartMetrics.cartValueAtTime,
          cartItemCount: cartMetrics.cartItemCount,
          metadata: { surface: "menu_page" },
        }),
        logUpsellAssociationStat({
          triggerPoint: "add_to_cart",
          action: "dismissed",
          sourceItemId: sourceItemIdRef.current || undefined,
          sourceItemIds: sourceItemIdsRef.current,
          upsellItemId: suggestion.id,
          metadata: { surface: "menu_page" },
        }),
      ]);
    };
  };

  const dismissSingle = async (suggestion: UpsellSuggestion) => {
    requestSeqRef.current += 1;
    markUpsellItemDismissed(suggestion.id);
    if (suggestion.category) {
      trackUpsellCategoryDecline(suggestion.category, 0.5);
    }
    setSuggestions((current) => {
      const remaining = current.filter((row) => row.id !== suggestion.id);
      if (remaining.length === 0) setOpen(false);
      return remaining;
    });
    void Promise.allSettled([
      logUpsellEvent({
        triggerPoint: "add_to_cart",
        action: "dismissed",
        suggestion,
        cartValueAtTime: cartMetrics.cartValueAtTime,
        cartItemCount: cartMetrics.cartItemCount,
        metadata: { surface: "menu_page" },
      }),
      logUpsellAssociationStat({
        triggerPoint: "add_to_cart",
        action: "dismissed",
        sourceItemId: sourceItemIdRef.current || undefined,
        sourceItemIds: sourceItemIdsRef.current,
        upsellItemId: suggestion.id,
        metadata: { surface: "menu_page" },
      }),
    ]);
  };

  const dismissMany = async (items: UpsellSuggestion[]) => {
    requestSeqRef.current += 1;
    setOpen(false);
    pendingActionRef.current = async () => {
      const tasks: Promise<unknown>[] = [];
      items.forEach((suggestion) => {
        markUpsellItemDismissed(suggestion.id);
        if (suggestion.category) {
          trackUpsellCategoryDecline(suggestion.category, 0.5);
        }
        tasks.push(
          logUpsellEvent({
            triggerPoint: "add_to_cart",
            action: "dismissed",
            suggestion,
            cartValueAtTime: cartMetrics.cartValueAtTime,
            cartItemCount: cartMetrics.cartItemCount,
            metadata: { surface: "menu_page" },
          })
        );
        tasks.push(
          logUpsellAssociationStat({
            triggerPoint: "add_to_cart",
            action: "dismissed",
            sourceItemId: sourceItemIdRef.current || undefined,
            sourceItemIds: sourceItemIdsRef.current,
            upsellItemId: suggestion.id,
            metadata: { surface: "menu_page" },
          })
        );
      });
      await Promise.allSettled(tasks);
    };
  };

  const handleExited = () => {
    setSuggestions([]);
    setTriggerItem(null);
    activeRef.current = false;
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) {
      window.setTimeout(() => {
        void action();
      }, 420);
    }
  };

  return (
    <UpsellBottomSheet
      open={open}
      loading={loading}
      suggestions={suggestions}
      triggerItem={triggerItem}
      currencyCode={currencyCode}
      onAccept={acceptSuggestion}
      onDeclineSingle={declineSuggestion}
      onDismissSingle={dismissSingle}
      onDismissMany={dismissMany}
      onClose={closeActiveSheet}
      onExited={handleExited}
    />
  );
};

const LayoutDashboard = () => {
  const location = useLocation();



  const isSubRoute = location.pathname !== "/dashboard" && location.pathname !== "/splash";

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [categories, setCategories] = useState<CategoryItemType[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [isDetailOpen, setDetailOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<FoodItemTypes | null>(null);
  const [menuUpsellDetail, setMenuUpsellDetail] = useState<MenuItemAddedDetail | null>(null);
  const [isAssistanceOpen, setAssistanceOpen] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  useEffect(() => {
    if (isSubRoute) {
      setMenuUpsellDetail(null);
    }
  }, [isSubRoute]);

  const subCategories = useMemo(() => {
    let activeCategoryIndex = selectedCategory;
    if (activeCategoryIndex === null && categories.length > 0) {
      const firstParent = categories.find(c => !c.parent_category);
      if (firstParent) activeCategoryIndex = categories.indexOf(firstParent);
    }

    if (activeCategoryIndex !== null && categories[activeCategoryIndex]) {
      const mainCatId = categories[activeCategoryIndex].id;
      return categories.filter(c => Number(c.parent_category) === Number(mainCatId));
    }
    return [];
  }, [selectedCategory, categories]);

  // Access WebSocket context to use setNewMessageFlag and sendMessage
  const { ws, setNewMessageFlag, sendMessage } = useWebSocket();
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  // Listen for WebSocket messages to trigger refetch
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.type === 'item_created' ||
          data.type === 'item_updated' ||
          data.type === 'item_deleted' ||
          data.type === 'category_created' ||
          data.type === 'category_updated' ||
          data.type === 'category_deleted'
        ) {
          invalidateApiCache("customer/categories");
          invalidateApiCache("customer/items");
          setLastUpdate(Date.now());
        }
      } catch (e) {
        console.error("Error parsing websocket message", e);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

  // Check localStorage for newMessage flag when component mounts
  useEffect(() => {
    const newMessage = localStorage.getItem("newMessage");
    if (newMessage === "true") {
      setHasNewMessage(true);
    }
    // Listen for changes to the newMessage flag in localStorage
    const handleStorageChange = () => {
      const newMessage = localStorage.getItem("newMessage");
      if (newMessage === "true") {
        setHasNewMessage(true);
      } else {
        setHasNewMessage(false);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const handleMessageClick = () => {
    setHasNewMessage(false);
    // When clicked, clear the newMessage flag from localStorage
    localStorage.setItem("newMessage", "false");
    navigate("/dashboard/message");
  };

  const [items, setItems] = useState<FoodItemTypes[]>([]);
  const [search, setSearch] = useState("");
  const searchTimeout = useRef<any>(null);
  const [tableName, setTableName] = useState("");

  const [restaurantId, setRestaurantId] = useState<number | null>(null);
  const brand = useActiveBrandConfig();

  const hasBranding = shouldRenderBrandExperience(brand);
  const restaurantName =
    hasBranding && brand.restaurantName
      ? brand.restaurantName
      : "Welcome";
  const brandLogoUrl = hasBranding ? brand.logoUrl : null;
  const brandCoverUrl = hasBranding ? brand.coverImageUrl : null;
  const brandFontFamily = brand.brandingEnabled ? getFontFamily(brand.fontPreset) : undefined;
  const brandPrimaryHsl = useMemo(() => hexToHsl(brand.primaryColor), [brand.primaryColor]);

  const socialLinks = useMemo(
    () =>
      [
        { key: "instagram", href: brand.instagramUrl, Icon: Instagram, label: "Instagram" },
        { key: "facebook", href: brand.facebookUrl, Icon: Facebook, label: "Facebook" },
        { key: "tiktok", href: brand.tiktokUrl, Icon: Music2, label: "TikTok" },
        { key: "twitter", href: brand.twitterUrl, Icon: Twitter, label: "X" },
        { key: "website", href: brand.websiteUrl, Icon: Globe, label: "Website" },
      ].filter((entry) => entry.href),
    [brand.facebookUrl, brand.instagramUrl, brand.tiktokUrl, brand.twitterUrl, brand.websiteUrl]
  );

  const splashGradient = useMemo(() => {
    if (brand.themePreset === "luxury_dark") {
      return "linear-gradient(160deg, #0f0f0f 0%, #1a1a2e 100%)";
    }
    if (brand.themePreset === "warm_casual") {
      return "linear-gradient(160deg, #7c2d12 0%, #c2410c 100%)";
    }
    return `linear-gradient(160deg, ${hexToRgba(brand.primaryColor, 0.87)} 0%, ${brand.primaryColor} 100%)`;
  }, [brand.primaryColor, brand.themePreset]);

  const [coverImgFailed, setCoverImgFailed] = useState(false);
  useEffect(() => {
    setCoverImgFailed(false);
  }, [brandCoverUrl]);

  useEffect(() => {
    const storedUserInfo = localStorage.getItem("userInfo");
    const storedGuestToken = localStorage.getItem("guest_session_token");
    if (!storedUserInfo && !storedGuestToken) {
      // Dynamic Bootstrapping: Fetch valid restaurant and device from API
      const bootstrapSession = async () => {
        try {
          // 1. Fetch Restaurants
          const resResponse = await cachedGet("/api/customer/restaurants/", {}, { ttlMs: 60_000 });
          const restaurants = resResponse.data;

          if (restaurants && restaurants.length > 0) {
            const firstRestaurant = restaurants[0];

            // 2. Fetch Devices for the first restaurant
            const devResponse = await cachedGet(`/api/customer/devices/?restaurant_id=${firstRestaurant.id}`, {}, { ttlMs: 60_000 });
            const devices = devResponse.data;

            if (devices && devices.length > 0) {
              const firstDevice = devices[0];

              // Redirect to login to generate real session token
              window.location.href = `/login?id=${firstDevice.id}&table=${firstDevice.table_name}`;
              return; // Stop execution
            } else {
              console.error("No devices found for restaurant", firstRestaurant.name);
            }
          } else {
            console.error("No active restaurants found.");
          }
        } catch (error) {
          console.error("Failed to bootstrap session:", error);
        }
      };

      bootstrapSession();
    }
  }, []);

  useEffect(() => {
    const fetchRestaurantId = () => {
      const storedRestaurantId = getRestaurantIdFromStorage();
      if (storedRestaurantId) {
        setRestaurantId(storedRestaurantId);
      }
    };
    fetchRestaurantId();
  }, []);

  const fetchCategories = async () => {
    const targetId = getRestaurantIdFromStorage() || restaurantId;
    const cachedCategories = readMenuCache<CategoryItemType>(targetId, "categories");
    if (cachedCategories.length) {
      setCategories(cachedCategories);
      setCategoriesLoaded(true);
    }

    try {
      const url = targetId ? `/api/customer/categories/?restaurant_id=${targetId}` : "/api/customer/categories/";
      const response = await cachedGet(url, {}, { ttlMs: 30_000 });
      const nextCategories = normalizeListPayload<CategoryItemType>(response.data);
      if (nextCategories.length) {
        setCategories(nextCategories);
        writeMenuCache(targetId, "categories", nextCategories);
      } else if (!cachedCategories.length) {
        setCategories([]);
      }
    } catch (error) {
      console.warn("Failed to fetch categories", error);
    } finally {
      setCategoriesLoaded(true);
    }
  };
  useEffect(() => {
    fetchCategories();
  }, [lastUpdate]);

  const fetchItems = async () => {
    const targetId = getRestaurantIdFromStorage() || restaurantId;
    const cachedItems = readMenuCache<FoodItemTypes>(targetId, "items");
    const hasVisibleItems = items.length > 0 || cachedItems.length > 0;
    if (!hasVisibleItems) {
      setItemsLoaded(false);
    } else {
      setItemsLoaded(true);
    }
    if (!items.length && cachedItems.length) {
      setItems(cachedItems);
    }

    try {
      let url = "/api/customer/items/";
      const params = ["page_size=500"];

      if (targetId) {
        params.push(`restaurant_id=${targetId}`);
      }

      if (search) {
        params.push(`search=${encodeURIComponent(search)}`);
      }
      if (params.length > 0) {
        url += `?${params.join("&")}`;
      }

      const response = await cachedGet(url, {}, { ttlMs: 8_000 });
      const nextItems = normalizeListPayload<FoodItemTypes>(response.data);
      if (nextItems.length || !cachedItems.length) {
        setItems(nextItems);
      }
      if (nextItems.length) {
        if (!search.trim()) {
          writeMenuCache(targetId, "items", nextItems);
        }
      }
    } catch (error) {
      console.warn("Failed to fetch items", error);
    } finally {
      setItemsLoaded(true);
    }
  };

  useEffect(() => {
    if (!categoriesLoaded) return;

    // Search input remains debounced, while initial load and category changes
    // fetch immediately so the menu does not add an artificial 300ms delay.
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchItems();
    }, search.trim() ? 300 : 0);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [search, selectedCategory, categories, categoriesLoaded, lastUpdate]);

  useEffect(() => {
    if (!categories.length) return;

    let activeCategoryIndex = selectedCategory;
    if (activeCategoryIndex === null || !categories[activeCategoryIndex]) {
      const firstParent = categories.find((category) => !category.parent_category);
      if (!firstParent) return;
      activeCategoryIndex = categories.indexOf(firstParent);
    }

    const activeCategory = categories[activeCategoryIndex];
    if (!activeCategory) return;

    const children = categories.filter(
      (category) => Number(category.parent_category) === Number(activeCategory.id)
    );
    if (!children.length) return;

    const currentHasItems =
      selectedSubCategory !== null &&
      items.some((item) => Number(item.sub_category) === Number(selectedSubCategory));
    if (currentHasItems) return;

    const preferredChild = children.find((child) =>
      items.some((item) => Number(item.sub_category) === Number(child.id))
    );

    if (preferredChild && Number(selectedSubCategory) !== Number(preferredChild.id)) {
      setSelectedSubCategory(preferredChild.id);
    } else if (!preferredChild && selectedSubCategory !== null) {
      setSelectedSubCategory(null);
    }
  }, [categories, items, selectedCategory, selectedSubCategory]);

  useEffect(() => {
    if (selectedCategory !== null && categories[selectedCategory]?.id) {
      trackUpsellCategoryView(categories[selectedCategory].id);
    }
  }, [selectedCategory, categories]);

  useEffect(() => {
    if (selectedSubCategory !== null) {
      trackUpsellCategoryView(selectedSubCategory);
    }
  }, [selectedSubCategory]);

  // Memoized filtered items to avoid re-computing on every render
  const filteredItems = useMemo(() => {
    let result = [...items];

    if (categories.length === 0) {
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        result = result.filter((item) => String(item.item_name || "").toLowerCase().includes(query));
      }
      return result;
    }

    // Determine active main category
    let activeCategoryIndex = selectedCategory;
    if (activeCategoryIndex === null && categories.length > 0) {
      const firstParent = categories.find(c => !c.parent_category);
      if (firstParent) activeCategoryIndex = categories.indexOf(firstParent);
    }

    // 1. Filter by Main Category
    if (activeCategoryIndex !== null && categories[activeCategoryIndex]) {
      const mainCatId = categories[activeCategoryIndex].id;
      const subCats = categories.filter(c => Number(c.parent_category) === Number(mainCatId));

      if (selectedSubCategory !== null) {
        result = result.filter(item => Number(item.sub_category) === Number(selectedSubCategory));
      } else {
        const subCatIds = new Set(subCats.map((sub) => Number(sub.id)));
        result = result.filter(
          item =>
            Number(item.category) === Number(mainCatId) ||
            (item.sub_category ? subCatIds.has(Number(item.sub_category)) : false)
        );
      }
    } else {
      return [];
    }

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      result = result.filter((item) => String(item.item_name || "").toLowerCase().includes(query));
    }

    return result;
  }, [items, selectedCategory, selectedSubCategory, categories, search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlTableName = params.get("table_name");

    if (urlTableName) {
      setTableName(urlTableName);
    } else {
      const userInfo = localStorage.getItem("userInfo");
      if (userInfo) {
        try {
          setTableName(JSON.parse(userInfo)?.user?.restaurants[0]?.table_name);
        } catch (e) {
          console.error("Error parsing userInfo", e);
        }
      }
    }
  }, [location.search]);

  const showFood = (item: FoodItemTypes) => {
    setSelectedItemId(item.id);
    setSelectedItem(item);
    setDetailOpen(true);
  };

  const navigate = useNavigate();

  const [lastAssistanceRequestTime, setLastAssistanceRequestTime] = useState<number>(0);

  const handleRequestAssistance = () => {
    const now = Date.now();
    if (now - lastAssistanceRequestTime < 30000) {
      toast.error("Please wait before requesting assistance again.");
      return;
    }

    const tableNum = tableName || "Unknown";
    const msg = `Table ${tableNum} is requesting assistance.`;

    // Send message with type "alert"
    sendMessage(msg, "alert");

    setLastAssistanceRequestTime(now);
    toast.success("Assistance request sent.");
    setAssistanceOpen(false);
  };

  // Listen for custom event from BottomNav to trigger assistance
  useEffect(() => {
    const handleTriggerCall = () => {
      setAssistanceOpen(true);
    };
    window.addEventListener("trigger-call-staff", handleTriggerCall);
    return () => {
      window.removeEventListener("trigger-call-staff", handleTriggerCall);
    };
  }, []);

  return (
    <CartProvider>
      <MenuCartReconciler
        items={items}
        restaurantId={getRestaurantIdFromStorage() || restaurantId}
        ready={itemsLoaded && !search.trim()}
      />
      {!isSubRoute && <MenuUpsellPrimer items={filteredItems} />}
      <div
        className="flex min-h-screen justify-center overflow-hidden bg-slate-100 text-foreground"
        style={{ ["--primary" as string]: brandPrimaryHsl } as React.CSSProperties}
      >
        <div className="relative flex h-[100dvh] min-h-screen w-full max-w-[430px] flex-col overflow-hidden bg-background text-foreground shadow-2xl">

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto pb-[calc(60px+env(safe-area-inset-bottom))] relative">
          {!isSubRoute ? (
            <div className="flex flex-col min-h-full">
              {hasBranding ? (
                <section className="relative h-48 w-full overflow-hidden">
                  <div className="absolute inset-0" style={{ background: splashGradient }} />
                  {brandCoverUrl && !coverImgFailed ? (
                    <img
                      src={brandCoverUrl}
                      alt={`${restaurantName} cover`}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ objectPosition: brand.coverPosition || "50% 50%" }}
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      onError={() => setCoverImgFailed(true)}
                    />
                  ) : null}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        brand.themePreset === "luxury_dark"
                          ? "linear-gradient(to bottom, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.78) 100%)"
                          : brand.themePreset === "warm_casual"
                            ? "linear-gradient(to bottom, rgba(100,30,5,0.28) 0%, rgba(100,30,5,0.62) 100%)"
                            : "linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.55) 100%)",
                    }}
                  />

                  {socialLinks.length > 0 ? (
                    <div className="absolute top-3 right-4 z-20 flex items-center gap-2.5">
                      {socialLinks.map(({ key, href, Icon, label }) => (
                        <a
                          key={key}
                          href={href || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={label}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white/90 backdrop-blur-sm transition-colors hover:text-white"
                        >
                          {key === "tiktok" ? (
                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.95a8.27 8.27 0 0 0 4.83 1.55V7.05a4.84 4.84 0 0 1-1.06-.36z" />
                            </svg>
                          ) : (
                            <Icon className="w-4 h-4" strokeWidth={1.8} />
                          )}
                        </a>
                      ))}
                    </div>
                  ) : null}

                  <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between px-4 pb-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden"
                        style={{
                          background: "rgba(255,255,255,0.14)",
                          backdropFilter: "blur(8px)",
                          border: "1px solid rgba(255,255,255,0.22)",
                        }}
                      >
                        {brandLogoUrl ? (
                          <img
                            src={brandLogoUrl}
                            alt={`${restaurantName} logo`}
                            width={40}
                            height={40}
                            loading="eager"
                            decoding="async"
                            fetchPriority="high"
                            className="h-full w-full object-contain bg-transparent p-0.5"
                            onError={(event) => {
                              (event.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="text-base font-bold text-white" style={{ fontFamily: brandFontFamily }}>
                            {(restaurantName || "R").charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h1
                          className="truncate text-lg font-bold leading-tight text-white drop-shadow-sm"
                          style={brandFontFamily ? { fontFamily: brandFontFamily } : undefined}
                        >
                          {restaurantName}
                        </h1>
                        {brand.tagline ? (
                          <p className="truncate text-xs leading-snug text-white/70">{brand.tagline}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-white backdrop-blur-sm">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">Table</span>
                      <span className="text-xs font-bold leading-none">{tableName || "–"}</span>
                    </div>
                  </div>
                </section>
              ) : null}

              {/* Sticky Header */}
              {/* Sticky Header Group - Single container for Logo, Search, Categories */}
              <header
                className={cn(
                  "sticky top-0 z-40 border-b border-white/10 pb-2 backdrop-blur-xl transition-all duration-300",
                  hasBranding
                    ? "bg-background/78 pt-3"
                    : "bg-background/82 pt-safe-top"
                )}
              >
                {hasBranding ? (
                  null
                ) : (
                    <div className="px-4 py-3 flex items-center justify-between">
                    <div className="block shrink-0">
                      <Logo />
                    </div>

                    {tableName ? (
                      <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 backdrop-blur-md">
                        <span className="text-xs font-bold text-foreground">Table {tableName}</span>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Search Bar */}
                <div className="px-4 mt-0 mb-3">
                  <div className="relative flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                      <input
                        type="text"
                        placeholder="Search for food..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-10 w-full rounded-xl border border-white/10 bg-white/10 py-2.5 pl-9 pr-4 text-sm font-medium text-foreground placeholder:text-muted-foreground/70 ring-0 transition-all focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/25"
                      />
                    </div>
                    {hasBranding ? (
                      <div className="flex shrink-0 flex-col items-end">
                          <span className="text-[9px] font-bold text-primary uppercase tracking-wider">Table</span>
                        <span className="text-sm font-bold leading-none">{tableName || "–"}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Categories */}
                <div className="w-full overflow-x-auto hide-scrollbar py-2 pl-4 snap-x snap-mandatory touch-pan-x">
                  <div className="flex gap-3 pr-4 min-w-max">
                    {categories.filter(c => !c.parent_category).map((category) => (
                      <CategoryItem
                        key={category.id}
                        cat={category}
                        isActive={(selectedCategory !== null && categories[selectedCategory]?.id === category.id) || (selectedCategory === null && categories.indexOf(category) === 0)}
                        onClick={() => {
                          setSelectedCategory(categories.indexOf(category));
                          setSelectedSubCategory(null);
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Sub-categories */}
                {subCategories.length > 0 && (
                          <div className="relative mt-2 w-full overflow-x-auto hide-scrollbar bg-background/50 py-2 pl-4">
                    <div className="flex gap-2 pr-4 min-w-max">
                      {subCategories.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => setSelectedSubCategory(sub.id)}
                          className={cn(
                            "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-all duration-300",
                            selectedSubCategory === sub.id
                              ? "border-white bg-white text-slate-950 shadow-sm shadow-black/20"
                              : "border-white/10 bg-white/10 text-slate-300 hover:bg-white/15"
                          )}
                        >
                          {sub.Category_name}
                        </button>
                      ))}
                    </div>
                    <div className="pointer-events-none absolute right-0 top-0 h-full w-4 bg-gradient-to-r from-transparent to-background/80" />
                  </div>
                )}
              </header>

              {/* Main Content (Menu Feed) */}
              <main className="px-4 py-4 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {!categoriesLoaded || !itemsLoaded ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" strokeWidth={1.8} />
                    <p className="mt-3 text-sm">Loading menu</p>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
                      <UtensilsCrossed className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} />
                    </div>
                    <p className="text-sm text-muted-foreground">No items found.</p>
                    <p className="mt-1 max-w-56 text-xs text-muted-foreground">Try another category or search term.</p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {filteredItems.map((item) => (
                      <motion.div
                        key={item.id}
                        layout="position"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="w-full"
                      >
                        <FoodItemCard
                          item={item}
                          onAdd={() => showFood(item)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
                <Footer />
              </main>
            </div>
          ) : (
            <div className="h-full">
              <Outlet />
            </div>
          )}
        </div>

        {/* 6. Bottom Navigation - Hide on success/checkout pages */}
        {!location.pathname.includes('/success') && !location.pathname.includes('/checkout') && <BottomNav />}
        {!isSubRoute && (
          <MenuPageUpsellHost pendingDetail={menuUpsellDetail} />
        )}
        </div>
      </div>

      {/* Detail modal */}
      <ModalFoodDetail
        isOpen={isDetailOpen}
        close={() => {
          setDetailOpen(false);
          setSelectedItem(null);
        }}
        itemId={selectedItemId ?? undefined}
        initialItem={selectedItem}
        onAddToCart={(detail) => {
          setMenuUpsellDetail({ ...detail });
          // setIsMobileMenuOpen(true); // No longer needed with bottom nav
          // navigate("/dashboard/cart"); // Stay on page or navigate? User requested "shows toast and closes modal", didn't say navigate.
        }}
      />
      {/* Assistance modal */}
      <ModalAssistance
        isOpen={isAssistanceOpen}
        close={() => setAssistanceOpen(false)}
        confirm={handleRequestAssistance}
        tableName={tableName}
      />
    </CartProvider>
  );
};

export default LayoutDashboard;
