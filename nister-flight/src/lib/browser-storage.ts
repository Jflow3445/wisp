// Browser privacy settings must not interrupt an accepted financial request.
export function readStored(kind: "localStorage" | "sessionStorage", key: string) {
  try { return window[kind].getItem(key); } catch { return null; }
}
export function writeStored(kind: "localStorage" | "sessionStorage", key: string, value: string | null) {
  try { if (value === null) window[kind].removeItem(key); else window[kind].setItem(key, value); } catch { /* Server receipts remain authoritative. */ }
}
