"use client";

import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { cartReducer, initialCartState } from "@/lib/cart";
import type { CartLine } from "@/lib/types";

interface CartContextValue {
  lines: CartLine[];
  ready: boolean;
  itemCount: number;
  addItem: (offerId: string, quantity?: string) => void;
  setQuantity: (offerId: string, quantity: string) => void;
  removeItem: (offerId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "nister-storefront-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      dispatch({ type: "hydrate", lines: saved ? JSON.parse(saved) : [] });
    } catch {
      dispatch({ type: "hydrate", lines: [] });
    }
  }, []);

  useEffect(() => {
    if (state.ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.lines));
  }, [state.lines, state.ready]);

  const value = useMemo<CartContextValue>(() => ({
    lines: state.lines,
    ready: state.ready,
    itemCount: state.lines.reduce((total, line) => total + Number.parseInt(line.quantity, 10), 0),
    addItem: (offerId, quantity) => dispatch({ type: "add", offerId, quantity }),
    setQuantity: (offerId, quantity) => dispatch({ type: "set", offerId, quantity }),
    removeItem: (offerId) => dispatch({ type: "remove", offerId }),
    clearCart: () => dispatch({ type: "clear" }),
  }), [state.lines, state.ready]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
