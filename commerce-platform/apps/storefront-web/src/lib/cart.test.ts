import { describe, expect, it } from "vitest";
import { cartReducer, initialCartState } from "./cart";

describe("cart reducer", () => {
  it("adds quantities for an existing offer", () => {
    const first = cartReducer(initialCartState, { type: "hydrate", lines: [] });
    const second = cartReducer(first, { type: "add", offerId: "offer-1", quantity: "2" });
    const third = cartReducer(second, { type: "add", offerId: "offer-1" });
    expect(third.lines).toEqual([{ offerId: "offer-1", quantity: "3" }]);
  });

  it("removes a line when quantity reaches zero", () => {
    const state = { ready: true, lines: [{ offerId: "offer-1", quantity: "1" }] };
    expect(cartReducer(state, { type: "set", offerId: "offer-1", quantity: "0" }).lines).toEqual([]);
  });

  it("preserves unrelated cart lines", () => {
    const state = { ready: true, lines: [{ offerId: "offer-1", quantity: "1" }, { offerId: "offer-2", quantity: "4" }] };
    expect(cartReducer(state, { type: "remove", offerId: "offer-1" }).lines).toEqual([{ offerId: "offer-2", quantity: "4" }]);
  });
});
