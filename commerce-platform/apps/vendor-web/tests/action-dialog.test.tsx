import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionDialog } from "@/components/action-dialog";

describe("controlled vendor actions", () => {
  it("requires a rejection reason before submitting", () => {
    render(<ActionDialog endpoint="/vendor/orders/ord_01/actions" action="REJECT" title="Reject order?" description="Release the reservation." confirmLabel="Reject order" requireReason trigger={<span>Reject</span>} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject order" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Complete all required fields");
  });
});
