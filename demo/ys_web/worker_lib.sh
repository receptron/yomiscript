#!/bin/sh
# The packages the worker of aozora.html imports (web/aozora_worker.js), as jsDelivr's bundles saved on the page's own origin:
# Safari refuses a module script from another origin in a worker under COEP. The Kokoro bundle imports core's by an absolute
# jsDelivr path, which is rewritten to the saved copy.
# usage: sh worker_lib.sh [dir]   (default web/lib, for serve.py; misread_site.sh calls it for the site)
set -eu
cd "$(dirname "$0")"
DIR=${1:-web/lib}
KOKORO=0.1.3
CORE=0.1.5
CDN=https://cdn.jsdelivr.net/npm
mkdir -p "$DIR"
curl -fsS "$CDN/@yomiscript/core@$CORE/+esm" >"$DIR/core.mjs"
curl -fsS "$CDN/@yomiscript/kokoro@$KOKORO/+esm" | sed "s#\"/npm/@yomiscript/core@$CORE/+esm\"#\"./core.mjs\"#" >"$DIR/kokoro.mjs"
# the Kokoro bundle must import nothing but the saved core
if grep -q '"/npm/' "$DIR/kokoro.mjs" || grep -q '"/npm/' "$DIR/core.mjs"; then
  echo "worker_lib.sh: a bundle still imports from jsDelivr" >&2
  exit 1
fi
