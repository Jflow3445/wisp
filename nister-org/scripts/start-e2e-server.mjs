import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const npmCommand = "npm";

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? signal}`));
    });
  });
}

try {
  await run(npmCommand, ["run", "build"]);
  await run(npmCommand, ["run", "standalone:prepare"]);
} catch (error) {
  console.error(error);
  process.exit(1);
}

const serverEnv = {
  ...process.env,
  HOSTNAME: process.env.E2E_HOSTNAME ?? "127.0.0.1",
  PORT: process.env.PORT || "3020",
};
const server = spawn(process.execPath, [join(projectRoot, ".next", "standalone", "server.js")], {
  cwd: projectRoot,
  env: serverEnv,
  shell: false,
  stdio: "inherit",
});
let shuttingDown = false;

function stopServer(signal) {
  shuttingDown = true;
  if (!server.killed) {
    server.kill(signal);
  }
}

process.on("SIGINT", () => stopServer("SIGINT"));
process.on("SIGTERM", () => stopServer("SIGTERM"));
server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
server.on("exit", (code, signal) => {
  process.exit(shuttingDown ? 0 : code ?? (signal ? 1 : 0));
});
