"use client";

import { useState } from "react";

type CopyRuntimeValuesButtonProps = {
  payload: string;
  className?: string;
};

export function CopyRuntimeValuesButton({ payload, className }: CopyRuntimeValuesButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setState("copied");
    } catch {
      setState("error");
    }
    window.setTimeout(() => setState("idle"), 1800);
  };

  return (
    <button type="button" onClick={copy} className={className} title="Copy these runtime values for MetaTrader setup.">
      {state === "copied" ? "Copied" : state === "error" ? "Copy Failed" : "Copy Values"}
    </button>
  );
}
