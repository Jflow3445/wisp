"use client";

import { useEffect, useRef } from "react";

type IdentifyUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

declare global {
  interface Window {
    posthog?: {
      identify: (distinctId: string, properties?: Record<string, unknown>) => void;
      reset: () => void;
    };
  }
}

type PostHogIdentifyProps = {
  user: IdentifyUser | null;
};

export function PostHogIdentify({ user }: PostHogIdentifyProps) {
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    const posthog = window.posthog;
    if (!posthog) {
      return;
    }

    if (!user) {
      if (identifiedUserId.current) {
        posthog.reset();
        identifiedUserId.current = null;
      }
      return;
    }

    if (identifiedUserId.current === user.id) {
      return;
    }

    posthog.identify(user.id, {
      email: user.email,
      name: user.name,
      role: user.role,
    });
    identifiedUserId.current = user.id;
  }, [user]);

  return null;
}
