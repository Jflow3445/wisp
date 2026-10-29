"use client";

import { useSearchParams } from "next/navigation";

const contactIntentDefaults = {
  sales: {
    subject: "Compare runtime options",
    planInterest: "Not sure yet",
  },
  setup: {
    subject: "Setup Questions",
    planInterest: "Managed VPS",
  },
  general: {
    subject: "Risk and Operation",
    planInterest: "Not sure yet",
  },
} as const;

function getContactIntent(input: string | null) {
  if (input === "sales" || input === "setup" || input === "general") {
    return input;
  }
  return "general";
}

export function ContactStatusMessage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const success = searchParams.get("success");

  if (error) {
    return <p className="auth-error">{error}</p>;
  }
  if (success) {
    return <p className="auth-success">{success}</p>;
  }
  return null;
}

export function ContactIntentFields() {
  const searchParams = useSearchParams();
  const intent = getContactIntent(searchParams.get("intent"));
  const defaults = contactIntentDefaults[intent];

  return (
    <>
      <input type="hidden" name="subject" value={defaults.subject} />
      <input type="hidden" name="planInterest" value={defaults.planInterest} />
    </>
  );
}
