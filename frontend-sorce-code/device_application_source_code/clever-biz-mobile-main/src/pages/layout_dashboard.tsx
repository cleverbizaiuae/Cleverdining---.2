/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ModalFoodDetail,
  ModalAssistance,
} from "@/components/dialog";
import { SocketContext } from "@/components/SocketContext";
import { useWebSocket } from "@/components/WebSocketContext";
import { cn } from "clsx-for-tailwind";
import { motion, AnimatePresence } from "motion/react";
import toast from "react-hot-toast";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { CartProvider } from "../context/CartContext";
import { type CategoryItemType, CategoryItem } from "./dashboard/category-item";
import { FoodItemTypes } from "./dashboard/food-items";
import { FoodItemCard } from "./dashboard/food-item-card";
import { BottomNav } from "@/components/BottomNav";
import { Facebook, Globe, Instagram, Music2, Search, Twitter } from "lucide-react";
import { Logo } from "@/components/icons/brandLogo";
import { Footer } from "../components/Footer";
import { trackUpsellCategoryView } from "../lib/upsellSession";
import { FONT_PRESETS, useBrandConfig } from "@/lib/useBrandConfig";
import { cachedGet, invalidateApiCache } from "@/lib/requestCache";

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

const LayoutDashboard = () => {
  const BRAND_SPLASH_SESSION_KEY = "cb_splash_seen";
  const location = useLocation();



  const isSubRoute = location.pathname !== "/dashboard";

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [categories, setCategories] = useState<CategoryItemType[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [isDetailOpen, setDetailOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
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

  const [userInfo, setUserInfo] = useState<any>(null);
  const [restaurantId, setRestaurantId] = useState<number | null>(null);
  const brand = useBrandConfig(restaurantId);
  const splashTimerRef = useRef<number | null>(null);

  const hasConfiguredContent = Boolean(
    brand.logoUrl || brand.coverImageUrl || (brand.restaurantName && brand.restaurantName !== "My Restaurant")
  );
  const hasBranding = brand.brandingEnabled || hasConfiguredContent;
  const restaurantName =
    hasBranding && brand.restaurantName
      ? brand.restaurantName
      : "Welcome";
  const brandLogoUrl = hasBranding ? brand.logoUrl : null;
  const brandCoverUrl = hasBranding ? brand.coverImageUrl : null;
  const brandFontFamily = getFontFamily(brand.fontPreset);
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

  const [splashState, setSplashState] = useState<"splash" | "collapsing" | "done">(() => {
    try {
      return sessionStorage.getItem(BRAND_SPLASH_SESSION_KEY) ? "done" : "splash";
    } catch {
      return "splash";
    }
  });

  useEffect(() => {
    const fetchUserInfo = () => {
      try {
        const storedUserInfo = localStorage.getItem("userInfo");
        if (storedUserInfo) {
          setUserInfo(JSON.parse(storedUserInfo));
        }
      } catch (error) {
        console.error("Failed to parse user info:", error);
      }
    };

    fetchUserInfo();

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

  const dismissBrandSplash = useCallback(() => {
    try {
      sessionStorage.setItem(BRAND_SPLASH_SESSION_KEY, "1");
    } catch {
      // Non-blocking.
    }
    setSplashState("collapsing");
    if (splashTimerRef.current) window.clearTimeout(splashTimerRef.current);
    splashTimerRef.current = window.setTimeout(() => {
      setSplashState("done");
      splashTimerRef.current = null;
    }, 520);
  }, []);

  useEffect(() => {
    return () => {
      if (splashTimerRef.current) {
        window.clearTimeout(splashTimerRef.current);
      }
    };
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
      setItems(response.data.results || []);
    } catch (error) {
      console.warn("Failed to fetch items", error);
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

      // 2. Filter by Subcategory
      let activeSubCatId = selectedSubCategory;
      if (activeSubCatId === null && subCats.length > 0) {
        activeSubCatId = subCats[0].id;
      }

      if (activeSubCatId !== null) {
        result = result.filter(item => item.sub_category === activeSubCatId);
      } else {
        result = result.filter(item =>
          item.category === mainCatId && !item.sub_category
        );
        if (subCats.length === 0) {
          result = items.filter(item => item.category === mainCatId);
        }
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
      {splashState !== "done" && (
        <motion.div
          className="fixed inset-0 z-[120] bg-slate-950"
          initial={{ opacity: 1 }}
          animate={
            splashState === "collapsing"
              ? { opacity: 0, transition: { duration: 0.48, ease: [0.4, 0, 0.2, 1] } }
              : { opacity: 1 }
          }
          onClick={dismissBrandSplash}
          role="button"
          tabIndex={0}
        >
          <div className="absolute inset-0" style={{ background: splashGradient }} />
          {brandCoverUrl && !coverImgFailed ? (
            <>
              <img
                src={brandCoverUrl}
                alt="Brand cover"
                className="absolute inset-0 h-full w-full object-cover scale-110"
                style={{ filter: "blur(18px)" }}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onError={() => setCoverImgFailed(true)}
              />
              <motion.img
                src={brandCoverUrl}
                alt="Brand splash"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: "center top" }}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                initial={{ opacity: 0.45, scale: 1 }}
                animate={splashState === "collapsing" ? { opacity: 0.35, scale: 1.06 } : { opacity: 0.55, scale: 1 }}
                transition={{ duration: 0.48, ease: [0.4, 0, 0.2, 1] }}
                onError={() => setCoverImgFailed(true)}
              />
            </>
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/55 to-black/80" />

          <motion.div
            className="relative h-full flex flex-col px-8 text-center"
            initial={{ opacity: 1, y: 0 }}
            animate={splashState === "collapsing" ? { opacity: 0, y: -16 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: "easeIn" }}
          >
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.55, delay: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
                className="h-24 w-24 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl shadow-black/50 flex items-center justify-center overflow-hidden"
              >
                {brandLogoUrl ? (
                  <img
                    src={brandLogoUrl}
                    alt={restaurantName}
                    width={96}
                    height={96}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    className="h-full w-full rounded-full object-contain bg-transparent p-1.5"
                  />
                ) : (
                  <span className="text-white text-5xl font-bold leading-none" style={{ fontFamily: brandFontFamily }}>
                    {(restaurantName || "W").charAt(0).toUpperCase()}
                  </span>
                )}
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.32 }}
                className="text-white font-bold leading-tight"
                style={{
                  fontFamily: brandFontFamily,
                  fontSize: "clamp(1.75rem, 6vw, 2.5rem)",
                  letterSpacing: "-0.02em",
                }}
              >
                {restaurantName}
              </motion.h1>
              {brand.tagline ? (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: 0.42 }}
                  className="-mt-3 max-w-xs text-sm leading-relaxed text-white/72"
                >
                  {brand.tagline}
                </motion.p>
              ) : null}
            </div>
            <div className="flex flex-col items-center gap-4 pb-16">
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.5 }}
                onClick={(e) => {
                  e.stopPropagation();
                  dismissBrandSplash();
                }}
                className="w-full max-w-xs py-4 rounded-2xl bg-white/95 text-slate-900 font-bold text-base tracking-tight shadow-2xl shadow-black/40 inline-flex items-center justify-center"
                whileTap={{ scale: 0.97 }}
              >
                View Menu
              </motion.button>
            </div>
            <p className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/40 text-xs">
              Tap anywhere to skip
            </p>
          </motion.div>
        </motion.div>
      )}

      <div
        className="h-[100dvh] flex flex-col bg-background overflow-hidden"
        style={hasBranding ? ({ ["--primary" as string]: brandPrimaryHsl } as React.CSSProperties) : undefined}
      >

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto pb-[calc(60px+env(safe-area-inset-bottom))] relative">
          {!isSubRoute ? (
            <div className="flex flex-col min-h-full">
              {hasBranding ? (
                <section className="relative min-h-40 w-full overflow-hidden">
                  <div className="absolute inset-0" style={{ background: splashGradient }} />
                  {brandCoverUrl && !coverImgFailed ? (
                    <img
                      src={brandCoverUrl}
                      alt={`${restaurantName} cover`}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ objectPosition: "center top" }}
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
                          className="text-white/90 hover:text-white transition-colors"
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
                        className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden"
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
                          style={{ fontFamily: brandFontFamily }}
                        >
                          {restaurantName}
                        </h1>
                        {brand.tagline ? (
                          <p className="truncate text-xs leading-snug text-white/70">{brand.tagline}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end pb-0.5 pl-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-white/60">Table</span>
                      <span className="text-base font-bold leading-none text-white">{tableName || "–"}</span>
                    </div>
                  </div>
                </section>
              ) : null}

              {/* Sticky Header */}
              {/* Sticky Header Group - Single container for Logo, Search, Categories */}
              <header
                className={cn(
                  "sticky top-0 z-40 backdrop-blur-md border-b border-gray-200/70 pb-2 transition-all duration-300 shadow-md shadow-slate-200/40",
                  hasBranding
                    ? "bg-background/80 pt-3"
                    : "bg-background/90 pt-safe-top"
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
                      <div className="bg-slate-100 rounded-full px-3 py-1 border border-slate-200">
                        <span className="text-xs font-bold text-slate-700">Table {tableName}</span>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Search Bar */}
                <div className="px-4 mt-0 mb-3">
                  <div className="relative flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        placeholder="Search for food..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-slate-50 ring-1 ring-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-gray-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
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
                <div className="w-full overflow-x-auto no-scrollbar py-2 pl-4 snap-x snap-mandatory touch-pan-x">
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
                  <div className="relative w-full overflow-x-auto no-scrollbar py-2 pl-4 bg-gray-50/50 mt-2">
                    <div className="flex gap-2.5 pr-5 min-w-max">
                      {subCategories.map((sub, idx) => (
                        <button
                          key={sub.id}
                          onClick={() => setSelectedSubCategory(sub.id)}
                          className={cn(
                            "shrink-0 px-5 py-2 rounded-full text-xs font-semibold transition-all duration-300 border",
                            selectedSubCategory === sub.id || (selectedSubCategory === null && idx === 0)
                              ? "bg-primary/10 text-primary border-primary/30"
                              : "bg-secondary/50 text-muted-foreground border-transparent hover:bg-secondary"
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
                {filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <p>No items found.</p>
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
                {socialLinks.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Follow Us</p>
                    <div className="flex items-center justify-center gap-3">
                      {socialLinks.map(({ key, href, Icon, label }) => (
                        <a
                          key={key}
                          href={href || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={label}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:text-primary"
                        >
                          {key === "tiktok" ? (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.95a8.27 8.27 0 0 0 4.83 1.55V7.05a4.84 4.84 0 0 1-1.06-.36z" />
                            </svg>
                          ) : (
                            <Icon className="h-4 w-4" strokeWidth={1.8} />
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
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
      </div>

      {/* Detail modal */}
      <ModalFoodDetail
        isOpen={isDetailOpen}
        close={() => setDetailOpen(false)}
        itemId={selectedItemId ?? undefined}
        onAddToCart={() => {
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
