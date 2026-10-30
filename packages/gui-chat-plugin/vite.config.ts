// Library build (dist/index.js, core.js, vue.js) and the dev demo (demo/), which serves the Kokoro models, voices and
// onnxruntime's wasm files straight from where they are in the repo, and the Japanese accent dictionary from the
// CLI's cache ($YOMISCRIPT_JA_DICT or ~/.cache/yomiscript/ja-dict/<version>): nothing is copied.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { DICT_VERSION } from "../ja-accent/src/frontend.ts";

const here = path.dirname(fileURLToPath(import.meta.url)),
  repo = path.resolve(here, "../..");
const SERVED: Record<string, string> = {
  "/kokoro/": path.join(repo, "demo/ys_web/web"), // models/ and voices/ (symlinks into demo/ys_web)
  "/ort/": path.join(repo, "node_modules/onnxruntime-web/dist"),
  "/ja-dict/": process.env.YOMISCRIPT_JA_DICT ?? path.join(os.homedir(), ".cache/yomiscript/ja-dict", DICT_VERSION),
};
const TYPES: Record<string, string> = {
  ".onnx": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".wasm": "application/wasm",
  ".mjs": "text/javascript",
  ".gz": "application/octet-stream",
};

function serveModels(): Plugin {
  return {
    name: "yomiscript-serve-models",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? "").split("?")[0]);
        const prefix = Object.keys(SERVED).find((p) => url.startsWith(p));
        if (!prefix) return next();
        const root = SERVED[prefix],
          file = path.resolve(root, url.slice(prefix.length));
        if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}
const src = (p: string) => path.join(repo, `packages/${p}/src/index.ts`);

export default defineConfig(({ command }) => ({
  root: command === "serve" ? path.join(here, "demo") : here,
  plugins: [serveModels()],
  // in the demo, the sibling packages come from their TypeScript sources (no build needed)
  resolve:
    command === "serve" ? { alias: { "@yomiscript/core": src("core"), "@yomiscript/kokoro": src("kokoro"), "@yomiscript/ja-accent": src("ja-accent") } } : {},
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  server: { fs: { allow: [repo] } },
  build: {
    lib: {
      entry: { index: path.join(here, "src/index.ts"), core: path.join(here, "src/core/index.ts"), vue: path.join(here, "src/vue/index.ts") },
      formats: ["es"],
      fileName: (_format, entry) => `${entry}.js`,
    },
    rollupOptions: { external: ["vue", "gui-chat-protocol", "onnxruntime-web", /^@yomiscript\//] },
    outDir: path.join(here, "dist"),
    emptyOutDir: true,
  },
}));
