# Representation, isolated calls: does the one-call design leak, and is SSML fairer per bunsetsu?

A rerun of eval/representation for two reviewer points:

1. **Leakage.** eval/representation asked for the whole hard set in one call, so both members of a homograph pair
   (上手 じょうず / かみて / うわて, 人気, 一日, 生物, ...) were in the same prompt and a model could read one sentence
   with the other as context. Here the set is asked in calls of about ten items, no two of which share a word, as in
   eval/context_reading.
2. **SSML granularity.** eval/representation put one `<phoneme>` element per orthographic word, which split
   geminates across elements (もらった as `moɾat` + `ta`), a word ending in `t` that the parser rejects. Here SSML
   has one element per bunsetsu (a content word with the particles and auxiliaries that follow it).

## Design

- **Texts, LLMs, runs**: the 70 sentences of `eval/data/hard_set.tsv`; Claude Code (`claude`) and Codex (`codex`)
  through `eval/llm_yomite/llm.mjs`, no tools (Antigravity had no quota); 3 runs. 3 conditions x 2 LLMs x 3 runs x
  7 calls = 126 calls, three at a time per LLM. An answer without JSON is asked once more (none was needed).
- **Calls** (`conditions.mjs`, `results/batches.json`): 7 calls of 10 items. `words.tsv` names, per sentence, the
  words it must not share with another sentence of its call: the target words of `eval/tts_readings/targets.tsv` and
  the hard set's notes, with the same word in another spelling given one name (1日 = 一日, 3日 = 三日, 8日 = 八日,
  20日 = 二十日, 4月 = 四月), and, where in doubt, wider groups: 上手く and 下手 with 上手, the counters 本, 分 and 人,
  何本 with 何. The most constrained sentences are placed first, each in the emptiest call with no shared word (fixed
  seed); within a call the hard set's order. The same calls in every condition and run.
- **YomiScript and kana**: eval/representation's prompts, frozen: `formats.mjs`'s `prompt(format, items)` with the
  call's items, so the text above the item list is byte-identical to `../representation/results/prompt.<format>.md`.
- **SSML per bunsetsu** (`ssml_bunsetsu`): `../representation/prompt_ssml.md` with three sentences replaced
  (`BUNSETSU_EDITS` in `conditions.mjs`) and nothing else:
  - "every word carries its pronunciation" -> "every phrase carries its pronunciation";
  - "Every spoken word is a `<phoneme ...>word</phoneme>` of its own: the element's text is the word as written ..."
    -> "Every spoken phrase is a `<phoneme ...>phrase</phoneme>` of its own: in Japanese a phrase is a bunsetsu, a
    content word with the particles and auxiliaries that follow it (友達と, 買いました, 行った); in other languages it is
    a word. The element's text is the phrase as written ...";
  - "In SSML each of these words is a `<phoneme>` element of its own; a `ph` value never holds more than one word"
    -> "In SSML the words of one phrase go into one `<phoneme>` element, separated by spaces inside its `ph`; a word
    is never split across two elements."

  The IPA rules are the same (taken from the YomiScript prompt, as before). The Japanese examples are
  eval/representation's SSML examples with their elements merged per bunsetsu (`bunsetsu.json`: group sizes, so the
  IPA is not copied; この本、読んだことある？ is already one word per bunsetsu); the English examples are unchanged.
  The example words of the rules are not from the hard set.
- **Scoring** (`score.mjs`): the batches of a condition, LLM and run are joined into one answer of 70 items and scored
  by eval/representation's own code (`evaluate`, `stats`, `kanaTable`, exported from `../representation/score.mjs`):
  the same gold, `loose` comparison, 69 target words and malformed-item checks. SSML per bunsetsu is checked as
  eval/representation's SSML (its `ph` values in order, as one utterance). eval/representation's one-call answers of
  the same two LLMs are scored in the same run for the comparison; they give its published numbers.
- **Intervals**: 95%, percentile bootstrap over the 70 sentences (10000 resamples; the runs of a sentence go
  together); the difference isolated minus one call is paired by sentence.

## Run

```bash
node run.mjs                 # -> results/r<run>/<condition>/<llm>/b<k>.json, results/batches.json, results/prompt.<condition>.b<k>.md
node run.mjs codex kana      # some LLMs / conditions only; a result already there is kept (resumable)
node score.mjs               # -> results/summary.md, results/items.json  (PYTHON: a python with pyopenjtalk,
                             #    default ../prosody_ref/.venv/bin/python, for the kana conversion)
```

Making eval/representation's scorer importable (exports, its main run only when called as a script) left its
output unchanged: `node ../representation/score.mjs` rewrites `results/summary.md` and `results/items.json` byte for
byte (git shows no difference).

## Results (2026-11-01; `results/summary.md`)

Models: claude-opus-5-5, gpt-6.1-sol, the same as in eval/representation. All 126 calls gave JSON with every item.
Percentages over the 3 runs with the 95% interval; malformed items per run of 70.

| condition | LLM | sentence right % | target words right % | malformed / 70 | chars / item | reading chars / item | seconds / call (10 items) |
|---|---|---|---|---|---|---|---|
| YomiScript | Claude | 95.7 [91.4, 99.0] | 99.0 [96.9, 100] | 0.7 | 75 | 39 | 19 |
| YomiScript | Codex | 99.0 [97.1, 100] | 100 [100, 100] | 0 | 75 | 39 | 22 |
| YomiScript | both | 97.4 [95.0, 99.3] | 99.5 [98.4, 100] | 0.3 | 75 | 39 | 21 |
| kana | Claude | 99.0 [97.1, 100] | 99.0 [96.8, 100] | 0 | 16 | 16 | 8 |
| kana | Codex | 99.5 [98.6, 100] | 100 [100, 100] | 0 | 16 | 16 | 8 |
| kana | both | 99.3 [98.1, 100] | 99.5 [98.4, 100] | 0 | 16 | 16 | 8 |
| SSML per bunsetsu | Claude | 94.3 [90.0, 98.1] | 98.1 [94.4, 100] | 1.0 | 198 | 32 | 22 |
| SSML per bunsetsu | Codex | 98.1 [96.2, 99.5] | 99.0 [97.5, 100] | 0.3 | 196 | 32 | 19 |
| SSML per bunsetsu | both | 96.2 [93.8, 98.3] | 98.6 [96.6, 99.8] | 0.7 | 197 | 32 | 21 |

**Isolated minus one call** (percentage points, paired by sentence; one call = eval/representation):

| condition | LLM | sentence: one call -> isolated | difference | target words: one call -> isolated | difference |
|---|---|---|---|---|---|
| YomiScript | Claude | 96.2 -> 95.7 | -0.5 [-4.8, +3.3] | 99.5 -> 99.0 | -0.5 [-2.9, +1.4] |
| YomiScript | Codex | 99.5 -> 99.0 | -0.5 [-2.9, +1.4] | 99.5 -> 100 | +0.5 [0.0, +1.6] |
| YomiScript | both | 97.9 -> 97.4 | -0.5 [-2.9, +1.7] | 99.5 -> 99.5 | 0.0 [-1.3, +1.1] |
| kana | Claude | 100 -> 99.0 | -1.0 [-2.9, 0.0] | 100 -> 99.0 | -1.0 [-3.2, 0.0] |
| kana | Codex | 100 -> 99.5 | -0.5 [-1.4, 0.0] | 100 -> 100 | 0.0 [0.0, 0.0] |
| kana | both | 100 -> 99.3 | -0.7 [-1.9, 0.0] | 100 -> 99.5 | -0.5 [-1.6, 0.0] |
| SSML per bunsetsu (isolated) vs per word (one call) | Claude | 98.6 -> 94.3 | -4.3 [-7.6, -1.9] | 99.0 -> 98.1 | -1.0 [-2.5, 0.0] |
| same | Codex | 92.4 -> 98.1 | +5.7 [+0.5, +11.9] | 95.2 -> 99.0 | +3.9 [-0.5, +9.5] |
| same | both | 95.5 -> 96.2 | +0.7 [-1.9, +3.8] | 97.1 -> 98.6 | +1.4 [-0.8, +4.3] |

Size and time: chars per item are the same as in one call for YomiScript and kana; SSML per bunsetsu is 197 chars
per item against 312 per word (0.63 times; 2.6 times YomiScript, 12 times kana). Claude's output tokens per item
rose a little in small calls (YomiScript 172 against 151, kana 44 against 47, SSML 226 against 287).

What the misses are (`results/summary.md`, "Sentences read wrong"):

- **Readings that differ from the gold**: kana, Claude, h001 シアトルの市 read シ in 2 of 3 runs (in one call, with
  市役所 and 朝市 in the same prompt, イチ in all 3; the hard set's note says し is also possible in context). SSML,
  Claude, SAP read サップ once (it did so once in one-call YomiScript too). No other target word was read another way; the other target-word misses are
  the unparsed items below and Codex's 30分 `sandʑɯː pɯɴ` (closer to サンジューフン than to the gold).
- **The rest are IPA slips**, as in one call: Latin `r` for `ɾ` (Claude 6本 `roppoɴ` in 2 YomiScript and 3 SSML runs,
  Codex GPU を `moderɯ` once: the parser rejects these, which is every malformed item here), `z` for `dz` (経済),
  `u` for `ɯ`, `n` across a word space (何本, 点検を), a lost or added length, a dropped mora (囲碁 `ɡo`), 仮病 `keɡʲoː`,
  NHK `eɴe`, SNS `esɯ esɯ esɯ`, 30分 `sandʑɯː pɯɴ`. Kana: one 25.5 read ニジューゴーテン.
- **SSML per bunsetsu removes the per-word failure**: of the 1323 elements written, none ends in a stop or `ʔ` (one
  per word, Codex split もらった, なった, 買った, 上がった in 12 items, the parser rejecting all of them). Codex's
  malformed items fall from 4 to 0.3 per run and its sentence score rises 5.7 points; Claude's falls 4.3 points on
  IPA slips (`r`, `z`) unrelated to the element boundaries.

## What this says

- **Leakage did not matter measurably.** With no two items of a word in a call, YomiScript and kana score within a
  point of the one-call runs for both LLMs; every interval of the difference contains zero (kana's touches it, from
  one sentence: h001 市, the one reading that may have used its pair in the one-call prompt). The target words, the
  homographs among them, are 99-100% right in both designs. eval/representation's comparison of the formats stands.
- **The per-word SSML profile cost Codex about 6 points and Claude nothing; per bunsetsu, SSML is about as accurate
  as YomiScript** (96.2 against 97.4 pooled, intervals overlapping) and malformed in 0.7 items per 70 (YomiScript
  0.3, kana 0). It is still 2.6 times YomiScript's size and 12 times kana's: the conclusion that SSML's IPA buys
  nothing over YomiScript's at a larger size holds, with the size gap smaller (2.6 times instead of 4.1).
- Kana remains the most accurate container (99.3%, no malformed item); the YomiScript and SSML misses are IPA
  spelling.

## Limits

- Two LLMs, 3 runs, 70 sentences; the intervals resample sentences, not runs or prompts.
- SSML per bunsetsu is compared with SSML per word from the one-call runs, so it changes two things at once; the
  YomiScript and kana rows show that the isolation alone moves the scores by about a point at most.
- "Bunsetsu" is the prompt's definition; whether an element covers exactly one bunsetsu is not checked, only that the
  SSML is well formed and its `ph` values parse.
- The `words.tsv` groups are a judgment; sentences sharing only a common kanji in unrelated words (日 in 日本 and in
  dates) may share a call.
