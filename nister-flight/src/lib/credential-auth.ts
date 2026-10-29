import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const WP_HASH64 = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export type PasswordCheckUser = {
  id: string;
  passwordHash: string;
};

type UpgradePasswordHash = (input: { userId: string; passwordHash: string }) => Promise<void>;

function md5Buffer(value: Buffer | string) {
  return createHash("md5").update(value).digest();
}

function md5Hex(value: string) {
  return createHash("md5").update(value, "utf8").digest("hex");
}

function encodePhpPass64(input: Buffer, count: number) {
  let output = "";
  let i = 0;
  while (i < count) {
    let value = input[i++] ?? 0;
    output += WP_HASH64[value & 0x3f];

    if (i >= count) {
      break;
    }

    value |= (input[i] ?? 0) << 8;
    output += WP_HASH64[(value >> 6) & 0x3f];
    i += 1;

    if (i >= count) {
      break;
    }

    value |= (input[i] ?? 0) << 16;
    output += WP_HASH64[(value >> 12) & 0x3f];
    i += 1;

    if (i >= count) {
      break;
    }

    output += WP_HASH64[(value >> 18) & 0x3f];
  }
  return output;
}

function verifyWordPressPortableHash(password: string, hash: string) {
  if (!(hash.startsWith("$P$") || hash.startsWith("$H$")) || hash.length < 34) {
    return false;
  }

  const countLog2 = WP_HASH64.indexOf(hash[3] || "");
  if (countLog2 < 7 || countLog2 > 30) {
    return false;
  }

  const salt = hash.slice(4, 12);
  if (salt.length !== 8) {
    return false;
  }

  const passwordBytes = Buffer.from(password, "utf8");
  let digest = md5Buffer(Buffer.concat([Buffer.from(salt, "utf8"), passwordBytes]));
  const iterations = 1 << countLog2;
  for (let i = 0; i < iterations; i += 1) {
    digest = md5Buffer(Buffer.concat([digest, passwordBytes]));
  }

  const encoded = encodePhpPass64(digest, 16);
  const computed = `${hash.slice(0, 12)}${encoded}`;
  return computed.slice(0, 34) === hash.slice(0, 34);
}

async function verifyLegacyImportedPassword(password: string, storedHash: string) {
  const trimmed = storedHash.trim();
  if (!trimmed) {
    return false;
  }

  const wpNormalized = trimmed.startsWith("$wp$") ? trimmed.slice(4) : trimmed;

  if (wpNormalized.startsWith("$2y$")) {
    const normalized = `$2a$${wpNormalized.slice(4)}`;
    try {
      return await bcrypt.compare(password, normalized);
    } catch {
      return false;
    }
  }

  if (wpNormalized.startsWith("$P$") || wpNormalized.startsWith("$H$")) {
    return verifyWordPressPortableHash(password, wpNormalized);
  }

  if (/^[a-f0-9]{32}$/i.test(wpNormalized)) {
    return md5Hex(password) === wpNormalized.toLowerCase();
  }

  return false;
}

async function defaultUpgradePasswordHash(input: { userId: string; passwordHash: string }) {
  await prisma.user.update({
    where: { id: input.userId },
    data: { passwordHash: input.passwordHash },
  });
}

export function normalizeCredentialEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function verifyUserPassword(
  user: PasswordCheckUser,
  password: string,
  options?: { upgradePasswordHash?: UpgradePasswordHash },
) {
  const upgradePasswordHash = options?.upgradePasswordHash || defaultUpgradePasswordHash;

  let verified = false;
  try {
    verified = await bcrypt.compare(password, user.passwordHash);
  } catch {
    verified = false;
  }
  if (verified) {
    return true;
  }

  const legacyVerified = await verifyLegacyImportedPassword(password, user.passwordHash);
  if (!legacyVerified) {
    return false;
  }

  const upgradedHash = await bcrypt.hash(password, 12);
  await upgradePasswordHash({
    userId: user.id,
    passwordHash: upgradedHash,
  });
  return true;
}
