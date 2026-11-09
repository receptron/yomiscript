# Type-check the demo's JavaScript and the root tests (#70)

## Decision
JSDoc types under `checkJs`, not TypeScript with a build: the demo modules are served as they are (pages, the public
site, `misread_site.sh`), and a build step would sit in front of every page. `eval/`, `yomite/` and `tools/` stay
unchecked (research scripts, not shipped).

## Change
- `demo/ys_web/web/tsconfig.json` (`allowJs`, `checkJs`, DOM) over `*.js`, and `test/tsconfig.json` over the root
  `test/*.js` (which import the demo modules); `yarn typecheck` runs both after the packages.
- `aozora_worker.js` imports `lib/kokoro.mjs`, @yomiscript/kokoro's jsDelivr bundle made by `worker_lib.sh` and not in
  the repository; `types/lib/kokoro.d.mts` re-exports the package's types and `rootDirs` maps the import onto it.
- JSDoc on every function and the module-level state the checker could not infer: parameters, return types where they
  are part of a contract (`painted`, `modelFetcher`, `parseTime`), the story JSON's shape (`aozora.js`), tuples
  (`Word`, `Span`).
- Code changes the checker asked for, each meant to behave the same:
  - `aozora.js`: the classes declare their fields as `this.x = …` in the constructor instead of `Object.assign(this,
    {…})`, which the checker cannot see; `$as(id, kind)` looks an element up and checks its kind (a progress bar, a
    button), so `.value` / `.disabled` are typed; `el()` returns the tag's element type; `Voice.get` returns the
    promise it stored instead of reading it back; an answer from the worker with an id nothing asked for throws with
    that id (it threw a TypeError before).
  - `accent_voice.js`: `fill` keeps the heard morae with their values (`{ k, v }`), and `marksOf` reads each mean
    once into a local, so the checker sees them as non-null.
  - `paint.js`: `cancelAnimationFrame` only for a frame that was requested (it always is by then).
  - the tests: typed fixtures (`read<T>`), fakes and stubs; `readFileSync(…, "utf8")` for `JSON.parse`.

## Verified
- `yarn format`, `yarn lint`, `yarn typecheck`, `yarn build`, `yarn test` (exit 0).
- A wrong call in a test (`pitch("not samples", …)`) now fails `yarn typecheck`.
- `fill` and `marksOf`, old (main) and new copied verbatim, over generated values and kinds: the same result, or both
  throwing, on every case.
- `aozora.html` in Chromium (the page, the worker's bundles and onnxruntime served from the scratchpad, the models and
  dictionary from Hugging Face): it loads, plays the first sentence, moves on with next and with a click on a sentence
  (progress and prev update), pauses; a second visit plays the kept audio. No error but the missing favicon.

## Not covered
- The pages' inline `<script type="module">` in the `.html` files are not type-checked.
- The type-aware lint rules for the JavaScript: a next step of #70.
