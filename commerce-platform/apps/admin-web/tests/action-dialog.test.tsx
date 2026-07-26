import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionDialog } from "@/components/action-dialog";

describe("controlled administrative actions", () => {
  it("requires evidence before confirming payment success", () => {
    render(<ActionDialog endpoint="/admin/payments/pay_01/actions" action="CONFIRM_SUCCESS" title="Confirm payment?" description="Provider evidence required." confirmLabel="Confirm verified success" requireEvidence trigger={<span>Confirm payment</span>} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm verified success" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Complete all required review fields");
  });
});
