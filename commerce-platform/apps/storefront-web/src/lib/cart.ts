import type { CartLine } from "./types";

export interface CartState {
  lines: CartLine[];
  ready: boolean;
}

export type CartAction =
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "add"; offerId: string; quantity?: string }
  | { type: "set"; offerId: string; quantity: string }
  | { type: "remove"; offerId: string }
  | { type: "clear" };

export const initialCartState: CartState = { lines: [], ready: false };

export function cartReducer(state: CartState, action: CartAction): CartState {
  if (action.type === "hydrate") return { lines: action.lines, ready: true };
  if (action.type === "clear") return { lines: [], ready: true };
  if (action.type === "remove") return { ...state, lines: state.lines.filter((line) => line.offerId !== action.offerId) };

  if (action.type === "add") {
    const increment = BigInt(action.quantity ?? "1");
    const current = state.lines.find((line) => line.offerId === action.offerId);
    if (!current) return { ...state, lines: [...state.lines, { offerId: action.offerId, quantity: increment.toString() }] };
    return {
      ...state,
      lines: state.lines.map((line) => line.offerId === action.offerId ? { ...line, quantity: (BigInt(line.quantity) + increment).toString() } : line),
    };
  }

  if (BigInt(action.quantity) <= 0n) {
    return { ...state, lines: state.lines.filter((line) => line.offerId !== action.offerId) };
  }
  return { ...state, lines: state.lines.map((line) => line.offerId === action.offerId ? { ...line, quantity: action.quantity } : line) };
}
