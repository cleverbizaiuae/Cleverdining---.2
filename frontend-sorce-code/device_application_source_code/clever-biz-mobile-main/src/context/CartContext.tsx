import React, { createContext, useContext, useState, useEffect } from "react";
import axiosInstance from "../lib/axios";
import { resetUpsellSession, trackUpsellCategoryRemoved } from "../lib/upsellSession";
import { getTableIdentity, TABLE_NAME, TABLE_NUMBER } from "../lib/tableIdentity";

export { TABLE_NAME, TABLE_NUMBER };

export type CartItem = {
  id: number;
  item_name: string;
  price: string;
  description: string;
  slug: string;
  category: number;
  restaurant: number;
  category_name: string;
  image1: string;
  availability: boolean;
  video: string;
  restaurant_name: string;
  quantity: number;
};

type CartContextType = {
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, "quantity">, quantity?: number) => Promise<boolean>;
  removeFromCart: (id: number) => void;
  incrementQuantity: (id: number) => void;
  decrementQuantity: (id: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const parsePrice = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
};

const sanitizeCartItems = (raw: unknown): CartItem[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry: any) => entry && typeof entry === "object")
    .map((entry: any) => {
      const price = parsePrice(entry.price);
      const quantity = Number(entry.quantity);
      if (
        !Number.isInteger(entry.id) ||
        entry.id <= 0 ||
        typeof entry.item_name !== "string" ||
        !entry.item_name.trim() ||
        !Number.isFinite(price) ||
        price < 0
      ) {
        return null;
      }

      return {
        id: entry.id,
        item_name: entry.item_name.trim(),
        price: String(price),
        description: String(entry.description || ""),
        slug: String(entry.slug || ""),
        category: Number(entry.category || 0),
        restaurant: Number(entry.restaurant || 0),
        category_name: String(entry.category_name || ""),
        image1: String(entry.image1 || ""),
        availability: Boolean(entry.availability),
        video: String(entry.video || ""),
        restaurant_name: String(entry.restaurant_name || ""),
        quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
      } as CartItem;
    })
    .filter((entry): entry is CartItem => !!entry);
};

const getCartStorageKeys = (sessionToken?: string | null): string[] => {
  const keys: string[] = [];
  if (sessionToken) keys.push(`cb:cart:${sessionToken}`);

  try {
    const tableInfo = getTableIdentity();
    if (tableInfo.restaurantId && tableInfo.deviceId) {
      keys.push(`cb:cart:restaurant:${tableInfo.restaurantId}:device:${tableInfo.deviceId}`);
    }
    if (tableInfo.restaurantId && tableInfo.storageId) {
      keys.push(`cb:cart:restaurant:${tableInfo.restaurantId}:table:${tableInfo.storageId}`);
    }
  } catch {
    // Fall through to legacy keys.
  }

  keys.push("cart");
  return Array.from(new Set(keys));
};

const readStoredCart = (sessionToken?: string | null): CartItem[] => {
  for (const key of getCartStorageKeys(sessionToken)) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? sanitizeCartItems(JSON.parse(raw)) : [];
      if (parsed.length) return parsed;
    } catch {
      // Try the next key.
    }
  }
  return [];
};

const persistCart = (cart: CartItem[], sessionToken?: string | null) => {
  const keys = getCartStorageKeys(sessionToken);
  keys.forEach((key) => {
    try {
      if (cart.length) {
        localStorage.setItem(key, JSON.stringify(cart));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // Non-blocking.
    }
  });
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Fetch cart from backend or local storage
  useEffect(() => {
    const fetchCart = async () => {
      const sessionToken = localStorage.getItem("guest_session_token");
      const storedCart = readStoredCart(sessionToken);

      if (storedCart.length) {
        setCart(storedCart);
      }

      if (sessionToken) {
        try {
          const res = await axiosInstance.get("/api/customer/cart/");
          // Transform backend cart items to frontend format
          // FIXED: Ensure res.data is an array before mapping to prevent "data.map is not a function" crash
          const rawData = Array.isArray(res.data) ? res.data : (res.data?.results || []);
          const backendItems = rawData.map((cartItem: any) => ({
            ...cartItem.item, // Spread item details
            quantity: cartItem.quantity,
            // Ensure all required fields are present, fallback if needed
            restaurant_name: cartItem.item_name ? "Restaurant" : "",
          }));
          const sanitizedBackendItems = sanitizeCartItems(backendItems);
          if (sanitizedBackendItems.length > 0 || storedCart.length === 0) {
            setCart(sanitizedBackendItems);
            persistCart(sanitizedBackendItems, sessionToken);
          }
        } catch (error) {
          console.warn("Failed to fetch cart from server", error);
          if (!storedCart.length) {
            setCart([]);
          }
        }
      } else {
        setCart(storedCart);
      }
      setIsInitialized(true);
    };

    fetchCart();
  }, []);

  // Sync to local storage as backup (Namespaced)
  useEffect(() => {
    if (isInitialized) {
      const sessionToken = localStorage.getItem("guest_session_token");
      persistCart(cart, sessionToken);
    }
  }, [cart, isInitialized]);

  const addToCart = React.useCallback(async (item: Omit<CartItem, "quantity">, quantity: number = 1) => {
    const parsedPrice = parsePrice(item?.price);
    if (
      !item ||
      !Number.isInteger(item.id) ||
      item.id <= 0 ||
      typeof item.item_name !== "string" ||
      !item.item_name.trim() ||
      !Number.isFinite(parsedPrice) ||
      parsedPrice < 0
    ) {
      console.warn("Invalid cart item rejected:", item);
      return false;
    }

    const safeQuantity = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
    const normalizedItem = {
      ...item,
      item_name: item.item_name.trim(),
      price: String(parsedPrice),
    };

    // Optimistic update
    setCart((prev) => {
      const existing = prev.find((i) => i.id === normalizedItem.id);
      if (existing) {
        return prev.map((i) =>
          i.id === normalizedItem.id ? { ...i, quantity: i.quantity + safeQuantity } : i
        );
      } else {
        return [...prev, { ...normalizedItem, quantity: safeQuantity }];
      }
    });

    // Server sync
    const sessionToken = localStorage.getItem("guest_session_token");
    if (sessionToken) {
      void axiosInstance.post("/api/customer/cart/add_item/", {
          item_id: normalizedItem.id,
          quantity: safeQuantity
        }).catch((error) => {
          console.warn("Server cart sync failed after local add", error);
        });
    }
    return true;
  }, []);

  const removeFromCart = React.useCallback(async (id: number) => {
    setCart((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.category) {
        trackUpsellCategoryRemoved(target.category);
      }
      return prev.filter((i) => i.id !== id);
    });
    // Note: Backend doesn't have remove item endpoint yet.
  }, []);

  const incrementQuantity = React.useCallback(async (id: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, quantity: i.quantity + 1 } : i
      )
    );

    const sessionToken = localStorage.getItem("guest_session_token");
    if (sessionToken) {
      void axiosInstance.post("/api/customer/cart/add_item/", {
          item_id: id,
          quantity: 1
        }).catch((error) => {
          console.warn("Server cart sync failed after local increment", error);
        });
    }
  }, []);

  const decrementQuantity = React.useCallback(async (id: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.id === id && i.quantity > 1
          ? { ...i, quantity: i.quantity - 1 }
          : i
      )
    );
    // Server sync skipped until backend supports robust decrement/delete
  }, []);

  const clearCart = React.useCallback(async () => {
    setCart([]);
    resetUpsellSession();
    const sessionToken = localStorage.getItem("guest_session_token");
    persistCart([], sessionToken);
    if (sessionToken) {
      try {
        await axiosInstance.post("/api/customer/cart/clear/");
      } catch (error) {
        console.error("Failed to clear server cart", error);
      }
    }
  }, []);

  const value = React.useMemo(() => ({
    cart,
    addToCart,
    removeFromCart,
    incrementQuantity,
    decrementQuantity,
    clearCart
  }), [cart, addToCart, removeFromCart, incrementQuantity, decrementQuantity, clearCart]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};
