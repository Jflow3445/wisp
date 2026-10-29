import crypto from "node:crypto";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map(BASE58_ALPHABET.split("").map((char, idx) => [char, idx]));
function decodeBase58(valueRaw: string): Uint8Array | null {
  const value = String(valueRaw || "").trim();
  if (!value) {
    return null;
  }

  let numeric = BigInt(0);
  for (const char of value) {
    const idx = BASE58_INDEX.get(char);
    if (typeof idx !== "number") {
      return null;
    }
    numeric = numeric * BigInt(58) + BigInt(idx);
  }

  const bytes: number[] = [];
  while (numeric > BigInt(0)) {
    bytes.push(Number(numeric % BigInt(256)));
    numeric /= BigInt(256);
  }
  bytes.reverse();

  let leadingZeros = 0;
  while (leadingZeros < value.length && value.charAt(leadingZeros) === "1") {
    leadingZeros += 1;
  }

  return Uint8Array.from([
    ...new Array(leadingZeros).fill(0),
    ...bytes,
  ]);
}

export function tronAddressHex(raw: string): string | null {
  const decoded = decodeBase58(raw);
  if (!decoded || decoded.length !== 25) {
    return null;
  }

  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21);
  const first = crypto.createHash("sha256").update(Buffer.from(payload)).digest();
  const second = crypto.createHash("sha256").update(first).digest();
  const expectedChecksum = second.subarray(0, 4);

  for (let idx = 0; idx < 4; idx += 1) {
    if (checksum[idx] !== expectedChecksum[idx]) {
      return null;
    }
  }
  if (payload[0] !== 0x41) {
    return null;
  }

  return Buffer.from(payload).toString("hex").toLowerCase();
}
