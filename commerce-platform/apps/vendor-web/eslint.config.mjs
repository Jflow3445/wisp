import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const requireFromEslint = createRequire(require.resolve("eslint/package.json"));
const { FlatCompat } = requireFromEslint("@eslint/eslintrc");
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**"] },
];
