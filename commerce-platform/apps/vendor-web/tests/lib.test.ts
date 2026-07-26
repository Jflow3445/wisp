import { describe, expect, it } from "vitest";
import { apiGet } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import type { Order } from "@/lib/types";

describe("vendor portal foundations", () => {
  it("formats integer minor units without floating point", () => {
    expect(formatMoney("42850")).toBe("GHS 428.50");
    expect(formatMoney("-318450")).toBe("-GHS 3,184.50");
  });

  it("returns isolated seeded API records", async () => {
    const first = await apiGet<Order[]>("/vendor/orders");
    first[0]!.customer = "Changed locally";
    const second = await apiGet<Order[]>("/vendor/orders");
    expect(second[0]!.customer).toBe("Abena Owusu");
  });

  it("only enables explicit demo page states", () => {
    expect(resolvePageState("permission")).toBe("permission");
    expect(resolvePageState("unknown")).toBe("ready");
  });
});
