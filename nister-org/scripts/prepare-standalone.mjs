import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standaloneRoot = join(root, ".next", "standalone");
const standaloneNext = join(standaloneRoot, ".next");
const sourceStatic = join(root, ".next", "static");
const targetStatic = join(standaloneNext, "static");
const sourcePublic = join(root, "public");
const targetPublic = join(standaloneRoot, "public");

if (!existsSync(standaloneRoot)) {
  throw new Error("Standalone output missing. Run next build first.");
}

mkdirSync(standaloneNext, { recursive: true });

if (existsSync(sourceStatic)) {
  rmSync(targetStatic, { recursive: true, force: true });
  cpSync(sourceStatic, targetStatic, { recursive: true });
}

if (existsSync(sourcePublic)) {
  rmSync(targetPublic, { recursive: true, force: true });
  cpSync(sourcePublic, targetPublic, { recursive: true });
}
