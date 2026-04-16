import React, { createContext, useContext, useState, useEffect } from "react";
import axiosInstance from "../lib/axios";
import { resetUpsellSession, trackUpsellCategoryRemoved } from "../lib/upsellSession";

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
  addToCart: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
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
          setCart(sanitizeCartItems(backendItems));
        } catch (error) {
          console.error("Failed to fetch cart from server", error);
          // Fallback to namespaced local storage
          const stored = localStorage.getItem(`cb:cart:${sessionToken}`);
          if (stored) {
            try {
              setCart(sanitizeCartItems(JSON.parse(stored)));
            } catch {
              setCart([]);
            }
          } else {
            setCart([]);
          }
        }
      } else {
        // No session, clear cart or handle appropriately
        setCart([]);
        localStorage.removeItem("cart");
      }
      setIsInitialized(true);
    };

    fetchCart();
  }, []);

  // Sync to local storage as backup (Namespaced)
  useEffect(() => {
    if (isInitialized) {
      const sessionToken = localStorage.getItem("guest_session_token");
      if (sessionToken) {
        localStorage.setItem(`cb:cart:${sessionToken}`, JSON.stringify(cart));
      }
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
      return;
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
      try {
        await axiosInstance.post("/api/customer/cart/add_item/", {
          item_id: normalizedItem.id,
          quantity: safeQuantity
        });
      } catch (error) {
        console.error("Failed to add item to server cart", error);
      }
    }
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
      try {
        await axiosInstance.post("/api/customer/cart/add_item/", {
          item_id: id,
          quantity: 1
        });
      } catch (error) {
        console.error("Failed to increment item", error);
      }
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
    localStorage.removeItem("cart");
    if (sessionToken) {
      localStorage.removeItem(`cb:cart:${sessionToken}`);
    }
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
