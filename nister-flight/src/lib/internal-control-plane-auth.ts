import crypto from "node:crypto";
import { errorResponse } from "@/lib/control-plane";
import { getRequestIp, isIpAllowedByList } from "@/lib/request-security";

function timingSafeTokenEquals(expected: string, presented: string) {
  const expectedBuffer = Buffer.from(expected);
  const presentedBuffer = Buffer.from(presented);
  if (expectedBuffer.length !== presentedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, presentedBuffer);
}

function configuredInternalTokens() {
  const tokens = new Set<string>();

  const primary = (process.env.CONTROL_PLANE_INTERNAL_TOKEN || "").trim();
  if (primary) {
    tokens.add(primary);
  }

  const rotating = process.env.CONTROL_PLANE_INTERNAL_TOKENS || "";
  for (const part of rotating.split(/[\r\n,;]+/)) {
    const token = part.trim();
    if (token) {
      tokens.add(token);
    }
  }

  return Array.from(tokens);
}

function configuredIpAllowlist() {
  const value = (process.env.CONTROL_PLANE_INTERNAL_IP_ALLOWLIST || "").trim();
  return value || null;
}

function extractBearerToken(request: Request) {
  const auth = (request.headers.get("authorization") || "").trim();
  if (!auth.startsWith("Bearer ")) {
    return null;
  }
  const token = auth.slice(7).trim();
  return token || null;
}

export function requireInternalControlPlaneToken(request: Request) {
  const expectedTokens = configuredInternalTokens();
  if (!expectedTokens.length) {
    return errorResponse(503, "INTERNAL_TOKEN_UNSET", "Internal control-plane token is not configured");
  }

  const presented = extractBearerToken(request);
  if (!presented) {
    return errorResponse(401, "UNAUTHORIZED", "Missing internal bearer token");
  }

  let matched = false;
  for (const expected of expectedTokens) {
    if (timingSafeTokenEquals(expected, presented)) {
      matched = true;
    }
  }
  if (!matched) {
    return errorResponse(401, "UNAUTHORIZED", "Invalid internal bearer token");
  }

  const allowlist = configuredIpAllowlist();
  if (allowlist) {
    const sourceIp = getRequestIp(request);
    if (!isIpAllowedByList(sourceIp, allowlist)) {
      return errorResponse(403, "IP_NOT_ALLOWED", "Source IP is not allowlisted for internal control-plane access");
    }
  }

  return null;
}
