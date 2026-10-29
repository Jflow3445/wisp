const GOOGLE_DRIVE_HOSTS = new Set(["drive.google.com", "www.drive.google.com", "docs.google.com"]);

export function walletQrForInvoice(
  method: { walletAddress: string; symbol: string; network: string; qrImageUrl: string | null } | null,
  invoice: { receiveAddress: string; token: string; network: string } | null,
) {
  if (!method || !invoice || method.walletAddress.trim() !== invoice.receiveAddress.trim()
    || method.symbol.trim().toUpperCase() !== invoice.token.toUpperCase()
    || method.network.trim().toUpperCase() !== invoice.network.toUpperCase()) return null;
  return normalizeWalletQrImageUrl(method.qrImageUrl);
}

function driveFileIdFromPath(pathname: string) {
  const match = pathname.match(/\/file\/d\/([^/]+)/i);
  if (!match?.[1]) {
    return null;
  }
  return match[1].trim() || null;
}

export function normalizeWalletQrImageUrl(raw: string | null | undefined) {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (!GOOGLE_DRIVE_HOSTS.has(parsed.hostname.toLowerCase())) {
    return trimmed;
  }

  const fileId = driveFileIdFromPath(parsed.pathname) || parsed.searchParams.get("id");
  if (!fileId) {
    return trimmed;
  }

  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200`;
}
