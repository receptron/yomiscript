import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

// tests import the packages' TypeScript sources, not their built dist/
const src = (p) => fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url));
export default defineConfig({
  resolve: {
    // exact names only: subpaths such as @yomiscript/kokoro/node resolve as usual
    alias: [
      { find: /^@yomiscript\/core$/, replacement: src("core") },
      { find: /^@yomiscript\/kokoro$/, replacement: src("kokoro") },
      { find: /^@yomiscript\/supertonic$/, replacement: src("supertonic") },
    ],
  },
  test: { include: ["test/**/*.spec.js", "test/**/*.spec.ts", "packages/*/test/**/*.spec.ts"] },
});
