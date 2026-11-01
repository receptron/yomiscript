# Koriyama 2026 benchmark: a matched-prompt ablation (post hoc)

**Post hoc.** eval/koriyama_g2p ran the frozen YomiScript and kana prompts of eval/representation on Koriyama's JVS
benchmark, unchanged; its errors have since been read. The prompts edited here were written after that, from what the
errors showed, so their numbers are not an independent test the way eval/koriyama_g2p's are.

## The question

On all 3,000 sentences the frozen kana prompt scored 0.25-0.27% merged kana CER and the frozen YomiScript prompt
0.63-0.87% (eval/koriyama_g2p). The two prompts are not matched in their guidance:

- The kana prompt's long-vowel examples are 先生 `セーセー`, 東京 `トーキョー`, 時計 `トケー`, 言う `ユー`; the YomiScript
  prompt's are only 先生 `seːseː`, 東京 `toːkʲoː`. Nothing in the YomiScript prompt says that いう is said ユウ, and the
  gold writes 言う / という as ユウ.
- Both prompts spell 先生 with a long vowel (`seːseː`, `セーセー`), where the gold and the standard pronunciation have
  センセー. The LLMs follow it in both containers (Codex's kana answers too).
- What the YomiScript prompt asks and the kana prompt does not: the `<t:…>` original text after every word, word
  spaces with particles as words of their own, the IPA table, and the geminate and moraic-nasal allophone rules (kana
  needs no such rules: ッ and ン are single characters). None of these is reading guidance the kana prompt lacks; the
  `<t:…>` alignment is extra work only the YomiScript answer does, which this ablation does not remove.

Is the gap the container (IPA vs kana) or the guidance?

## Conditions (`conditions.mjs`)

The YomiScript prompts are eval/browser_tts/prompt.md (the frozen prompt) with one parenthesis replaced; nothing else
differs (`run.mjs` writes each condition's first prompt to `results/prompts/`, gitignored).

| condition | long-vowel examples in the Japanese rules |
|---|---|
| YomiScript frozen (runs 1, 2) | (先生 `seːseː`, 東京 `toːkʲoː`) |
| YomiScript matched (a+b) | (先生 `seɴseː`, 東京 `toːkʲoː`, 言う `jɯː`) |
| YomiScript mirror of kana | (先生 `seːseː`, 東京 `toːkʲoː`, 時計 `tokeː`, 言う `jɯː`) |
| kana frozen (runs 1, 2) | the frozen kana prompt, unchanged |

- **matched** is the requested ablation: (a) the kana prompt's いう example, in the prompt's IPA (`jɯː`), and (b) 先生
  corrected to `seɴseː`. The moraic nasal before `s` is `ɴ` (spec §4: `ɴ` before vowels, semivowels, fricatives and at
  the end; the prompt's own rule says the same), and the Kokoro Katarite's parser takes `seɴseː` (and `jɯː`).
- **mirror** is the kana prompt's four examples written in IPA, its 先生 slip included: the same guidance as the kana
  prompt, in the other container. It was added because (b) makes the YomiScript prompt better than the kana prompt
  on 先生, not equal to it.
- **Run 1** of the frozen prompts is eval/koriyama_g2p's own run (its raw answers, read in place); run 2 and the edited
  prompts were run here, so the run-to-run spread of the frozen prompts is measured.
- **LLMs**: Claude Code (`claude`) and Codex (`codex`) through `eval/llm_yomite/llm.mjs`, no tools, 50 sentences per
  call, one run per condition. Models: claude-opus-5-5, gpt-6.1-sol.

## Sentence sets

- **subset**: the 300-sentence stratified subset of eval/koriyama_g2p (the first 300 of its seeded order, its batches
  0..5). Only 5 of its sentences have いう read ユウ and none has 先生, so on it the edits can reach very little.
- **targeted**: every other sentence of the 3,000 with いう / 言う / 云う read ユウ in the gold, or with 先生 (100
  sentences, 88 and 12; two batches, in the seeded order). Run 1 answered them inside eval/koriyama_g2p's batches,
  mixed with other sentences; the other conditions here, in batches of these sentences only.
- **all 3,000**: the matched prompt on every sentence (one run, eval/koriyama_g2p's batches of 50; its batches 0..5
  are the subset's run, the same batches), against eval/koriyama_g2p's frozen run 1. Also, from run 1 alone, how much
  of the frozen gap lies in the 105 sentences the edits reach (subset and targeted).

## Scoring (`score.mjs`)

eval/koriyama_g2p's metrics, imported (`metrics.mjs`, `kana.mjs`): merged kana CER (Koriyama's normalisation, ヲ=オ
ヂ=ジ ヅ=ズ), Koriyama's scorer as is, sentences exact, the merged CER over the answers the parser takes; "Katarite
accepts" is the number of YomiScript utterances the Kokoro Katarite plans as written (`plan()`, `ps` of
eval/browser_tts/reading.mjs); a rejected utterance is read word by word and its rejected words count as deleted, as
in eval/koriyama_g2p (the **lenient** CER, the main number of eval/koriyama_g2p). The **strict** CER counts an
utterance the Katarite rejects as wholly deleted (its whole gold sentence as deletions): the CER a user of the
Katarite would see, since the Katarite says nothing for it. Kana answers are the same in both. 95% intervals: percentile bootstrap over sentences, 2,000 resamples, the same resamples for every
system of a set (for the subset, the very resamples of eval/koriyama_g2p's subset table), so differences are paired.
Errors are put under the first cause that applies to the sentence (not parsed, mora with no kana, 先生 as セエセエ,
いう as イウ, other), so in the targeted set all errors of a いう sentence fall under いう.

## Run

```bash
node ../koriyama_g2p/fetch.mjs        # the benchmark (once)
node run.mjs                          # subset: 4 conditions x 2 LLMs -> results/raw/subset/ (gitignored)
node run.mjs --set targeted           # targeted set -> results/raw/targeted/
node run.mjs yomiscript.matched --set all   # the matched prompt on all 3,000 -> results/raw/all/ (resumable)
node score.mjs                        # -> results/summary.md, results/scores.json; results/items.json (gitignored)
```

## Results (2026-11-01; `results/summary.md`)

Merged kana CER in %, 95% bootstrap interval; differences paired.

**Subset (300 sentences)**

| condition | Claude | Codex |
|---|---|---|
| YomiScript frozen, run 1 | 0.48 [0.28, 0.73] | 0.81 [0.54, 1.12] |
| YomiScript frozen, run 2 | 0.55 [0.33, 0.81] | 1.10 [0.74, 1.51] |
| YomiScript matched (a+b) | 0.67 [0.43, 0.98] | 1.01 [0.69, 1.38] |
| YomiScript mirror of kana | 0.37 [0.20, 0.57] | 0.77 [0.48, 1.09] |
| kana frozen, run 1 | 0.34 [0.15, 0.55] | 0.36 [0.17, 0.59] |
| kana frozen, run 2 | 0.26 [0.12, 0.42] | 0.22 [0.09, 0.39] |

- matched minus frozen YomiScript run 1: Claude +0.20 [-0.09, 0.48], Codex +0.20 [-0.05, 0.47]; matched minus kana run
  1: Claude +0.34 [0.04, 0.64], Codex +0.65 [0.35, 0.98]. mirror minus kana run 1: Claude +0.03 [-0.13, 0.17], Codex
  +0.41 [0.11, 0.71].
- **Run to run** (run 2 minus run 1): YomiScript Claude +0.07 [-0.12, 0.26], Codex +0.29 [0.00, 0.64]; kana Claude
  -0.08 [-0.24, 0.04], Codex -0.14 [-0.33, 0.01]. The spread of the frozen YomiScript prompt (0.3 points for Codex)
  is as large as any effect of the edits on this set.
- **Katarite accepts** (of 300): YomiScript frozen 299 / 298 (Claude), 293 / 289 (Codex); matched 293, 291; mirror
  300, 294. The rejections are the slips eval/koriyama_g2p found (a Latin `r` for `ɾ`, e.g. `tokoro`); their number
  moves from run to run (Claude 1, 2, 7, 0; Codex 7, 11, 9, 6) and is the largest single cause of the differences
  between YomiScript conditions here.
- The edits do what they say on the few sentences they reach: いう as イウ goes from 4-12 characters to 0-1.

| subset, error characters | errors | not parsed | mora with no kana | 先生 | いう | other |
|---|---|---|---|---|---|---|
| YomiScript frozen r1 / r2, Claude | 41 / 47 | 5 / 9 | 0 / 1 | 0 / 0 | 4 / 5 | 32 / 32 |
| YomiScript matched, Claude | 58 | 24 | 0 | 2 | 1 | 31 |
| YomiScript mirror, Claude | 32 | 0 | 0 | 0 | 0 | 32 |
| kana frozen r1 / r2, Claude | 29 / 22 | 0 | 0 | 0 | 6 / 1 | 23 / 21 |
| YomiScript frozen r1 / r2, Codex | 70 / 95 | 21 / 42 | 0 / 3 | 0 | 5 / 12 | 44 / 38 |
| YomiScript matched, Codex | 87 | 31 | 4 | 0 | 0 | 52 |
| YomiScript mirror, Codex | 66 | 18 | 4 | 0 | 0 | 44 |
| kana frozen r1 / r2, Codex | 31 / 19 | 0 | 0 | 0 | 0 | 31 / 19 |

**Targeted (100 sentences with いう or 先生)**

| condition | Claude | Codex |
|---|---|---|
| YomiScript frozen, run 1 | 3.04 [2.57, 3.64] | 2.82 [2.32, 3.43] |
| YomiScript frozen, run 2 | 3.04 [2.68, 3.47] | 3.20 [2.80, 3.69] |
| YomiScript matched (a+b) | **0.35** [0.08, 0.70] | **0.35** [0.08, 0.71] |
| YomiScript mirror of kana | 1.55 [1.20, 1.98] | 0.80 [0.46, 1.22] |
| kana frozen, run 1 | 0.37 [0.17, 0.60] | 0.53 [0.26, 0.87] |
| kana frozen, run 2 | 0.11 [0.00, 0.26] | 0.45 [0.25, 0.69] |

- matched minus kana run 1: Claude -0.03 [-0.36, 0.35], Codex -0.19 [-0.51, 0.19]: on these sentences the matched
  YomiScript prompt is level with kana. It closes 96% [85, 106] (Claude) and 106% [93, 120] (Codex) of the gap
  (frozen prompts as the mean of their two runs).
- Error characters: frozen YomiScript 114 / 114 (Claude), 106 / 120 (Codex), almost all in いう (94-96, 73-96) and 先生
  (13); matched 13 and 13 (none in いう or 先生); kana 14 / 4 and 20 / 17 (Codex's kana keeps 先生 as セーセー, 11-13).
- mirror (いう example added, 先生 slip kept): Codex 0.80, Claude 1.55. Claude still wrote `iɯ` in part of the いう
  sentences (45 characters) and both kept `seːseː` (9-12); with (b) also in (matched) neither happened. One added
  example is followed less reliably than two edits; why the 先生 correction changes the いう readings is not known.
- Run to run: YomiScript Claude +0.00 [-0.49, 0.43], Codex +0.37 [-0.05, 0.78]; kana Claude -0.27 [-0.49, -0.08],
  Codex -0.08 [-0.31, 0.09].

**All 3,000 sentences** (matched: one run; frozen: eval/koriyama_g2p's run 1)

| condition | lenient | strict (rejected = deleted) | Katarite accepts | merged, parsed answers only |
|---|---|---|---|---|
| YomiScript frozen, Claude | 0.63 [0.54, 0.73] | 1.50 [1.09, 1.96] | 2975 | 0.50 |
| YomiScript matched, Claude | **0.54** [0.46, 0.63] | 1.73 [1.26, 2.26] | 2966 | 0.37 |
| kana frozen, Claude | 0.27 [0.20, 0.35] | 0.27 | - | 0.27 |
| YomiScript frozen, Codex | 0.87 [0.77, 0.98] | 3.47 [2.77, 4.22] | 2924 | 0.57 |
| YomiScript matched, Codex | **0.82** [0.72, 0.93] | 3.87 [3.12, 4.73] | 2919 | 0.48 |
| kana frozen, Codex | 0.25 [0.19, 0.30] | 0.25 | - | 0.25 |

Paired differences (lenient; strict in brackets after it):

| | Claude | Codex |
|---|---|---|
| matched minus frozen YomiScript | -0.09 [-0.17, -0.00]; strict +0.24 [-0.21, 0.67] | -0.05 [-0.15, 0.04]; strict +0.40 [-0.36, 1.20] |
| matched minus kana | +0.27 [0.19, 0.36]; strict +1.46 [1.00, 2.01] | +0.57 [0.48, 0.67]; strict +3.62 [2.88, 4.47] |
| frozen YomiScript minus kana | +0.36 [0.29, 0.44]; strict +1.23 [0.82, 1.69] | +0.62 [0.53, 0.73]; strict +3.23 [2.52, 3.98] |

- The matched prompt closes 0.09 of Claude's 0.36-point gap (25%) and 0.05 of Codex's 0.62 (8%); the estimate from
  run 1 and the reached share was 0.52 and 0.77, the measured CER is 0.54 and 0.82. Its いう and 先生 errors fall from
  98 + 13 to 17 + 2 (Claude) and 78 + 13 to 0 (Codex) characters, but its rejected utterances rise (Claude 25 to 34,
  Codex 76 to 81; error characters under "not parsed" 120 to 157 and 282 to 309), which takes back part of the gain.
- Strict, the gap to kana is 3-6 times the lenient gap: 1.50-1.73 (Claude) and 3.47-3.87 (Codex) against kana's
  0.25-0.27. Each rejected utterance costs its whole sentence (29 gold characters on average); 25-81 of them in 3,000 are 1-3% of
  the utterances but most of the strict CER. The matched prompt is not better on this measure (+0.24, +0.40, intervals
  including 0).
- Over the answers the parser takes, the matched prompt is 0.37 (Claude) and 0.48 (Codex) against kana's 0.27 / 0.25.
- From run 1 alone: of the frozen YomiScript-minus-kana gap, 98 of 315 error characters (31%, Claude) and 88 of 546
  (16%, Codex) lie in the 105 sentences the edits reach.
- One Codex call (batch 34) returned a JSON object with 1 of its 50 sentences after 7 s; it was moved aside
  (`results/raw/failed/`, gitignored) and asked again, which answered all 50. No other call failed.

## Conclusion

- **The guidance explains part of the gap, not most of it.** Where they apply, the two edits remove the YomiScript
  excess completely (targeted set, both LLMs level with kana). On all 3,000 sentences the matched prompt scores 0.54
  (Claude) and 0.82 (Codex) against frozen 0.63 / 0.87 and kana 0.27 / 0.25: it closes 25% and 8% of the gap, and the
  matched YomiScript stays above kana by +0.27 [0.19, 0.36] and +0.57 [0.48, 0.67].
- **The rest is the container's own errors**: utterances the Katarite rejects (Latin `r`, a split geminate) and IPA
  slips (`p` for `ɸ`, `sɯ` for `ɕɯ`), which a kana answer cannot make. On the 300-sentence subset, where the edits
  reach almost nothing, the matched prompt is no better than the frozen one (+0.20 for both LLMs, intervals including
  0), and the frozen YomiScript prompt moves by up to 0.3 points between runs, mostly through the number of rejected
  utterances. Over the answers the parser takes, YomiScript on the subset is 0.37-0.44 (Claude) and 0.57-0.68 (Codex),
  kana 0.22-0.36.
- **For a user of the Katarite** (strict CER) the container costs more than the lenient numbers say: 1.50 / 3.47
  frozen and 1.73 / 3.87 matched against kana's 0.27 / 0.25, because 1-3% of the utterances are rejected whole. No
  prompt edit here reduced the rejections; they are what a fix (parser tolerance for `r`, or a repair pass) would
  have to address. The subset and targeted tables in `results/summary.md` have the strict column too.
- **The run-to-run spread** of one 300-sentence run (up to 0.3 points for YomiScript, 0.14 for kana) is as large as
  the edits' effect on the subset, which is why the targeted set was added.

## Limits

- Post hoc, as said above; one run per edited condition.
- The targeted set is chosen by what the edits are about, so it measures whether the edits work, not the overall
  gain; the all-3,000 run is that measure, one run against the frozen prompts' one run on all 3,000.
- In the targeted set the new conditions were asked in batches of いう / 先生 sentences only, run 1 inside mixed
  batches; a batch full of one construction may make it easier to apply a rule consistently.
- Antigravity (Gemini) is not run: no quota.
