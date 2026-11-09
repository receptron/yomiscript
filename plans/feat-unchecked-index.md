# Turn on noUncheckedIndexedAccess in the packages (#69)

## Problem
With `noUncheckedIndexedAccess: false` an indexed read (`a[i]`, `table[key]`) is typed as never `undefined`, though at
run time it can be. The checks that guard against it read as dead code, and the reads that need a check have none.

## Approach
Package by package, smallest first; each step sets the option in that package's `tsconfig.json` (and its
`test/tsconfig.json`, `tools/tsconfig.json`), and the base config once every package has it. Each read is handled as
what it is:
- the index cannot be out of range: say so with `defined(value, what)` from `@yomiscript/core`, which throws naming what
  was missing, or restructure so there is no read (destructuring with the value the split always yields, a value
  computed from the same rule as the table);
- it can be: handle `undefined` (`.at()` for a non-negative index, `charAt`, an early return).
No non-null assertion (`!`): it keeps the unchecked read and hides it.

## Step 1: cli, mcp, supertonic, gui-chat-plugin
- `defined()` added to `@yomiscript/core` (with a test).
- supertonic: the engine's session outputs and the Box–Muller pairs through `defined`; the noise mask computed from its
  rule (`t < maskLength`) instead of read back; `toText`'s mora table reads checked, so a vowel with no kana throws the
  existing "no kana for the mora" error instead of returning `undefined` (`きundefined`, or an empty string, for `ɨ`:
  #71 gives `ɨ` its reading); `trailing` reads with `charAt`.
- cli: `player()` returns a non-empty command (`[string, ...string[]]`), so `run()` reads `cmd[0]` as a string.
- supertonic's `tools/build-ambiguous.ts`, the plugin's `vite.config.ts` and demo, the MCP tests: reads checked.

Verified by running the old and new code side by side: `toText` over every onset and vowel combination the parser
knows (and some it rejects), each with and without a following ん / accent mark / っ: the same output or the same error
everywhere except the `ɨ` cases above; the IPAdic row filter of `build-ambiguous.ts` over generated CSV rows: the same
on every row.

## Later steps
`kokoro`, `core`, `ja-accent`, one PR each, the output kept the same (fixtures, `yarn test`, and `eval/kokoro_parity`
where the Kokoro rendering is touched).
