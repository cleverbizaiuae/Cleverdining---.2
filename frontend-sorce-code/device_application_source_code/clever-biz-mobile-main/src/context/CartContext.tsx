import React, { createContext, useContext, useState, useEffect } from "react";
import axiosInstance from "../lib/axios";

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
          setCart(backendItems);
        } catch (error) {
          console.error("Failed to fetch cart from server", error);
          // Fallback to namespaced local storage
          const stored = localStorage.getItem(`cb:cart:${sessionToken}`);
          if (stored) setCart(JSON.parse(stored));
        }
      } else {
        // No session, clear cart or handle appropriately
        setCart([]);
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
    // Optimistic update
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i
        );
      } else {
        return [...prev, { ...item, quantity: quantity }];
      }
    });

    // Server sync
    const sessionToken = localStorage.getItem("guest_session_token");
    if (sessionToken) {
      try {
        await axiosInstance.post("/api/customer/cart/add_item/", {
          item_id: item.id,
          quantity: quantity
        });
      } catch (error) {
        console.error("Failed to add item to server cart", error);
      }
    }
  }, []);

  const removeFromCart = React.useCallback(async (id: number) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
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
    const sessionToken = localStorage.getItem("guest_session_token");
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
