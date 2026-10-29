"use client";

import { useState } from "react";

type CopyButtonProps = {
  value: string;
  label: string;
  className?: string;
};

async function copyToClipboard(value: string) {
  if (typeof navigator === "undefined") {
    return false;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to document command copy below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={className || "premium-btn premium-btn-secondary premium-btn-md"}
      onClick={async () => {
        if (!value.trim()) {
          return;
        }
        const ok = await copyToClipboard(value);
        if (!ok) {
          return;
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
      title={copied ? "Copied" : label}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
