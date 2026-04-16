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
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { CartProvider } from "../context/CartContext";
import axiosInstance, { API_BASE_URL } from "../lib/axios";
import { type CategoryItemType, CategoryItem } from "./dashboard/category-item";
import { FoodItemTypes } from "./dashboard/food-items";
import { FoodItemCard } from "./dashboard/food-item-card";
import { BottomNav } from "@/components/BottomNav";
import { Search } from "lucide-react";
import { Logo } from "@/components/icons/logo";
import { Footer } from "../components/Footer";
import { trackUpsellCategoryView } from "../lib/upsellSession";

type BrandingSnapshot = {
  brandingEnabled?: boolean;
  restaurantName?: string;
  logoDataUrl?: string;
  coverImageDataUrl?: string;
};

type BrandApiConfig = {
  brandingEnabled?: boolean;
  restaurantName?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
};

type BrandingView = {
  name: string;
  logo: string;
  cover: string;
  brandingEnabled: boolean;
  hasConfiguredContent: boolean;
};

function readBrandingSnapshot(): BrandingSnapshot {
  try {
    const raw = localStorage.getItem("customer_branding");
    if (!raw) return {};
    return JSON.parse(raw) as BrandingSnapshot;
  } catch {
    return {};
  }
}

async function fetchBrandConfig(restaurantId: number | null): Promise<BrandApiConfig | null> {
  if (!restaurantId) return null;
  try {
    const response = await fetch(`${API_BASE_URL}api/brand-config/?restaurant_id=${restaurantId}`);
    if (!response.ok) return null;
    return (await response.json()) as BrandApiConfig;
  } catch {
    return null;
  }
}

function getBrandingView(userInfo: any, remoteBranding?: BrandApiConfig | null): BrandingView {
  const branding = readBrandingSnapshot();
  const restaurant = userInfo?.user?.restaurants?.[0] || {};
  const configuredName = String(remoteBranding?.restaurantName || branding.restaurantName || "").trim();
  const restaurantLogo = String(restaurant.logo || restaurant.logo_url || restaurant.image || "").trim();
  const restaurantCover = String(restaurant.cover_image || restaurant.coverImage || "").trim();
  const logo = String(remoteBranding?.logoUrl || branding.logoDataUrl || restaurantLogo || "").trim();
  const cover = String(remoteBranding?.coverImageUrl || branding.coverImageDataUrl || restaurantCover || "").trim();
  const fallbackRestaurantName = String(
    restaurant.resturent_name || restaurant.restaurant_name || ""
  ).trim();
  const brandingEnabled = Boolean(
    remoteBranding?.brandingEnabled ?? branding.brandingEnabled ?? false
  );
  const hasConfiguredContent = Boolean(
    logo || cover || (configuredName && configuredName !== "My Restaurant")
  );

  return {
    name: configuredName || fallbackRestaurantName || "Restaurant",
    logo,
    cover,
    brandingEnabled,
    hasConfiguredContent,
  };
}

const LayoutDashboard = () => {
  const location = useLocation();



  const isSubRoute = location.pathname !== "/dashboard";

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [categories, setCategories] = useState<CategoryItemType[]>([]);
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
          // Trigger a re-fetch
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
  const [brandingView, setBrandingView] = useState<BrandingView>({
    name: "",
    logo: "",
    cover: "",
    brandingEnabled: false,
    hasConfiguredContent: false,
  });
  const [showBrandSplash, setShowBrandSplash] = useState(false);

  const hasBranding = brandingView.brandingEnabled || brandingView.hasConfiguredContent;

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
          const resResponse = await axiosInstance.get("/api/customer/restaurants/");
          const restaurants = resResponse.data;

          if (restaurants && restaurants.length > 0) {
            const firstRestaurant = restaurants[0];

            // 2. Fetch Devices for the first restaurant
            const devResponse = await axiosInstance.get(`/api/customer/devices/?restaurant_id=${firstRestaurant.id}`);
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
    let isMounted = true;

    const syncBranding = async () => {
      let parsedUserInfo: any = userInfo;
      try {
        const rawUserInfo = localStorage.getItem("userInfo");
        if (rawUserInfo) parsedUserInfo = JSON.parse(rawUserInfo);
      } catch {
        // keep previous value
      }

      const resolvedRestaurantId = parsedUserInfo?.user?.restaurants?.[0]?.id
        ? Number(parsedUserInfo.user.restaurants[0].id)
        : null;
      const remoteBranding = await fetchBrandConfig(resolvedRestaurantId);
      const nextBranding = getBrandingView(parsedUserInfo, remoteBranding);

      if (isMounted) {
        setBrandingView(nextBranding);
      }
    };

    syncBranding();
    const interval = window.setInterval(syncBranding, 4000);

    window.addEventListener("storage", syncBranding as EventListener);
    window.addEventListener("branding-updated", syncBranding as EventListener);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
      window.removeEventListener("storage", syncBranding as EventListener);
      window.removeEventListener("branding-updated", syncBranding as EventListener);
    };
  }, [userInfo]);

  useEffect(() => {
    if (!hasBranding) {
      setShowBrandSplash(false);
      return;
    }

    setShowBrandSplash(true);
    const timer = window.setTimeout(() => setShowBrandSplash(false), 1400);
    return () => window.clearTimeout(timer);
  }, [hasBranding]);


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
      const response = await axiosInstance.get(url);
      const data = response.data;
      setCategories(Array.isArray(data) ? data : data?.results || []);
    } catch (error) {
      console.error("Failed to fetch categories", error);
    }
  };
  useEffect(() => {
    fetchCategories();
  }, [lastUpdate]); // eslint-disable-next-line react-hooks/exhaustive-deps

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

      const response = await axiosInstance.get(url);
      setItems(response.data.results || []);
    } catch (error) {
      console.error("Failed to fetch items", error);
    }
  };
  useEffect(() => {
    // Debounced search effect - only fetch after user stops typing
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchItems();
    }, 300); // Reduced from 400ms for faster response
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [search, selectedCategory, categories, lastUpdate]); // eslint-disable-next-line react-hooks/exhaustive-deps

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
    let result = items.filter(item => item.availability); // Only show available items

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

    return result;
  }, [items, selectedCategory, selectedSubCategory, categories]);

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
      {showBrandSplash && hasBranding && (
        <div className="fixed inset-0 z-[120] bg-slate-950">
          {brandingView.cover ? (
            <img src={brandingView.cover} alt="Brand splash" className="absolute inset-0 w-full h-full object-cover opacity-45" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/40 to-slate-950/90" />
          <div className="relative h-full flex flex-col items-center justify-center px-6 text-center">
            {brandingView.logo ? (
              <img src={brandingView.logo} alt="Brand logo" className="w-20 h-20 rounded-2xl object-cover border border-white/20 mb-4" />
            ) : (
              <Logo className="scale-110 mb-4" />
            )}
            <p className="text-white text-2xl font-semibold tracking-tight">
              {brandingView.name || "Welcome"}
            </p>
          </div>
        </div>
      )}

      <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto pb-[calc(60px+env(safe-area-inset-bottom))] relative">
          {!isSubRoute ? (
            <div className="flex flex-col min-h-full">
              {/* Sticky Header */}
              {/* Sticky Header Group - Single container for Logo, Search, Categories */}
              <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-gray-200/50 pb-2 pt-safe-top transition-all duration-300 shadow-sm">
                <div className="px-4 py-3 flex items-center justify-between">
                  {/* Logo */}
                  <div className="block shrink-0">
                    {hasBranding ? (
                      brandingView.logo ? (
                        <img src={brandingView.logo} alt="Brand logo" className="h-9 w-auto max-w-[140px] object-contain" />
                      ) : (
                        <p className="font-semibold text-base text-foreground max-w-[150px] truncate">{brandingView.name || "Restaurant"}</p>
                      )
                    ) : (
                      <Logo />
                    )}
                  </div>

                  {/* Table Info */}
                  {tableName && (
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-medium text-primary uppercase tracking-wider">Table</span>
                      <span className="text-lg font-bold text-foreground leading-none">{tableName}</span>
                    </div>
                  )}
                </div>

                {hasBranding && (brandingView.cover || brandingView.name) && (
                  <div className="px-4 pb-2">
                    <div className="h-20 rounded-2xl overflow-hidden relative border border-gray-200/70 bg-slate-100">
                      {brandingView.cover ? (
                        <img src={brandingView.cover} alt="Brand cover" className="w-full h-full object-cover" />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-r from-black/45 to-black/10" />
                      <div className="absolute inset-0 px-3 py-2 flex items-end">
                        <p className="text-white text-sm font-semibold truncate">{brandingView.name || "Restaurant"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Search Bar */}
                <div className="px-4 mt-1 mb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="Search for food..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-gray-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
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
                  <div className="w-full overflow-x-auto no-scrollbar py-2 pl-4 bg-gray-50/50 mt-2">
                    <div className="flex gap-2 pr-4 min-w-max">
                      {subCategories.map((sub, idx) => (
                        <button
                          key={sub.id}
                          onClick={() => setSelectedSubCategory(sub.id)}
                          className={cn(
                            "shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 border",
                            selectedSubCategory === sub.id || (selectedSubCategory === null && idx === 0)
                              ? "bg-foreground text-background border-foreground"
                              : "bg-secondary/50 text-muted-foreground border-transparent hover:bg-secondary"
                          )}
                        >
                          {sub.Category_name}
                        </button>
                      ))}
                    </div>
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
