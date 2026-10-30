// Library build (dist/index.js, core.js, vue.js) and the dev demo (demo/), which serves the Kokoro models, voices and
// onnxruntime's wasm files straight from where they are in the repo: nothing is copied.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url)),
  repo = path.resolve(here, "../..");
const SERVED: Record<string, string> = {
  "/kokoro/": path.join(repo, "demo/ys_web/web"), // models/ and voices/ (symlinks into demo/ys_web)
  "/ort/": path.join(repo, "node_modules/onnxruntime-web/dist"),
};
const TYPES: Record<string, string> = {
  ".onnx": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".wasm": "application/wasm",
  ".mjs": "text/javascript",
};

function serveModels(): Plugin {
  return {
    name: "mulmovoice-serve-models",
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
  resolve: command === "serve" ? { alias: { "@mulmovoice/core": src("core"), "@mulmovoice/katarite-kokoro": src("katarite-kokoro") } } : {},
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  server: { fs: { allow: [repo] } },
  build: {
    lib: {
      entry: { index: path.join(here, "src/index.ts"), core: path.join(here, "src/core/index.ts"), vue: path.join(here, "src/vue/index.ts") },
      formats: ["es"],
      fileName: (_format, entry) => `${entry}.js`,
    },
    rollupOptions: { external: ["vue", "gui-chat-protocol", "onnxruntime-web", /^@mulmovoice\//] },
    outDir: path.join(here, "dist"),
    emptyOutDir: true,
  },
}));
