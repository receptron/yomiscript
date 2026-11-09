# Type-check the package tests and enable the type-aware lint rules (#67)

## Problem
- `yarn typecheck` ran `tsc -b` on each package's `src` only. The package tests were in no tsconfig, and Vitest strips
  types without checking them, so a test could use a type it never imported and still pass.
- The plugin's own `typecheck` (its `src`, `demo`, `test`) was not part of `yarn typecheck`.
- ESLint ran typescript-eslint's `recommended`, without the rules that need type information.

## Change
- `test/tsconfig.json` in each package with tests (and `packages/supertonic/tools/tsconfig.json` for its build script):
  the base config, no emit, `rewriteRelativeImportExtensions` off (a test imports another project's sources).
  `yarn typecheck` builds the packages, then checks these, then runs the plugin's `typecheck`. The same files are what
  the ESLint project service finds for each test.
- `recommendedTypeChecked` for `**/*.ts`, at error like every other rule; `.vue` and `.tsx` keep `recommended`.
- Fixes for what they found:
  - test types: the missing `Sentence` / `Analyzer` imports and the fields of `Cand` the sample lacked; the fake fetch's body type.
    `cachedLoader` (Node) is typed as returning `Uint8Array`, which it always did.
  - three checks the types called always false (`=== undefined` on an array index): the index can be out of range at
    run time, so the reads use `.at()`, whose type says so, and the checks stay. The indices there are never negative,
    where `.at()` would count from the end.
  - `match` on a non-global regex as `exec`; casts the types no longer need (`ort as unknown as Ort`).
  - a bare `sort()`: the rule proposes `localeCompare`, which orders differently; `byCodeUnit` states the default order.
  - `JSON.parse` results in tests typed with `as`, as the sources already do.
- `yarn lint` builds the packages' types first (the type-aware rules read `@yomiscript/*` from `dist/`) and runs ESLint
  without `--cache`: the cache does not re-lint a file when only a type it imports changes.
- the test fakes for async interfaces return `Promise.resolve(...)` / `Promise.reject(...)` instead of being `async`
  with nothing to await, so `@typescript-eslint/require-await` applies to the tests too. It is off for the plugin's
  `plugin.ts` only, by name with the reason: `executeSpeak` stays `async` with nothing to await, because being async is
  what makes a throw while reading the arguments a rejection; a test pins that.

## Verified
- `yarn format`, `yarn lint`, `yarn typecheck`, `yarn build`, `yarn test`.
- `byCodeUnit` against a bare `sort()` on generated lists (Latin, kana, kanji, surrogate pairs, combining marks,
  control characters): the same order on every list.

## Out of scope
- `noUncheckedIndexedAccess`: it is what would make an index honest everywhere; on today's packages it reports
  several hundred errors, a change of its own.
- The JavaScript (`demo/ys_web/web/*.js`, `test/*.js`, `eval/`).
