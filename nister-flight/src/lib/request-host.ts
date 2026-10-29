import { headers } from "next/headers";

export function normalizeHost(rawHost: string | null | undefined) {
  if (!rawHost) {
    return "";
  }
  return rawHost.split(",")[0].trim().toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
}

export function isOrgParentHost(host: string) {
  return host === "nister.org" || host.endsWith(".nister.org");
}

export function resolveRequestHosts(input: { host: string | null; forwardedHost: string | null }) {
  const resolved = new Set<string>();
  const direct = normalizeHost(input.host);
  const forwarded = normalizeHost(input.forwardedHost);
  if (direct) {
    resolved.add(direct);
  }
  if (forwarded) {
    resolved.add(forwarded);
  }
  return Array.from(resolved);
}

export async function requestHosts() {
  const requestHeaders = await headers();
  return resolveRequestHosts({
    host: requestHeaders.get("host"),
    forwardedHost: requestHeaders.get("x-forwarded-host"),
  });
}

export async function isOrgRequestHost() {
  const hosts = await requestHosts();
  return hosts.some((host) => isOrgParentHost(host));
}
