export const PUBLIC_EMAIL_DOMAIN_BLOCK_ERROR =
  "Use a supported public email provider (for example: gmail.com, yahoo.com, or outlook.com).";

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.ca",
  "yahoo.com.au",
  "yahoo.co.in",
  "yahoo.co.jp",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.es",
  "yahoo.it",
  "yahoo.com.br",
  "yahoo.com.mx",
  "yahoo.com.ar",
  "yahoo.com.tr",
  "yahoo.com.tw",
  "yahoo.com.hk",
  "yahoo.co.id",
  "yahoo.co.th",
  "yahoo.com.vn",
  "ymail.com",
  "rocketmail.com",
  "outlook.com",
  "outlook.co.uk",
  "outlook.com.au",
  "outlook.ca",
  "outlook.fr",
  "outlook.de",
  "outlook.es",
  "outlook.it",
  "outlook.com.br",
  "outlook.in",
  "outlook.jp",
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.fr",
  "hotmail.de",
  "hotmail.es",
  "hotmail.it",
  "live.com",
  "live.co.uk",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "aim.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "tuta.com",
  "tuta.io",
  "tutanota.com",
  "tutamail.com",
  "fastmail.com",
  "fastmail.fm",
]);

function normalizeDomain(domain: string) {
  return String(domain || "").trim().toLowerCase().replace(/^\./, "").replace(/\.$/, "");
}

export function extractEmailDomain(email: string) {
  const normalized = String(email || "").trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1) {
    return null;
  }
  const domain = normalizeDomain(normalized.slice(atIndex + 1));
  return domain || null;
}

export function isAllowedPublicEmailDomain(email: string) {
  const domain = extractEmailDomain(email);
  if (!domain) {
    return false;
  }
  return PUBLIC_EMAIL_DOMAINS.has(domain);
}
