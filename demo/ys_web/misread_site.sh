#!/bin/sh
# The misread page as a static site (Cloudflare Pages and the like): the page as index.html, its data, the original
# Kokoro's audio, the station announcement demo (announce.html), 青空朗読文庫 (aozora.html), and the headers that let onnxruntime use several
# threads. The packages and onnxruntime come from jsDelivr, the models from Hugging Face; only the worker of aozora.html has its
# imports on the site itself (lib/, ort/: Safari refuses them from another origin), so the site is about 19 MB.
# usage: sh misread_site.sh [dir]   (default out/misread; after node misread.mjs)
#        npx wrangler pages deploy out/misread --project-name <name>
set -eu
cd "$(dirname "$0")"
OUT=${1:-out/misread}
rm -rf "$OUT"
mkdir -p "$OUT"
cp web/misread.html "$OUT/index.html"
cp web/announce.html web/announce.js web/paint.js web/model_cache.js "$OUT/"
cp web/aozora.html web/aozora.js web/aozora_worker.js "$OUT/"
cp -R web/aozora "$OUT/aozora"
# what the worker imports, on the site's own origin (Safari, see aozora_worker.js); onnxruntime is the pinned version in node_modules
sh worker_lib.sh "$OUT/lib"
mkdir -p "$OUT/ort"
for f in ort.wasm.min.mjs ort-wasm-simd-threaded.mjs ort-wasm-simd-threaded.wasm; do
  cp "web/ort/$f" "$OUT/ort/"
done
cp web/misread.json "$OUT/"
cp -R web/misread "$OUT/misread"
cat >"$OUT/_headers" <<'H'
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
H
du -sh "$OUT"
