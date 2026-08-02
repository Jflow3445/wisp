import type { MoneyDto } from "@nister/contracts";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export interface CartLine { offerId: string; productId: string; name: string; vendorName: string; unitPrice: MoneyDto; quantity: number; }
export interface CheckoutDraft { step: "delivery" | "review"; idempotencyKey: string; recipientName: string; phone: string; city: string; landmark: string; instructions: string; paymentMethod: "MOBILE_MONEY" | "CARD" | "CASH_ON_DELIVERY"; }
function newCheckoutDraft(): CheckoutDraft { const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; return { step: "delivery", idempotencyKey: `buyer-checkout-${randomPart}`, recipientName: "", phone: "", city: "Accra", landmark: "", instructions: "", paymentMethod: "MOBILE_MONEY" }; }
export interface CommerceState { lines: CartLine[]; checkout: CheckoutDraft; addLine: (line: Omit<CartLine, "quantity">, quantity?: number) => void; setQuantity: (offerId: string, quantity: number) => void; removeLine: (offerId: string) => void; patchCheckout: (patch: Partial<CheckoutDraft>) => void; resetCheckout: () => void; clearAfterOrder: () => void; }

export function createCommerceStore(storage: StateStorage) {
  return createStore<CommerceState>()(persist((set) => ({
    lines: [], checkout: newCheckoutDraft(),
    addLine: (line, quantity = 1) => set((state) => { const existing = state.lines.find((item) => item.offerId === line.offerId); if (!existing) return { lines: [...state.lines, { ...line, quantity }] }; return { lines: state.lines.map((item) => item.offerId === line.offerId ? { ...item, quantity: item.quantity + quantity } : item) }; }),
    setQuantity: (offerId, quantity) => set((state) => ({ lines: quantity <= 0 ? state.lines.filter((line) => line.offerId !== offerId) : state.lines.map((line) => line.offerId === offerId ? { ...line, quantity } : line) })),
    removeLine: (offerId) => set((state) => ({ lines: state.lines.filter((line) => line.offerId !== offerId) })),
    patchCheckout: (patch) => set((state) => ({ checkout: { ...state.checkout, ...patch } })), resetCheckout: () => set({ checkout: newCheckoutDraft() }), clearAfterOrder: () => set({ lines: [], checkout: newCheckoutDraft() }),
  }), { name: "nister-buyer-commerce-v1", storage: createJSONStorage(() => storage) }));
}

export function cartTotal(lines: CartLine[]): MoneyDto { const amountMinor = lines.reduce((sum, line) => sum + BigInt(line.unitPrice.amountMinor) * BigInt(line.quantity), 0n); return { amountMinor: amountMinor.toString(), currency: "GHS", formatted: `GH\u20b5 ${(Number(amountMinor) / 100).toFixed(2)}` }; }
