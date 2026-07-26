"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { DeliveryAddress, Order, PaymentSelection } from "@/lib/types";

interface CheckoutState {
  delivery?: DeliveryAddress;
  payment?: PaymentSelection;
  completedOrder?: Order;
}

interface CheckoutContextValue extends CheckoutState {
  ready: boolean;
  setDelivery: (delivery: DeliveryAddress) => void;
  setPayment: (payment: PaymentSelection) => void;
  setCompletedOrder: (order: Order) => void;
  resetCheckout: () => void;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);
const STORAGE_KEY = "nister-checkout";

export function CheckoutProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CheckoutState>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      if (saved) setState(JSON.parse(saved));
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } finally {
      setReady(true);
    }
  }, []);

  const update = (next: CheckoutState) => {
    setState(next);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const value = useMemo<CheckoutContextValue>(() => ({
    ...state,
    ready,
    setDelivery: (delivery) => update({ ...state, delivery }),
    setPayment: (payment) => update({ ...state, payment }),
    setCompletedOrder: (completedOrder) => update({ completedOrder }),
    resetCheckout: () => update({}),
  }), [state, ready]);

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export function useCheckout() {
  const context = useContext(CheckoutContext);
  if (!context) throw new Error("useCheckout must be used inside CheckoutProvider");
  return context;
}
