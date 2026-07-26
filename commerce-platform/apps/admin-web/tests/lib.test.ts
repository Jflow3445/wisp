import { describe, expect, it } from "vitest";
import { apiGet } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import type { LedgerEntry } from "@/lib/types";

describe("admin portal foundations", () => {
  it("formats large and negative minor-unit values exactly", () => {
    expect(formatMoney("113700")).toBe("GHS 1,137.00");
    expect(formatMoney("-2500")).toBe("-GHS 25.00");
  });

  it("keeps seeded ledger fixtures isolated", async () => {
    const first = await apiGet<LedgerEntry[]>("/admin/ledger");
    first[0]!.account = "Changed locally";
    const second = await apiGet<LedgerEntry[]>("/admin/ledger");
    expect(second[0]!.account).toBe("Provider clearing - Hubtel");
  });

  it("defaults unrecognised fixture values to ready", () => {
    expect(resolvePageState("error")).toBe("error");
    expect(resolvePageState("denied")).toBe("ready");
  });
});
