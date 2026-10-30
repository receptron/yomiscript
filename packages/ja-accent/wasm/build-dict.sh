#!/bin/sh
# Builds the accent dictionary from the published jpreprocess (crates.io), the same version the WebAssembly uses:
# jpreprocess-naist-jdic's build makes the lindera/jpreprocess dictionary from NAIST-JDIC, and its files are gzipped
# into OUT/jpreprocess-<version>/; OUT also gets the repository card (dict-README.md) and the crate's NOTICE, so OUT
# is what is uploaded to Hugging Face (receptron/yomiscript-ja-dict). Needs cargo. usage: sh build-dict.sh OUT
set -eu
VERSION=0.15.0
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$1/jpreprocess-$VERSION
WORK=$(mktemp -d)
cargo install jpreprocess --version "=$VERSION" --features naist-jdic,binary --locked --root "$WORK/root" --target-dir "$WORK/target"
DICT=$(find "$WORK/target" -type d -path "*jpreprocess-naist-jdic-*/out/naist-jdic" | head -1)
mkdir -p "$OUT"
for f in "$DICT"/*; do # the eight files src/frontend.ts reads (DICT_FILES)
  gzip -9 -n -c "$f" > "$OUT/$(basename "$f").gz"
done
cp "$HERE/dict-README.md" "$1/README.md"
cp "$(find "${CARGO_HOME:-$HOME/.cargo}/registry/src" -path "*/jpreprocess-naist-jdic-$VERSION/NOTICE.txt" | head -1)" "$1/NOTICE"
rm -rf "$WORK"
ls -l "$1" "$OUT"
