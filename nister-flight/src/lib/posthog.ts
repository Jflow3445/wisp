import crypto from "node:crypto";

type PostHogResolvableSettings = {
  analyticsEnabled: boolean;
  analyticsProvider: string;
  analyticsSiteKey: string | null;
  analyticsHost: string | null;
  sessionReplayEnabled: boolean;
  sessionReplaySamplePct: number;
  posthogProjectKey: string | null;
  posthogHost: string | null;
  posthogSessionReplayEnabled: boolean;
  posthogSessionReplaySamplePct: number;
  posthogFeatureFlagsEnabled: boolean;
};

export type ResolvedPostHogConfig = {
  enabled: boolean;
  projectKey: string | null;
  host: string | null;
  sessionReplayEnabled: boolean;
  sessionReplaySamplePct: number;
  featureFlagsEnabled: boolean;
};

const POSTHOG_HOST_ALIASES = new Map<string, string>([
  ["us", "https://us.i.posthog.com"],
  ["us cloud", "https://us.i.posthog.com"],
  ["us (virginia)", "https://us.i.posthog.com"],
  ["us posthog cloud", "https://us.i.posthog.com"],
  ["https://app.posthog.com", "https://us.i.posthog.com"],
  ["https://us.posthog.com", "https://us.i.posthog.com"],
  ["eu", "https://eu.i.posthog.com"],
  ["eu cloud", "https://eu.i.posthog.com"],
  ["eu (frankfurt)", "https://eu.i.posthog.com"],
  ["eu posthog cloud", "https://eu.i.posthog.com"],
  ["https://eu.posthog.com", "https://eu.i.posthog.com"],
]);

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizePostHogHost(value: string | null | undefined) {
  const trimmed = trimToNull(value);
  if (!trimmed) {
    return null;
  }

  const alias = POSTHOG_HOST_ALIASES.get(trimmed.toLowerCase());
  if (alias) {
    return alias;
  }

  try {
    const parsed = new URL(trimmed);
    const isHttps = parsed.protocol === "https:";
    const isLocalDev =
      process.env.NODE_ENV !== "production" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    if (!isHttps && !isLocalDev) {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolvePostHogConfig(settings: PostHogResolvableSettings): ResolvedPostHogConfig {
  const provider = settings.analyticsProvider.trim().toLowerCase();
  const legacyEnabled = settings.analyticsEnabled && provider === "posthog";
  const explicitProjectKey = trimToNull(settings.posthogProjectKey);
  const explicitHostInput = trimToNull(settings.posthogHost);
  const explicitHost = normalizePostHogHost(explicitHostInput);
  const legacyProjectKey = legacyEnabled ? trimToNull(settings.analyticsSiteKey) : null;
  const legacyHost = legacyEnabled ? normalizePostHogHost(settings.analyticsHost) : null;
  const hasExplicitConfig = Boolean(explicitProjectKey || explicitHostInput);
  const projectKey = explicitProjectKey || legacyProjectKey;
  const host = explicitHost || legacyHost;

  return {
    enabled: Boolean(projectKey && host && (hasExplicitConfig || legacyEnabled)),
    projectKey,
    host,
    sessionReplayEnabled: hasExplicitConfig ? settings.posthogSessionReplayEnabled : settings.sessionReplayEnabled,
    sessionReplaySamplePct: hasExplicitConfig ? settings.posthogSessionReplaySamplePct : settings.sessionReplaySamplePct,
    featureFlagsEnabled: hasExplicitConfig ? settings.posthogFeatureFlagsEnabled : true,
  };
}

export function shouldEnablePostHogReplay(input: {
  enabled: boolean;
  samplePct: number;
  seed: string | null | undefined;
}) {
  if (!input.enabled) {
    return false;
  }

  const pct = Math.min(100, Math.max(0, Math.round(input.samplePct)));
  if (pct <= 0) {
    return false;
  }
  if (pct >= 100) {
    return true;
  }

  const seed = String(input.seed || "").trim();
  if (!seed) {
    return false;
  }

  const digest = crypto.createHash("sha256").update(seed, "utf8").digest();
  const bucket = digest.readUInt32BE(0);
  const threshold = Math.floor((pct / 100) * 0x1_0000_0000);
  return bucket < threshold;
}
