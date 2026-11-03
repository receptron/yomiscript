# Japanese prosody from Qwen3-TTS: supervised data and a refit of the pitch model (2026-11-02)

In blind tests (`eval/qwen3_tts`) Qwen3-TTS 1.7B Base, with the voice cloned from Kokoro's, was heard as more
natural than Kokoro as the tools ship it (10 of 12), and Kokoro given Qwen's pitch as YomiScript values was heard
as more natural than Kokoro with the D29 pitch model (9 of 11). This directory turns that into data: Qwen reads
every JSUT BASIC5000 sentence whose reading we have, its prosody is measured on the YomiScript's units, and the
pitch model of `packages/core/src/ja_contour.ts` (D28, D29) is fitted to it.

## The data: `data/jsut_qwen_clone.jsonl`

One JSON object per sentence:

| field | |
|---|---|
| `name` | the JSUT id (BASIC5000_0001 …) |
| `text` | the sentence |
| `given` | what Qwen was given: `text` (the sentence as it is) or `kana` (every word that has a kanji in kana; for the sentences it misread from the text) |
| `ys` | the YomiScript (Codex's, in the prompt of eval/representation; eval/jsut_accent), read as JSUT's hand-checked gold reads it |
| `units` | the units of the YomiScript, as the Kokoro Katarite plans them (morae; ɴ, the geminate and ː are units of their own) |
| `f0` | per unit: Qwen's pitch at the start, middle and end of its voiced frames, in semitones, the sentence's median 0; `null` where it has no voiced frame (devoiced, a geminate) or the tracker failed |
| `spans` | per unit: [start, end] in seconds in Qwen's audio (to the next unit's start; before a pause and at the end, to where the sound stops) |
| `pauses` | `{unit index: seconds}`: the pause after that unit, where the YomiScript has ‖ |
| `gaps` | `{unit index: seconds}`: a silence after that unit where the YomiScript has no pause (Qwen paused after a word) |
| `align` | the forced alignment's mean probability (a confidence) |
| `heard` | what Whisper heard, as katakana, that matched the gold reading |

How it is made:

- **Sentences** (`items.mjs`): the 3,762 of the 4,530 JSUT BASIC5000 sentences whose Codex YomiScript reads as the
  gold does (the same kana, the same number of morae).
- **Speech** (`generate.py`): Qwen3-TTS-12Hz-1.7B-Base (MLX bf16, mlx-community), the voice cloned from a Kokoro
  jf_alpha clip (`eval/qwen3_tts`), the checkpoint's sampling defaults, one take per sentence, batches of 16.
- **Reading check** (`extract.py`, as `eval/prosody_ref/refcheck.py`): Whisper large-v3-turbo twice (plain, and
  with a kana prompt), as katakana by pronunciation, against JSUT's kana; a sentence is kept only when one matches
  (エイ = エエ and イウ = ユウ, two spellings of one sound, count as the same). Qwen reads the text itself, so a
  misreading (何の なにの, 日本 にっぽん, 木曽川 きくもがわ) would put wrong morae under the pitch; those sentences
  are read again from kana (`kana_items.mjs`) and kept if that is right.
- **Measurement** (`../qwen3_tts/measure.py`): MMS_FA forced alignment of the units, Praat pitch.

The audio is not kept (`work/` is ignored); `generate.py` remakes it (sampling, so not sample for sample).

## License

The sentences are JSUT's (from jsut-label: Wikipedia CC BY-SA 3.0, Tanaka Corpus CC BY 2.0, JSUT CC BY-SA 4.0),
so the data file is under **CC BY-SA 4.0**, like `eval/data/jsut_basic5000_subset.jsonl` (`eval/LICENSE_DATA.md`).
The speech it was measured from is Qwen3-TTS's (Apache-2.0, an open-weight model, not a commercial service), in a
voice cloned from Kokoro (Apache-2.0).

## Run

```bash
cd eval/qwen_prosody
node items.mjs                                        # -> work/items.json (needs eval/jsut_accent's data and answers)
../qwen3_tts/.venv/bin/python generate.py             # -> work/audio/ (resumable; about 1.5x real time on an M2 Max)
../prosody_ref/.venv/bin/python extract.py            # -> data/jsut_qwen_clone.jsonl, work/rejected.json
node kana_items.mjs                                   # the misread ones in kana -> work/items_kana.json
../qwen3_tts/.venv/bin/python generate.py --items work/items_kana.json --out work/audio_kana
../prosody_ref/.venv/bin/python extract.py            # again: both passes
node rows.mjs                                         # -> work/rows.json (the D31 marks, the model's features)
../prosody_ref/.venv/bin/python fit.py                # -> work/fit.json, work/fit_report.json
```

## Dataset (Hugging Face)

The speech itself, with the data above, as a Hugging Face dataset (audiofolder: FLAC, `metadata.jsonl`, the card
`dataset_card.md`): every clip of both passes, the ones misread marked `read_right: false` and given no prosody.

```bash
../prosody_ref/.venv/bin/python dataset.py            # -> work/hf/ (after extract.py)
hf upload receptron/yomiscript-ja-qwen-speech work/hf . --repo-type dataset   # the maintainer's step
```

## Results

### The data (2026-11-02)

- Speech: all 3,762 sentences, 18,193 s (5.05 h) of audio, made in 9,570 s on an M2 Max (1.9x real time, batches of
  16).
- Read right from the plain text: 2,503 (66.5%); misread: 1,259. Most are real misreadings by Qwen, the kind the
  check is there for (何の なにの, 日本 にっぽん, 木曽川 きくもがわ, 目眩 めむぶ); the kana pass reads 1,251 of them
  again (8 cannot be written in kana: a palatalised ç or ɲ before a back vowel, which the kana table does not have).
- The kana pass: 1,251 sentences, 7,166 s of audio in 2,726 s; 708 read right.
- **Kept: 3,211 sentences** (2,503 from the text, 708 from kana; 85.4% of 3,762), 97,528 units; 551 misread in
  every pass. The Hugging Face package (`dataset.py`): 5,013 clips, 7.08 h, 626 MB of FLAC.
- **The kana pass reads right but speaks a worse accent.** Read from Qwen's pitch (below), the accent nucleus of
  JSUT's gold phrases is Qwen's in 70.5% of the phrases it read from the text (15,265) and in 45.8% of those it read
  from kana (5,062): without the kanji Qwen does not know the words. So `rows.mjs` and `accent_qwen.py` learn from
  the 2,503 sentences read from the text only; the kana ones stay in the data (`given: "kana"`) for their timing
  and for other uses, not as pitch targets.

### The pitch model fitted to Qwen (2,503 sentences; `results/fit_report_2503.json`)

D29's model (45 features of the D31 marks, the two morae on each side), refitted by ridge regression (λ 3, by 5-fold
cross-validation) on the even ids, tested on the odd ids (1,250 sentences), against Qwen's three values per mora,
each sentence centred:

| | rmse to Qwen (semitones) |
|---|---|
| no pitch (flat) | 3.02 |
| D29 (shipped) | 2.10 |
| refit | 1.91 |

By ear (`listen.mjs`; the project owner, 2026-11-02, `results/listening_refit.json`): D29 against the refit on the
12 sentences of eval/qwen3_tts and 12 of the test half: **no difference in 20 of 24**, the refit 3, D29 1. The refit
is closer to Qwen by the numbers but not audibly; it does not carry over what made Qwen's own pitch (eval/qwen3_tts,
`kokoro_f0`: 9 of 11 against D29) better. Not shipped.

Listened again with "no difference" split into both natural and both unnatural (`results/listening_refit2.json`):
both natural 12, **both unnatural 7** (bakery, meeting, library, phone; BASIC5000_0357, 0965, 4509), the refit 3,
D29 2. The four of eval/qwen3_tts among the seven are ones where Qwen's own pitch won (`kokoro_f0`). On them, D29's
and the refit's contours are close to each other and both far from Qwen's in the same places (where they differ, not
why the listener heard them as unnatural):

- the accent nucleus: 読み終わって (D31 marks よꜜみ; Qwen low よ, rising to おわ), パン屋が (Qwen high from ん);
- a level reset after a pause: meeting, where Qwen pauses 0.41 s after 会議は (no ‖ in the YomiScript) and starts
  午後三時 high (+3.7 semitones; D29 -0.5); library's いません;
- sentence ends: Qwen stays low through できました, 始まります; D29 follows the marks up.

With all 3,211 sentences (`results/fit_report_3211.json`; λ 1; 1,569 test sentences): flat 3.02, D29 2.23, refit
2.01 semitones; from the text only, as now fitted (`results/fit_report_text.json`): 3.02, 2.10, 1.91.

All three are set by the model's input, the D31 marks (where a phrase falls, where phrases and pauses are), which
the refit does not change. Fitting more freely on the same input does not reach Qwen either: on the test half, a
gradient-boosted model of the same features gets to 1.79 semitones (train 1.60), the linear 1.92 (train 1.91).

### Word accents learned from Qwen (`accent_qwen.py`, `corrections.mjs`; `data/qwen_word_accents.json`)

Qwen's accent nucleus in each of JSUT's gold accent phrases, read from its pitch by eval/prosody_ref/accent.py's
classifier (learnt on the JSUT speaker's recordings), in place of the gold, through eval/jsut_accent/corrections.mjs's
learner (a word seen at least twice, the same type in 80%, not NAIST-JDIC's; the training half). Scored against the
gold by eval/jsut_accent/score.mjs (its `qwen` row, `results/summary.md` there).

- The reading of accent from pitch is itself uncertain: on 194 sentences the classifier was not trained on, it
  hears the gold's nucleus in 83.4% of the phrases in the JSUT speaker's own recordings and in 70.9% in Qwen's.
- On the gold phrases, D31's marks have the gold's nucleus in 71.5%, Qwen 71.2% (2,503 sentences read from the
  text: 70.5%); the two agree in only 58.6%, and one of them is right in 88.5%.
- The word accents: 68 corrections (2,503 sentences). Against the gold on the test half they make D31 worse: gold
  phrases right 61.5% -> 61.2%, H / L 86.9% -> 86.8%; better on 61 phrases, worse on 132 (the gold-learned
  corrections of jsut_accent: better 249, worse 25). **Not used.**

A word accent read through the classifier is not what made Qwen's pitch better by ear; and it is scored here against
one speaker's labels, not by ear. The listening tests above point at the marks (nucleus, phrasing, pauses) as what
the model lacks; reading them from Qwen with the pitch model itself (analysis by synthesis) is the next thing to try.

### The accent read from Qwen by analysis by synthesis (`abs.mjs`, `abs_listen.mjs`)

For each accent phrase of the tools' YomiScript (D31's phrasing), the nucleus (0 flat, 1, …, n-1) whose pitch, as
the model fitted to Qwen renders it, brings the sentence closest to Qwen's; each phrase in turn, the others held, two
passes; phrases of one mora keep D31's marks. On the 2,503 sentences read from the text, 6,803 of 17,612 phrases
(39%) take another nucleus than D31's, and the rmse to Qwen goes from 1.86 to 1.52 semitones (on the sentences the
marks were read from, so a lower bound, not a test).

On the 12 sentences of eval/qwen3_tts (`results/abs_marks_12.json`), among the changes: 読み終わって flat (D31 1),
始まります flat (5), パン屋が 1 (0). Blind, three ways (`results/listening_abs.json`, the project owner):

| | more natural |
|---|---|
| `qwen_pitch` (Qwen's own pitch) | 3 (meeting, sunset, phone) |
| `abs` (the marks read from Qwen, the fitted model's values) | 2 (bakery, library) |
| `d29` (shipped) | 2 (window, cat) |
| no difference, both natural | 5 |

The two `abs` won are two of the seven heard as both unnatural with D29 and the refit, and the places its marks
change are where their contours were furthest from Qwen's (パン屋, 読み終わって). Of the three Qwen's own pitch
won, meeting is where Qwen pauses after 会議は and resets its level, and phone a question's end: neither is a
nucleus, which is all `abs` reads. Few sentences, one listener: a direction, not a result.

Listened again with the page that takes an "unnatural" tick per system (`results/listening_abs2.json`):

| | heard as unnatural |
|---|---|
| `d29` | 4 (bakery, library, sunset, phone) |
| `abs` | 2 (window, cat) |
| `qwen_pitch` | 1 (cat) |

None of the four heard unnatural with D29 is with `abs`; but `abs` makes two others unnatural, window (風が 0 -> 1,
きた 1 -> 0) and cat (日なたで 0 -> 1, 気持ちよさそうに 5 -> 7; Qwen's own pitch was unnatural there too). The
marks read from one sentence carry what was heard, and errors of their own; a word's accent read the same way in
many sentences (a dictionary) should keep the first and lose the second.

### Word accents from the marks read from Qwen (`abs_dict.mjs`; `data/abs_word_accents.json`, `results/abs_dict.json`)

The marks abs.mjs read on the training half, in place of a gold, through jsut_accent's correction learner: 63
entries (36 of words that do not conjugate). On the test half, rendered by the fitted model, against Qwen's own
pitch: with them the marks of 250 sentences change, 38 closer to Qwen and 137 farther (more than 0.05 semitones;
nouns only: 103, 6 closer, 82 farther). Keeping only words seen often does not help (seen at least 8 times: する 1,
あり 0, 思い 0; 126 sentences changed, 19 closer, 46 farther). **Not used.**

So the nucleus read in one sentence is not a word's accent. The entries are mostly 1 (atamadaka, 28 of 63) and of
words that often start a D31 phrase (する in 確認 | して): a guess not checked yet is that Qwen joins such a word to
the phrase before, and a fall read inside D31's phrasing is then credited to the word. Reading the phrasing from Qwen
as well (which phrases join), and learning phrase rules from it (as jsut_accent's rules.mjs does from the gold: the
phrasing is also D31's largest error against the gold there), is the next step.

