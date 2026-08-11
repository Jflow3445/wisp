import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(projectRoot, "src");
const tsxCli = require.resolve("tsx/cli");

function testFilesIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      return testFilesIn(fullPath);
    }

    return entry.isFile() && entry.name.endsWith(".test.ts") ? [relative(projectRoot, fullPath)] : [];
  });
}

const testFiles = testFilesIn(sourceRoot).sort((a, b) => a.localeCompare(b));

if (testFiles.length === 0) {
  console.error("No src/**/*.test.ts files found.");
  process.exit(1);
}

const child = spawn(process.execPath, [tsxCli, "--test", ...testFiles], {
  cwd: projectRoot,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
