# eval/llm_yomite — Can an LLM be the Yomite?

Asks LLM coding agents (Claude Code and Codex, non-interactive) to write YomiScript **with pitch values** (`<f0:…>`, D18), then checks the output and loads it into the web demo so it can be listened to.

## Tasks
- **`text`** — the LLM is the whole Yomite: plain text (+ language, + dialect) → YomiScript with IPA, accent marks, boundaries and pitch values.
- **`marked`** — the LLM is only the prosody stage: YomiScript with accent marks (from `items.json`) → the same text with pitch values added.

Both prompts (`prompt.md`) explain YomiScript and give two worked examples whose values come from the rule-based prosody in `packages/core/src/yomite.ts`, so the scale of the values is shown. Each LLM gets all items in one call and returns JSON. The LLMs run in an empty temporary directory with file and shell tools disabled (Claude Code) or a read-only sandbox (Codex), so they cannot read the repository.

## Files
- `items.json`: test items (source text, language, dialect, reference marked YomiScript) and the two prompt examples
- `prompt.md`: prompt template
- `run.mjs`: builds the prompts, calls the CLIs, saves `results/<llm>.<task>.json` (and the exact prompts as `results/prompt.<task>.md`)
- `score.mjs`: scores the results, writes `results/summary.md`, exports `demo/ys_web/web/llm_presets.json`

## Run
```
node run.mjs                    # both LLMs, both tasks; or e.g.  node run.mjs codex --task marked
node score.mjs
```
Needs `claude` (Claude Code) and `codex` (Codex CLI) installed and signed in.

## Metrics (`results/summary.md`)
- **valid**: the output parses as YomiScript and the Katarite can plan it
- **phoneme err.**: character edit distance between the output IPA and the reference IPA, divided by the reference length (marks, values and `◌̥` ignored)
- **aligned**: items whose units (morae / syllables) match the reference one to one; the next three columns use only these
- **ꜜ F1 (ja)**: agreement of the Japanese accent-nucleus marks with the reference
- **pitch r vs rules**: correlation of the values with the rule-based values; **up/down agree**: share of neighbouring units where the pitch moves in the same direction as the rules
- **coverage**: share of units that have a value
- **text kept** (`marked` only): the output is the input plus values only

The rule-based values are a baseline, not ground truth: an LLM can differ from them and still sound right (or better). Listen in the demo: the exported presets are named `<llm>/<task>/<item>` and play with pitch "as written", so only the LLM's values are used.

## First run (2026-10-29, one run per LLM and task, 7 items)

| LLM (model) | task | valid | phoneme err. | aligned | ꜜ F1 (ja) | pitch r vs rules | up/down agree | coverage | text kept |
|---|---|---|---|---|---|---|---|---|---|
| Claude Code (claude-opus-5-5) | marked | 7/7 | 0.000 | 7 | 1.00 | 0.88 | 0.91 | 0.94 | 7/7 |
| Claude Code (claude-opus-5-5) | text | 7/7 | 0.020 | 4 | 0.82 | 0.63 | 0.78 | 0.94 | – |
| Codex (gpt-6.1-sol) | marked | 7/7 | 0.000 | 7 | 1.00 | 0.94 | 0.99 | 0.99 | 7/7 |
| Codex (gpt-6.1-sol) | text | 7/7 | 0.030 | 3 | 0.60 | 0.47 | 0.82 | 0.96 | – |

- Both LLMs follow the notation. Given marked YomiScript, both add values without touching the text and move the pitch the same way as the rules at 91–99 % of neighbouring units.
- From plain text, the IPA is close to the reference (2–3 % character differences). Most differences are legitimate choices (syllabification `ˈvɪ.zɪ.tɪd`, `ænd` for "and", "sushi" in English rather than a `{ja …}` section); one is a slip (`ni` for に instead of `ɲi`).
- Osaka (Keihan-type) accent is the weak spot: nucleus F1 0.67 (Claude) and 0.29 (Codex), pitch r 0.23 and 0.17 against the rules.
- Claude wrote ASCII `g` for IPA `ɡ`; the parser now accepts both (IPA treats them as the same letter).
- One run each, seven items: differences between the two LLMs are within what a rerun could change. Listen before drawing conclusions.

## English: Kokoro-based Yomite vs. Claude Code vs. Codex (2026-10-29)

`node run.mjs --set en` uses `items_en.json`: 8 English sentences, plus 2 prompt examples whose YomiScript and values come from the Kokoro-based English Yomite (`yomite/en_kokoro`). The same Yomite's output is the reference.

| LLM (model) | valid | phoneme err. vs misaki | aligned | pitch r vs Kokoro | up/down agree | coverage |
|---|---|---|---|---|---|---|
| Claude Code (claude-opus-5-5) | 8/8 | 0.034 | 3 | 0.29 | 0.82 | 1.00 |
| Codex (gpt-6.1-sol) | 8/8 | 0.067 | 2 | 0.33 | 0.70 | 1.00 |

- The clearest difference is at the end of questions: both LLMs raise the pitch on the last syllable (e.g. "door" +6 / +5), Kokoro's predictor lets it fall.
- Sentence-final falls: −4 to −6 semitones from the LLMs, −12 to −16 from Kokoro.
- IPA differences are mostly dialect and transcription choices (`ɹɪ.ˈmɛm.bɚ` vs misaki's `ɹə.ˈmɛm.bəɹ`, unstressed function words).
- In the demo, the presets are grouped by sentence: `en/<sentence>/kokoro`, `en/<sentence>/claude`, `en/<sentence>/codex`, all played "as written".
