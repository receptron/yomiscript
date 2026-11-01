# Koriyama 2026 benchmark: the frozen YomiScript and kana prompts on an independent, hand-annotated set

Reviewers of the paper pointed out that the Japanese hard set (`eval/data/hard_set.tsv`, 70 sentences) is our own,
and that the prompts and the scoring were developed on it. This experiment runs the same prompts, unchanged, on a
set we did not make and did not look at while writing them: the 3,000 hand-annotated sentences of Koriyama 2026
("Benchmarking Large Language Models for Grapheme-to-Phoneme Conversion: A Japanese Case Study", Interspeech 2026,
arXiv 2606.22009; `koriyama2026g2p` in `paper/references.bib`), scored with his metric, kana character error rate.

## Data and license

- **Source**: <https://github.com/CyberAgentAILab/jvs_nonpara_kana>, commit `3c7f1cd` (2026-06-17), linked from the
  paper. `jvs_nonpara_kana.csv`: `base, text, kana` for the 3,000 utterances of the JVS corpus' nonpara subset (100
  speakers x 30 sentences; the texts come from JSUT's BASIC5000, TRAVEL1000, ONOMATOPEE300, LOANWORD128 and from
  UT-PARAPHRASE), with a manually annotated katakana reading by pronunciation (particles は ワ, を オ, へ エ; long
  vowels `ー`; `、` at pauses; no `。`).
- **License**: the CSV is CC BY-SA 4.0 (derived from the JVS corpus, CC BY-SA 4.0, by Shinnosuke Takamichi et al.);
  the scorer `eval_cer.py` is MIT. Use is allowed; redistribution would carry the share-alike terms, so the data is
  kept out of this repository: `node fetch.mjs` downloads it at the fixed commit into `data/` (gitignored) and checks
  its SHA-256. Everything that repeats the sentences (the raw answers, which hold the text in `<t:…>`, the prompts,
  the per-sentence results) stays in gitignored folders too; only aggregate scores are committed
  (`results/summary.md`, `results/scores.json`, which name sentences only by their row number `s0001`..`s3000`).
  The few example readings quoted below are attributed to the dataset, as CC BY-SA asks.

## Design

- **Frozen prompts.** The `yomiscript` and `kana` prompts of `eval/representation` (its `prompt()` in `formats.mjs`,
  imported, not copied; the YomiScript one is `eval/browser_tts/prompt.md` with its examples), with no change to their
  wording, examples or rules. Only the item list differs. Nothing in them was written for or tuned on this set.
  The kana prompt asks for を as `ヲ` (as the hard set's gold), where this gold writes `オ`; that is a difference of
  convention, kept, and handled in scoring (below).
- **LLMs**: Claude Code (`claude`), Codex (`codex`), Antigravity (`agy`, Gemini) through `eval/llm_yomite/llm.mjs`, no
  tools, as in eval/representation. 50 sentences per call (eval/representation used 70 sentences of 12 characters;
  these average 25 characters), one run. An answer without JSON is asked once more.
- **Sentences** (`items.mjs`): a stratified random subset of 300 (10% of each JVS source corpus: BASIC5000 184,
  TRAVEL1000 59, UT-PARAPHRASE 31, ONOMATOPEE300 18, LOANWORD128 8; seeded shuffle), then the other 2,700, all in a
  fixed order; batches of 50 follow it, so the subset is batches 0..5 and a full run adds batches 6..59.
- **pyopenjtalk** (plain text, `pyopenjtalk.g2p(text, kana=True)`, version 0.4.1 in `eval/prosody_ref/.venv`) on the
  same sentences, as the conventional baseline (Koriyama's best conventional tool is OpenJTalk).

## Scoring (`score.mjs`, `kana.mjs`)

Every answer becomes katakana and is compared with the gold by character edit distance, summed over the sentences and
divided by the gold's characters (as `eval_cer.py`: jiwer's CER per sentence times its length, summed).

- **YomiScript -> kana**: the YomiScript parser (`@yomiscript/core` `parse`) gives the Japanese morae (onset, vowel;
  moraic nasal, geminate, long vowel); each mora is written with the kana that `tools/yomiscript/kana2ipa.py` spells
  that way (its table, read through `helper.py`, inverted; the first kana wins, which gives ジ ズ オ for `dʑi dzɯ o`
  as the gold writes them), plus a few contracted moras the table does not list (フャ ヴャ テャ デョ ...). `N` ン,
  `Q` ッ, `ː` ー. Spellings the parser takes for the same sound are read as the table's (`z` = `dz`, Latin `u` = `ɯ`,
  `hi` = `çi`, `ʨ` = `tɕ`). An utterance the parser rejects is read word by word, and a word it rejects gives
  nothing (a Latin `r`, or a consonant left at the end of a word, as in `saɲdʑɯs seɴto`): the Katarite could not say
  it, so it counts as deleted. A mora with no kana (another language's syllable) is one wrong character.
- **Kana answers** as written (hiragana read as katakana).
- **Normalisation, Koriyama's** (`eval_cer.py`, ported in `kana.mjs` and checked to give the same string on all 3,000
  gold readings): `ー` is replaced by the vowel of the kana before it, and `、` is removed. Our answers also have
  `。` / `？` (the frozen kana prompt asks for them); all punctuation is removed.
- **Three numbers per system**:
  - **kana CER, Koriyama's scorer**: exactly his normalisation. The kana prompt's `ヲ` for を counts as an error
    here, as does pyopenjtalk's `ヲ`.
  - **kana CER, merged** (the main number): also ヲ = オ, ヂ = ジ, ヅ = ズ (spellings of one sound; the gold uses
    only オ ジ ズ). Koriyama's conventional tools went through "particle conversion and long vowel normalization"
    before scoring, so his OpenJTalk 1.03% corresponds to this column, not to the first.
  - **phoneme CER**: the coarse phoneme spelling of eval/representation (`reading.mjs` `loose` of what Kokoro is
    given), the gold and kana answers through `eval/representation/kana.py`. It is stricter than kana on IPA slips
    the kana mapping forgives (`z` for `dz`, Latin `u`) and looser on spelling (long vowels, allophones). 8 gold
    readings (rare loanword moras such as ヴャ, フョ, デョ) cannot be converted by kana2ipa and are left out of it.
- **95% intervals**: percentile bootstrap over sentences, 2,000 resamples, the same resamples for every system, so
  the YomiScript minus kana differences are paired.

## Run

```bash
node fetch.mjs                       # the benchmark -> data/ (gitignored)
node run.mjs                         # the 300-sentence subset: 3 LLMs x 2 formats -> results/raw/ (gitignored)
node run.mjs codex --n 3000          # all 3,000 for one LLM; --parallel 3 calls at a time (default 2)
node score.mjs                       # -> results/summary.md, results/scores.json; results/items.json (gitignored)
```

A result already on disk is kept, so a run that stopped continues where it was.

## Results (2026-11-01; `results/summary.md`, `results/scores.json`)

Models: claude-opus-5-5, gpt-6.1-sol, gemini-4-argon-medium. Kana CER in %, merged (ヲ=オ ヂ=ジ ヅ=ズ; the column
comparable to Koriyama's numbers, see Scoring), 95% bootstrap interval over sentences.

| system | 300 (stratified subset) | 1,250 (all 3 LLMs) | 3,000 (all) | 3,000, Koriyama's scorer as is | 3,000, sentences exact % |
|---|---|---|---|---|---|
| YomiScript, Claude | 0.48 [0.28, 0.73] | 0.77 [0.60, 0.97] | **0.63** [0.53, 0.73] | 0.63 | 90.2 |
| YomiScript, Codex | 0.81 [0.54, 1.12] | 0.88 [0.73, 1.04] | **0.87** [0.77, 0.99] | 0.87 | 87.9 |
| YomiScript, Antigravity | 0.71 [0.42, 1.07] | 0.97 [0.78, 1.16] | - | - | - |
| kana, Claude | 0.34 [0.15, 0.55] | 0.35 [0.22, 0.53] | **0.27** [0.20, 0.34] | 2.14 | 96.0 |
| kana, Codex | 0.36 [0.17, 0.59] | 0.35 [0.24, 0.47] | **0.25** [0.20, 0.30] | 2.11 | 96.2 |
| kana, Antigravity | 0.43 [0.25, 0.63] | 0.47 [0.33, 0.63] | - | - | - |
| pyopenjtalk (plain text) | 1.06 [0.57, 1.77] | 1.06 [0.86, 1.28] | **1.05** [0.92, 1.21] | 2.88 | 85.8 |

YomiScript minus kana (same LLM, paired): 3,000 sentences Claude +0.36 [0.29, 0.44], Codex +0.62 [0.53, 0.73];
1,250 sentences Antigravity +0.50 [0.32, 0.68]. On the subset the Claude and Antigravity intervals include 0.

**Koriyama's published numbers** (all 3,000 sentences; other model versions): best LLMs 0.52 (Claude Opus 4.6,
parse: the LLM tags morphemes, rules make the kana), 0.53 (Gemini 3.1 Pro, direct kana), 0.74 (Claude Opus 4.6,
direct); best conventional tool OpenJTalk 1.03, then KyTea 1.42, MeCab+UniDic 1.54.

- **The scorer reproduces his baseline**: pyopenjtalk scores 1.05 [0.92, 1.21] here, against his OpenJTalk 1.03,
  once を is merged; with his script as is it is 2.88, because OpenJTalk (like our kana prompt) writes を as `ヲ`.
- **Kana from the frozen prompt**: 0.25-0.27 on all 3,000 with Claude and Codex, below his best LLM (0.52); newer
  models, so this says the frozen kana prompt is not weak, not that it beats his. Unmerged, 2.1 (the prompt's `ヲ`).
- **YomiScript**: 0.63 (Claude) and 0.87 (Codex) on all 3,000, between his best LLMs (0.52-0.74) and OpenJTalk
  (1.03), and 1.7 / 1.2 times below pyopenjtalk on the same sentences. It is 0.36-0.62 points above the same LLM's
  kana: writing IPA costs accuracy, as on the hard set.
- **The subset was representative within its intervals** for kana and pyopenjtalk; for YomiScript, Claude's 0.48 on
  the subset became 0.63 on all sentences (inside the subset interval).

Where the YomiScript errors are (3,000 sentences, characters of merged kana error, `results/summary.md`):

| system | errors | not parsed | mora with no kana | 先生 as セエセエ | いう as イウ | other |
|---|---|---|---|---|---|---|
| YomiScript, Claude | 550 | 120 | 22 | 13 | 98 | 297 |
| YomiScript, Codex | 763 | 282 | 25 | 13 | 78 | 365 |
| kana, Claude | 235 | 0 | 0 | 0 | 17 | 218 |
| kana, Codex | 217 | 0 | 0 | 11 | 0 | 206 |

- **Not parsed** (25 Claude and 76 Codex answers of 3,000): a Latin `r` for `ɾ`, `ɪ` for `i`, or a geminate split
  by a word space (`saɲdʑɯs seɴto` for 三十セント), which the Katarite rejects; the rejected words count as deleted.
  Over the well-formed answers only, YomiScript is 0.50 (Claude) and 0.57 (Codex).
- **いう**: the gold writes 言う / という as ユウ (as pronounced); the YomiScript prompt has no rule for it and the LLMs
  write `iɯ`, while the kana prompt's example (言う `ユー`) teaches it. Arguably not a misreading.
- **先生**: the YomiScript prompt's own example spells 先生 `seːseː` (and the kana prompt `セーセー`), where the gold and
  standard pronunciation have センセー; the LLMs follow the example. A slip in the frozen prompt, kept frozen here.
- **Moras with no kana**: the LLM's IPA for rare loanword moras (ブェ, グァ, ムィ) that the kana2ipa table has no
  spelling for.
- **Other**: IPA slips (`pampɯɾetto` for パンフレット, `sɯ` for `ɕɯ`, `dzo` for `dʑo`) and readings that differ from
  the gold as in the kana answers (日本 ニホン / ニッポン, 今日 コンニチ / キョウ, 私 ワタシ / ワタクシ, numbers such as
  I-20 read アイトゥエンティ or 501 号室 ゴヒャクイチ).

Run time: the subset took 8.5 min (3 LLMs in parallel, 2 calls at a time each); the rest of the 3,000 took 53 min for
Claude and 31 min for Codex (3 calls at a time). Mean seconds per 50-sentence call: YomiScript 133 (Claude), 79
(Codex), 57 (Antigravity); kana 40, 26, 25.

**Failures**:
- Antigravity hit its account quota ("Individual quota reached ... Resets in 165h") after 1,700 sentences of kana and
  1,250 (contiguous) of YomiScript, so it has no all-3,000 numbers; the 1,250-sentence column compares all three
  LLMs. `node run.mjs agy --n 3000` completes it after the reset (records without an answer are not saved).
- One Antigravity kana answer (batch 26, outside the 1,250) was not JSON in both tries: a JavaScript
  `.replace("rawa", "ラワ")` call inside the object, the failure eval/representation saw too; its 50 sentences count
  as missing.
- One other Antigravity kana answer (batch 13) needed the second try. No other call failed, and every answer that
  came back had all 50 sentences.

## Limits

- One run per LLM and format; run-to-run spread is not measured (eval/representation's three runs varied by about
  1-3 points of sentence accuracy on the hard set).
- The models are newer than Koriyama's, and the setup differs (50 sentences per call with our few-shot examples,
  his own direct and parse prompts), so the comparison with his table is of levels, not a head-to-head.
- The gold has one reading per sentence; acceptable alternatives (日本 ニッポン, 今日 キョウ, いう イウ) count as errors,
  for every system alike.
- YomiScript is scored through an IPA -> kana mapping; IPA slips that a listener might not hear (`z` for `dz`) are
  forgiven in the kana CER and counted in the phoneme CER, while slips that change the mora (`p` for `ɸ`) count in
  both. The phoneme CER leaves out the 8 sentences whose gold kana2ipa cannot convert.
- Antigravity covers 1,250 sentences in both formats, not 3,000.
