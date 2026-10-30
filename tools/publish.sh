#!/bin/sh
# Publishes the packages to npm, in dependency order: builds once, copies the LICENSE into each package
# (tools/prepack.mjs), then runs npm publish (without scripts, the build being done) in each. npm asks for the
# account's approval on the web: it prints a URL (Enter opens it in the browser). A version already on npm is
# skipped, so a run that stopped can simply be run again.
# usage: yarn release             (sh tools/publish.sh, after npm login; not `yarn publish`, which is yarn's own)
#        yarn release --dry-run   (what would be published)
set -eu
cd "$(dirname "$0")/.."
ORDER="core kokoro supertonic ja-accent cli mcp gui-chat-plugin"
DRY=""
[ "${1:-}" = "--dry-run" ] && DRY="--dry-run"

if [ -z "$DRY" ] && ! npm whoami >/dev/null 2>&1; then
  echo "not logged in to npm: run npm login first" >&2
  exit 1
fi
yarn -s build

for p in $ORDER; do
  dir="packages/$p"
  name=$(node -p "require('./$dir/package.json').name")
  version=$(node -p "require('./$dir/package.json').version")
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "= $name@$version is already on npm"
    continue
  fi
  echo "> $name@$version"
  (cd "$dir" && node ../../tools/prepack.mjs && npm publish --ignore-scripts $DRY)
done
