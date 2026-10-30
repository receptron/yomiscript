import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

// tests import the packages' TypeScript sources, not their built dist/
const src = (p) => fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url));
export default defineConfig({
  resolve: {
    // exact names only: subpaths such as @mulmovoice/katarite-kokoro/node resolve as usual
    alias: [
      { find: /^@mulmovoice\/core$/, replacement: src("core") },
      { find: /^@mulmovoice\/katarite-kokoro$/, replacement: src("katarite-kokoro") },
      { find: /^@mulmovoice\/katarite-supertonic$/, replacement: src("katarite-supertonic") },
    ],
  },
  test: { include: ["test/**/*.spec.js", "test/**/*.spec.ts", "packages/*/test/**/*.spec.ts"] },
});
