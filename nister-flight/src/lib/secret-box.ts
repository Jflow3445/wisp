import crypto from "node:crypto";

const SECRET_PREFIX = "sb1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

type LoadedKeyring = {
  keys: Map<number, Buffer>;
  activeVersion: number;
};

export type EncryptedSecret = {
  ciphertext: string;
  keyVersion: number;
};

export type DecryptedSecret = {
  plaintext: string;
  encrypted: boolean;
  migratedFromLegacy: boolean;
  keyVersion: number | null;
  needsReencrypt: boolean;
};

function toBase64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

function parseNumericVersion(raw: string | undefined | null): number | null {
  const value = Number.parseInt((raw || "").trim(), 10);
  if (!Number.isFinite(value) || value < 1) {
    return null;
  }
  return value;
}

function keyBufferFromConfig(raw: string): Buffer | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  // Accept raw 32-byte material encoded as base64url, base64, or hex.
  const tryEncodings: Array<Buffer | null> = [
    (() => {
      try {
        return Buffer.from(value, "base64url");
      } catch {
        return null;
      }
    })(),
    (() => {
      try {
        return Buffer.from(value, "base64");
      } catch {
        return null;
      }
    })(),
    (() => {
      if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) {
        return null;
      }
      try {
        return Buffer.from(value, "hex");
      } catch {
        return null;
      }
    })(),
  ];

  for (const candidate of tryEncodings) {
    if (candidate && candidate.length === 32) {
      return candidate;
    }
  }

  // For operator convenience, accept passphrases and harden to 256-bit keys.
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function parseKeyMap(raw: string): Map<number, Buffer> {
  const out = new Map<number, Buffer>();
  for (const token of raw.split(",")) {
    const part = token.trim();
    if (!part) {
      continue;
    }
    const sep = part.indexOf(":");
    if (sep <= 0) {
      continue;
    }
    const version = parseNumericVersion(part.slice(0, sep));
    const key = keyBufferFromConfig(part.slice(sep + 1));
    if (!version || !key) {
      continue;
    }
    out.set(version, key);
  }
  return out;
}

function loadKeyring(): LoadedKeyring {
  const parsed = parseKeyMap(process.env.SECRET_ENCRYPTION_KEYS || "");
  const directVersion = parseNumericVersion(process.env.SECRET_ENCRYPTION_ACTIVE_KEY_VERSION) || 1;
  const directKey = keyBufferFromConfig(process.env.SECRET_ENCRYPTION_KEY || "");
  if (directKey && !parsed.has(directVersion)) {
    parsed.set(directVersion, directKey);
  }

  if (!parsed.size) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Secret encryption key is not configured. Set SECRET_ENCRYPTION_KEYS or SECRET_ENCRYPTION_KEY in production.",
      );
    }
    const devSeed = process.env.SESSION_SECRET?.trim() || "development-secret-box-key-change-me";
    parsed.set(1, crypto.createHash("sha256").update(`dev:${devSeed}`, "utf8").digest());
  }

  const activeVersion =
    parseNumericVersion(process.env.SECRET_ENCRYPTION_ACTIVE_KEY_VERSION) ||
    Math.max(...Array.from(parsed.keys()));
  const activeKey = parsed.get(activeVersion);
  if (!activeKey) {
    throw new Error(`Active secret encryption key version ${activeVersion} is not configured.`);
  }

  return {
    keys: parsed,
    activeVersion,
  };
}

function parseCiphertext(raw: string): {
  keyVersion: number;
  iv: Buffer;
  encrypted: Buffer;
  tag: Buffer;
} | null {
  const parts = raw.split(":");
  if (parts.length !== 5 || parts[0] !== SECRET_PREFIX) {
    return null;
  }
  const keyVersion = parseNumericVersion(parts[1]);
  if (!keyVersion) {
    return null;
  }
  try {
    const iv = fromBase64Url(parts[2]);
    const encrypted = fromBase64Url(parts[3]);
    const tag = fromBase64Url(parts[4]);
    if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
      return null;
    }
    return { keyVersion, iv, encrypted, tag };
  } catch {
    return null;
  }
}

function decryptWithKey(parsed: { iv: Buffer; encrypted: Buffer; tag: Buffer }, key: Buffer) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, parsed.iv);
  decipher.setAuthTag(parsed.tag);
  const first = decipher.update(parsed.encrypted);
  const last = decipher.final();
  return Buffer.concat([first, last]).toString("utf8");
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const keyring = loadKeyring();
  const key = keyring.keys.get(keyring.activeVersion);
  if (!key) {
    throw new Error(`Missing active secret encryption key version ${keyring.activeVersion}`);
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: [
      SECRET_PREFIX,
      String(keyring.activeVersion),
      toBase64Url(iv),
      toBase64Url(encrypted),
      toBase64Url(tag),
    ].join(":"),
    keyVersion: keyring.activeVersion,
  };
}

export function decryptSecret(rawValue: string | null | undefined, storedKeyVersion?: number | null): DecryptedSecret {
  const value = String(rawValue || "");
  if (!value) {
    return {
      plaintext: "",
      encrypted: false,
      migratedFromLegacy: false,
      keyVersion: null,
      needsReencrypt: false,
    };
  }

  const keyring = loadKeyring();
  const parsed = parseCiphertext(value);
  if (!parsed) {
    return {
      plaintext: value,
      encrypted: false,
      migratedFromLegacy: true,
      keyVersion: storedKeyVersion ?? null,
      needsReencrypt: true,
    };
  }

  const candidateVersions: number[] = [];
  if (parsed.keyVersion) {
    candidateVersions.push(parsed.keyVersion);
  }
  if (storedKeyVersion && !candidateVersions.includes(storedKeyVersion)) {
    candidateVersions.push(storedKeyVersion);
  }
  for (const version of keyring.keys.keys()) {
    if (!candidateVersions.includes(version)) {
      candidateVersions.push(version);
    }
  }

  for (const version of candidateVersions) {
    const key = keyring.keys.get(version);
    if (!key) {
      continue;
    }
    try {
      const plaintext = decryptWithKey(parsed, key);
      return {
        plaintext,
        encrypted: true,
        migratedFromLegacy: false,
        keyVersion: parsed.keyVersion,
        needsReencrypt: parsed.keyVersion !== keyring.activeVersion,
      };
    } catch {
      // Try next candidate key.
    }
  }

  throw new Error("Unable to decrypt secret with configured encryption keys.");
}
