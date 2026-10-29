import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const DEFAULT_STORAGE_DIR = path.join(process.cwd(), "storage", "runtime-releases");
const RELEASE_UPLOAD_DIR = "uploads";
const ACTIVE_MANIFEST_FILE = "active-release.json";
const DEFAULT_BUNDLED_RELEASE_PATH = path.join(
  process.cwd(),
  "public",
  "runtime",
  "nister-companion-app-package.zip",
);

const DEFAULT_MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".zip", ".exe", ".msi", ".dmg", ".pkg", ".app", ".appimage", ".7z"]);

export type CompanionReleaseRecord = {
  id: string;
  version: string;
  title: string;
  description: string;
  fileName: string;
  relativeFilePath: string;
  fileSizeBytes: number;
  checksumSha256: string;
  mimeType: string;
  createdAt: string;
  createdByUserId: string;
  source?: "manifest" | "bundled";
};

function storageRoot() {
  const configured = process.env.COMPANION_APP_RELEASE_STORAGE_DIR?.trim() || process.env.EA_RELEASE_STORAGE_DIR?.trim();
  return configured && configured.length ? configured : DEFAULT_STORAGE_DIR;
}

function manifestPath() {
  return path.join(storageRoot(), ACTIVE_MANIFEST_FILE);
}

function uploadRoot() {
  return path.join(storageRoot(), RELEASE_UPLOAD_DIR);
}

function bundledReleasePath() {
  const configured = process.env.COMPANION_APP_RELEASE_BUNDLED_FILE?.trim() || process.env.EA_RELEASE_BUNDLED_FILE?.trim();
  if (configured && configured.length) {
    return path.resolve(configured);
  }
  return DEFAULT_BUNDLED_RELEASE_PATH;
}

function parsePositiveInt(raw: string | undefined | null) {
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

export function getCompanionReleaseMaxUploadBytes() {
  const bytesRaw =
    process.env.COMPANION_APP_RELEASE_MAX_UPLOAD_BYTES?.trim() || process.env.EA_RELEASE_MAX_UPLOAD_BYTES?.trim();
  const parsedBytes = parsePositiveInt(bytesRaw);
  if (parsedBytes) {
    return parsedBytes;
  }

  const mbRaw =
    process.env.COMPANION_APP_RELEASE_MAX_UPLOAD_MB?.trim() || process.env.EA_RELEASE_MAX_UPLOAD_MB?.trim();
  const parsedMb = parsePositiveInt(mbRaw);
  if (parsedMb) {
    return parsedMb * 1024 * 1024;
  }

  return DEFAULT_MAX_UPLOAD_BYTES;
}

function normalizeRelativePath(input: string) {
  return input.replace(/\\/g, "/").replace(/^\/+/, "");
}

function resolveWithinStorage(relativePath: string) {
  const root = path.resolve(storageRoot());
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid file path in release metadata.");
  }
  return absolute;
}

function sanitizeFileName(input: string) {
  const safe = input.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return safe.length ? safe : "nister-companion-app-package.zip";
}

function extensionOf(fileName: string) {
  return path.extname(fileName).toLowerCase();
}

function contentTypeForExtension(ext: string) {
  if (ext === ".zip") {
    return "application/zip";
  }
  if (ext === ".exe" || ext === ".msi" || ext === ".pkg") {
    return "application/octet-stream";
  }
  if (ext === ".dmg") {
    return "application/x-apple-diskimage";
  }
  if (ext === ".app" || ext === ".appimage") {
    return "application/octet-stream";
  }
  if (ext === ".7z") {
    return "application/x-7z-compressed";
  }
  return "application/octet-stream";
}

async function ensureStorageDirs() {
  await fs.mkdir(uploadRoot(), { recursive: true });
}

function parseManifest(raw: string): CompanionReleaseRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CompanionReleaseRecord>;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.version !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.description !== "string" ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.relativeFilePath !== "string" ||
      typeof parsed.fileSizeBytes !== "number" ||
      typeof parsed.checksumSha256 !== "string" ||
      typeof parsed.mimeType !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.createdByUserId !== "string"
    ) {
      return null;
    }
    return {
      id: parsed.id,
      version: parsed.version,
      title: parsed.title,
      description: parsed.description,
      fileName: parsed.fileName,
      relativeFilePath: normalizeRelativePath(parsed.relativeFilePath),
      fileSizeBytes: parsed.fileSizeBytes,
      checksumSha256: parsed.checksumSha256,
      mimeType: parsed.mimeType,
      createdAt: parsed.createdAt,
      createdByUserId: parsed.createdByUserId,
      source: "manifest",
    };
  } catch {
    return null;
  }
}

async function writeManifest(record: CompanionReleaseRecord) {
  await ensureStorageDirs();
  const filePath = manifestPath();
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

async function writeUploadFileWithHash(input: {
  file: File;
  absoluteFilePath: string;
  maxUploadBytes: number;
}) {
  await fs.mkdir(path.dirname(input.absoluteFilePath), { recursive: true });
  const tempFilePath = `${input.absoluteFilePath}.uploading`;
  const writeStream = createWriteStream(tempFilePath, { flags: "w" });
  const hash = crypto.createHash("sha256");
  let bytesWritten = 0;

  const hashingLimiter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesWritten += buffer.length;
      if (bytesWritten > input.maxUploadBytes) {
        callback(
          new Error(`Nister AI App package size must be between 1 byte and ${formatByteSize(input.maxUploadBytes)}.`),
        );
        return;
      }
      hash.update(buffer);
      callback(null, buffer);
    },
  });

  try {
    const webStream = input.file.stream();
    await pipeline(webStream as unknown as NodeJS.ReadableStream, hashingLimiter, writeStream);
    await fs.rename(tempFilePath, input.absoluteFilePath);
    return {
      fileSizeBytes: bytesWritten,
      checksumSha256: hash.digest("hex"),
    };
  } catch (error) {
    await fs.rm(tempFilePath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function getActiveCompanionRelease() {
  const manifestRelease = await getActiveCompanionReleaseFromManifest();
  if (manifestRelease) {
    return manifestRelease.release;
  }
  const bundledRelease = await getBundledCompanionRelease();
  return bundledRelease?.release ?? null;
}

export async function getActiveCompanionReleaseWithPath() {
  const manifestRelease = await getActiveCompanionReleaseFromManifest();
  if (manifestRelease) {
    return manifestRelease;
  }
  return await getBundledCompanionRelease();
}

async function getActiveCompanionReleaseFromManifest() {
  try {
    const raw = await fs.readFile(manifestPath(), "utf8");
    const parsed = parseManifest(raw);
    if (!parsed) {
      return null;
    }
    const absoluteFilePath = resolveWithinStorage(parsed.relativeFilePath);
    await fs.access(absoluteFilePath);
    return {
      release: parsed,
      absoluteFilePath,
    };
  } catch {
    return null;
  }
}

async function getBundledCompanionRelease() {
  const absoluteFilePath = bundledReleasePath();
  try {
    const [bytes, stats] = await Promise.all([
      fs.readFile(/* turbopackIgnore: true */ absoluteFilePath),
      fs.stat(/* turbopackIgnore: true */ absoluteFilePath),
    ]);
    const fileName = path.basename(absoluteFilePath);
    const checksumSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const bundledVersion = process.env.COMPANION_APP_RELEASE_BUNDLED_VERSION?.trim() || process.env.EA_RELEASE_BUNDLED_VERSION?.trim() || "bundled-default";
    const bundledTitle =
      process.env.COMPANION_APP_RELEASE_BUNDLED_TITLE?.trim() ||
      process.env.EA_RELEASE_BUNDLED_TITLE?.trim() ||
      "Nister AI App (Bundled Package)";
    return {
      release: {
        id: "companion_bundled_default",
        version: bundledVersion,
        title: bundledTitle,
        description: "Bundled Nister AI App package available when no admin-published release exists.",
        fileName,
        relativeFilePath: normalizeRelativePath(path.relative(process.cwd(), absoluteFilePath)),
        fileSizeBytes: stats.size,
        checksumSha256,
        mimeType: contentTypeForExtension(extensionOf(fileName)),
        createdAt: new Date(stats.mtimeMs || Date.now()).toISOString(),
        createdByUserId: "SYSTEM",
        source: "bundled",
      },
      absoluteFilePath,
    };
  } catch {
    return null;
  }
}

export async function publishCompanionRelease(input: {
  version: string;
  title: string;
  description?: string;
  uploadedByUserId: string;
  file: File;
}) {
  const version = input.version.trim();
  const title = input.title.trim();
  const description = (input.description || "").trim();
  if (!version || !title) {
    throw new Error("Version and title are required.");
  }

  const originalFileName = sanitizeFileName(input.file.name || "nister-companion-app-package.zip");
  const ext = extensionOf(originalFileName);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error("Upload must be one of: .zip, .exe, .msi, .dmg, .pkg, .app, .appimage, .7z");
  }

  const maxUploadBytes = getCompanionReleaseMaxUploadBytes();
  if (!Number.isFinite(input.file.size) || input.file.size <= 0 || input.file.size > maxUploadBytes) {
    throw new Error(`Nister AI App package size must be between 1 byte and ${formatByteSize(maxUploadBytes)}.`);
  }

  const id = `companion_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
  const storedFileName = `${id}_${originalFileName}`;
  const relativeFilePath = normalizeRelativePath(path.posix.join(RELEASE_UPLOAD_DIR, storedFileName));
  const absoluteFilePath = resolveWithinStorage(relativeFilePath);

  await ensureStorageDirs();
  const persistedUpload = await writeUploadFileWithHash({
    file: input.file,
    absoluteFilePath,
    maxUploadBytes,
  });

  const record: CompanionReleaseRecord = {
    id,
    version,
    title,
    description,
    fileName: originalFileName,
    relativeFilePath,
    fileSizeBytes: persistedUpload.fileSizeBytes,
    checksumSha256: persistedUpload.checksumSha256,
    mimeType: contentTypeForExtension(ext),
    createdAt: new Date().toISOString(),
    createdByUserId: input.uploadedByUserId,
    source: "manifest",
  };
  await writeManifest(record);
  return record;
}

export async function unpublishCompanionRelease() {
  try {
    await fs.unlink(manifestPath());
  } catch {
    // Ignore missing manifest so this remains idempotent.
  }
}

export function formatByteSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}
