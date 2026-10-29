function normalizeFallbackUrl(fallbackValue: string) {
  const trimmed = (fallbackValue || "").trim();
  if (!trimmed) {
    return "/";
  }

  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//")) {
      return "/";
    }
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) {
      return "/";
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "/";
    }
    return parsed.toString();
  } catch {
    return "/";
  }
}

export function sanitizeNavigableUrl(rawUrl: string | null | undefined, fallbackPath = "/") {
  const fallback = normalizeFallbackUrl(fallbackPath);
  const value = (rawUrl || "").trim();
  if (!value) {
    return fallback;
  }

  if (value.startsWith("/")) {
    if (value.startsWith("//")) {
      return fallback;
    }
    return value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      return fallback;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}
