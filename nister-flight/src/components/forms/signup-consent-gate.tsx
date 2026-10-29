"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

function SignupSubmitButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="premium-btn premium-btn-primary premium-btn-md authx-submit"
      type="submit"
      disabled={!enabled || pending}
      aria-disabled={!enabled || pending}
    >
      {pending ? "Creating account..." : "Create account"}
    </button>
  );
}

export function SignupConsentGate() {
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkbox = checkboxRef.current;
    const form = checkbox?.form;
    if (!checkbox || !form) {
      return;
    }

    const handleSubmit = (event: SubmitEvent) => {
      if (checkbox.checked) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setBlockedMessage("Accept the Terms of Use, Privacy Policy, and Risk Disclosure before creating your account.");
      checkbox.focus();
    };

    form.addEventListener("submit", handleSubmit);
    return () => {
      form.removeEventListener("submit", handleSubmit);
    };
  }, []);

  return (
    <>
      <label className="authx-legal-check">
        <input
          ref={checkboxRef}
          type="checkbox"
          name="legalConsent"
          value="true"
          required
          checked={consentChecked}
          onChange={(event) => {
            setConsentChecked(event.target.checked);
            if (event.target.checked) {
              setBlockedMessage(null);
            }
          }}
        />
        <span>
          I have read and agree to the <Link href="/terms">Terms of Use</Link>, <Link href="/privacy">Privacy Policy</Link>, and{" "}
          <Link href="/risk-disclosure">Risk Disclosure</Link>.
        </span>
      </label>
      {blockedMessage ? <p className="authx-alert authx-alert-error">{blockedMessage}</p> : null}
      <SignupSubmitButton enabled={consentChecked} />
    </>
  );
}
