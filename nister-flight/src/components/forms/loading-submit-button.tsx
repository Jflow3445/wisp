"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type LoadingSubmitButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  children: ReactNode;
  pendingText?: string;
};

export function LoadingSubmitButton({
  children,
  pendingText = "Processing...",
  disabled,
  className,
  ...rest
}: LoadingSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = Boolean(disabled) || pending;

  return (
    <button
      {...rest}
      type="submit"
      className={className}
      disabled={isDisabled}
      aria-busy={pending}
      aria-live="polite"
    >
      {pending ? (
        <span className="btn-loading-wrap">
          <span className="btn-loading-spinner" aria-hidden="true" />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
