"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

type DelayedSubmitButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  children: ReactNode;
  pendingText?: string;
  waitSeconds?: number;
};

export function DelayedSubmitButton({
  children,
  pendingText = "Processing...",
  waitSeconds = 6,
  disabled,
  className,
  ...rest
}: DelayedSubmitButtonProps) {
  const { pending } = useFormStatus();
  const initialWait = useMemo(() => Math.max(0, Math.trunc(waitSeconds)), [waitSeconds]);
  const [remaining, setRemaining] = useState(initialWait);

  useEffect(() => {
    setRemaining(initialWait);
  }, [initialWait]);

  useEffect(() => {
    if (remaining <= 0 || pending) {
      return;
    }
    const timer = window.setTimeout(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [remaining, pending]);

  const waiting = remaining > 0;
  const isDisabled = Boolean(disabled) || pending || waiting;

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
      ) : waiting ? (
        `Wait ${remaining}s before confirming`
      ) : (
        children
      )}
    </button>
  );
}
