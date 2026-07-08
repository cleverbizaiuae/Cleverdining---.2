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
  incrementUpsellTouchpointCount,
  markUpsellItemAccepted,
  markUpsellItemDismissed,
  trackUpsellCategoryDecline,
  trackUpsellCategoryView,
} from "../lib/upsellSession";
import {
  fetchUpsellSettings,
  fetchUpsellSuggestions,
  logUpsellAssociationStat,
  logUpsellEvent,
  logUpsellShownBatch,
  type UpsellSettingsSnapshot,
  type UpsellSuggestion,
} from "../lib/upsellApi";
import { FONT_PRESETS, shouldRenderBrandExperience, useActiveBrandConfig } from "@/lib/useBrandConfig";
import { cachedGet, invalidateApiCache } from "@/lib/requestCache";
import { getSessionCurrencyCode } from "../utils/regionSession";

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

const MenuPageUpsellHost = ({ pendingDetail }: { pendingDetail: MenuItemAddedDetail | null }) => {
  const { addToCart } = useCart();
  const currencyCode = getSessionCurrencyCode();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<UpsellSuggestion[]>([]);
  const [triggerItem, setTriggerItem] = useState<any>(null);
  const [settings, setSettings] = useState<UpsellSettingsSnapshot | null>(null);
  const [cartMetrics, setCartMetrics] = useState({ cartValueAtTime: 0, cartItemCount: 0 });
  const sourceItemIdRef = useRef<number | null>(null);
  const sourceItemIdsRef = useRef<number[]>([]);
  const activeRef = useRef(false);
  const pendingActionRef = useRef<null | (() => Promise<void>)>(null);

  const handleMenuItemAddedDetail = useCallback(
    async (detail?: MenuItemAddedDetail) => {
      const item = detail?.item;
      const nextCart = Array.isArray(detail?.nextCart) ? detail.nextCart : [];
      const metrics = detail?.metrics || { cartValueAtTime: 0, cartItemCount: 0 };

      if (!item?.id || !nextCart.length) return;
      if (activeRef.current) {
        setOpen(false);
      }

      const cartItemIds = nextCart
        .map((cartItem) => Number(cartItem.id))
        .filter((id) => Number.isInteger(id) && id > 0);
      setTriggerItem(item);
      setCartMetrics(metrics);
      sourceItemIdRef.current = Number(item.id);
      sourceItemIdsRef.current = cartItemIds;

      try {
        const settingsSnapshot = await fetchUpsellSettings().catch(() => null);
        if (settingsSnapshot) setSettings(settingsSnapshot);

        const shouldRender =
          (settingsSnapshot?.enabled ?? settings?.enabled ?? true) &&
          (settingsSnapshot?.show_after_add_to_cart ?? settings?.show_after_add_to_cart ?? true);

        if (!shouldRender) return;

        const rawSuggestions = await fetchUpsellSuggestions({
          triggerPoint: "add_to_cart",
          sourceItemId: Number(item.id),
          limit: 6,
          cartItemIds,
          excludeItemIds: cartItemIds,
        });
        const nextSuggestions = rawSuggestions.slice(0, 1);

        if (!nextSuggestions.length) return;

        setSuggestions(nextSuggestions);
        activeRef.current = true;
        setOpen(true);
        incrementUpsellTouchpointCount("add_to_cart");

        await logUpsellShownBatch({
          triggerPoint: "add_to_cart",
          suggestions: nextSuggestions,
          cartValueAtTime: metrics.cartValueAtTime,
          cartItemCount: metrics.cartItemCount,
          metadata: { source_item_id: item.id, source_category_id: item.category, surface: "menu_page" },
        });
        await Promise.allSettled(
          nextSuggestions.map((suggestion) =>
            logUpsellAssociationStat({
              triggerPoint: "add_to_cart",
              action: "shown",
              sourceItemId: Number(item.id),
              sourceItemIds: cartItemIds,
              upsellItemId: suggestion.id,
              metadata: { source_category_id: item.category, surface: "menu_page" },
            })
          )
        );
      } catch {
        // Non-blocking by design.
      }
    },
    [settings]
  );

  useEffect(() => {
    if (pendingDetail) {
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
    const added = await addToCart(toCartItemFromUpsell(suggestion), 1);
    if (!added) {
      toast.error("Could not add this suggestion. Please try again.");
      return;
    }
    setOpen(false);
    toast.success(`${suggestion.item_name} added to cart`);
    pendingActionRef.current = async () => {
      markUpsellItemAccepted(suggestion.id);
      await Promise.allSettled([
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
          upsellPrice: suggestion.price,
          metadata: { surface: "menu_page" },
        }),
      ]);
    };
  };

  const declineSuggestion = async (suggestion: UpsellSuggestion) => {
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
    markUpsellItemDismissed(suggestion.id);
    if (suggestion.category) {
      trackUpsellCategoryDecline(suggestion.category, 0.5);
    }
    setSuggestions((current) => {
      const remaining = current.filter((row) => row.id !== suggestion.id);
      if (remaining.length === 0) setOpen(false);
      return remaining;
    });
    await Promise.allSettled([
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
      suggestions={suggestions}
      triggerItem={triggerItem}
      currencyCode={currencyCode}
      onAccept={acceptSuggestion}
      onDeclineSingle={declineSuggestion}
      onDismissSingle={dismissSingle}
      onDismissMany={dismissMany}
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
  const [menuUpsellDetail, setMenuUpsellDetail] = useState<MenuItemAddedDetail | null>(null);
  const [isAssistanceOpen, setAssistanceOpen] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const subCategories = useMemo(() => {
    let activeCategoryIndex = selectedCategory;
    if (activeCategoryIndex === null && categories.length > 0) {
      const firstParent = categories.find(c => !c.parent_category);
      if (firstParent) activeCategoryIndex = categories.indexOf(firstParent);
    }

    if (activeCategoryIndex !== null && categories[activeCategoryIndex]) {
      const mainCatId = categories[activeCategoryIndex].id;
      return categories.filter(c => c.parent_category === mainCatId);
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
    if (!storedUserInfo) {
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
      const userInfo = localStorage.getItem("userInfo");
      if (userInfo) {
        try {
          const parsedUserInfo = JSON.parse(userInfo);
          if (
            parsedUserInfo.user &&
            parsedUserInfo.user.restaurants &&
            parsedUserInfo.user.restaurants.length > 0
          ) {
            setRestaurantId(parsedUserInfo.user.restaurants[0].id);
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    fetchRestaurantId();
  }, []);

  const fetchCategories = async () => {
    try {
      const userInfo = localStorage.getItem("userInfo");
      const rId = userInfo ? JSON.parse(userInfo)?.user?.restaurants[0]?.id : null;
      // prioritize local ID if state not yet set
      const targetId = rId || restaurantId;

      const url = targetId ? `/api/customer/categories/?restaurant_id=${targetId}` : "/api/customer/categories/";
      const response = await cachedGet(url, {}, { ttlMs: 30_000 });
      const data = response.data;
      setCategories(Array.isArray(data) ? data : data?.results || []);
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
    setItemsLoaded(false);
    try {
      let url = "/api/customer/items/";
      const params = [];

      const userInfo = localStorage.getItem("userInfo");
      const rId = userInfo ? JSON.parse(userInfo)?.user?.restaurants[0]?.id : null;
      const targetId = rId || restaurantId; // prioritize localStorage

      if (targetId) {
        params.push(`restaurant_id=${targetId}`);
      }

      // If subcategory is selected, filter by subcategory
      if (selectedCategory !== null && categories[selectedCategory]) {
        // Filter by main category
        params.push(`category=${categories[selectedCategory].id}`);
      }

      if (search) {
        params.push(`search=${encodeURIComponent(search)}`);
      }
      if (params.length > 0) {
        url += `?${params.join("&")}`;
      }

      const response = await cachedGet(url, {}, { ttlMs: 8_000 });
      const payload = response.data;
      setItems(Array.isArray(payload) ? payload : payload.results || []);
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

    // Determine active main category
    let activeCategoryIndex = selectedCategory;
    if (activeCategoryIndex === null && categories.length > 0) {
      const firstParent = categories.find(c => !c.parent_category);
      if (firstParent) activeCategoryIndex = categories.indexOf(firstParent);
    }

    // 1. Filter by Main Category
    if (activeCategoryIndex !== null && categories[activeCategoryIndex]) {
      const mainCatId = categories[activeCategoryIndex].id;
      const subCats = categories.filter(c => c.parent_category === mainCatId);

      if (selectedSubCategory !== null) {
        result = result.filter(item => item.sub_category === selectedSubCategory);
      } else {
        const subCatIds = new Set(subCats.map((sub) => sub.id));
        result = result.filter(
          item => item.category === mainCatId || (item.sub_category ? subCatIds.has(item.sub_category) : false)
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

  const showFood = (id: number) => {
    setSelectedItemId(id);
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
                          onAdd={() => showFood(item.id)}
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
        <MenuPageUpsellHost pendingDetail={menuUpsellDetail} />
        </div>
      </div>

      {/* Detail modal */}
      <ModalFoodDetail
        isOpen={isDetailOpen}
        close={() => setDetailOpen(false)}
        itemId={selectedItemId ?? undefined}
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
