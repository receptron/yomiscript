# Supertonic reads ɨ as ɯ (#71)

## Problem
The parser accepts `ɨ` as a Japanese vowel (`JV` in `packages/core/src/yomiscript.ts`), and the Kokoro Katarite reads
it as it reads `ɯ` (`ja /desɨ ↘/` and `ja /desɯ ↘/` both plan to `desɨ`). Supertonic's `toText` has no kana for it:
`sɨ`, `tsɨ`, `zɨ` throw "no kana for the mora". The spec and the LLM instructions write `ɯ`, and no YomiScript in the
repository uses `ɨ`, so this is the two Katarites disagreeing on accepted input rather than a failure seen in practice.

## Fix
`unit()` in `packages/supertonic/src/text.ts` reads `ɨ` as `ɯ`, as it already reads `u`.

## Verified
`test/supertonic_text.spec.js`: `desɨ` → です, `tsɨkɯe` → つくえ, `mizɨ` → みず, `kʲɨː` → きゅー, each the same as
with `ɯ`; the four tests fail without the change.
