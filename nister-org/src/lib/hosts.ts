export type NisterWifiExperience = "home" | "network" | "fallback";

export function normalizeHost(rawHost: string | null | undefined) {
  const firstHost = (rawHost || "").split(",")[0]?.trim().toLowerCase();
  if (!firstHost) {
    return "";
  }

  const hostWithProtocol = /^https?:\/\//.test(firstHost) ? firstHost : `https://${firstHost}`;

  try {
    return new URL(hostWithProtocol).hostname.replace(/^www\./, "");
  } catch {
    return firstHost.replace(/^www\./, "").replace(/:\d+$/, "");
  }
}

export function hostForHeaders(input: { host?: string | null; forwardedHost?: string | null }) {
  return normalizeHost(input.forwardedHost) || normalizeHost(input.host);
}

export function resolveExperienceForHost(rawHost: string | null | undefined): NisterWifiExperience {
  const host = normalizeHost(rawHost);

  if (host === "wifi.nister.org" || host === "wifi.localhost") {
    return "network";
  }

  if (host === "nister.org" || host === "nister.localhost") {
    return "home";
  }

  return "fallback";
}

export function isKnownNisterWifiHost(rawHost: string | null | undefined) {
  return resolveExperienceForHost(rawHost) !== "fallback";
}
