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

### Open comparison: Qwen, the tools now, and the accent read from Qwen (`compare.mjs`; `results/listening_compare.json`)

Not blind (`blind.html?…&open`: the systems named, the accent marks shown, an "unnatural" tick and a note per clip),
the 24 sentences of the listening tests, the project owner:

| | heard as unnatural (of 24) |
|---|---|
| `now` (D31 marks, D29 values) | 13 |
| `abs` (the marks read from Qwen's pitch of that sentence, the fitted model's values) | 3 |
| `qwen` (Qwen itself) | 2 |

Of the 13 unnatural with `now`, 11 are not with `abs`. The three with `abs` are ones where Qwen or `now` was
unnatural too, and the notes say where: Qwen speaks 日なた (cat) and ひざ (BASIC5000_2917) with a fall after the first
mora (ひꜜなた, ひꜜざ; both are flat), and `abs` copies it. Where `now` was noted, お酒 (BASIC5000_4509), D31 has
おꜜさけ and `abs` reads it flat from Qwen. Being open, this is a pointer to what is wrong, not a blind result.

So the marks read from Qwen's own speech of a sentence carry nearly all of what makes Qwen better, and Qwen's own
accent errors with it; what failed (`abs_dict.mjs`) is turning them into word accents for other sentences.


### Can the accent read from Qwen be predicted from the sentence? (`nucleus_rows.mjs`, `nucleus.py`, `nucleus_eval.mjs`; `results/nucleus.json`, `results/nucleus_eval.json`)

A small neural model (a two-layer bidirectional LSTM over the morae: the mora, its word and the word's first and last
characters, its place in the word and the phrase, the boundary before it, D31's nucleus) is trained on the training
half's abs.mjs nuclei (1,288 sentences, a tenth held out to stop on) to choose the nucleus of each D31 phrase of two or
more morae. On the test half (1,215 sentences, 8,532 phrases):

| | the same nucleus as abs | whole sentence as abs | mean distance to Qwen's pitch (semitones) |
|---|---|---|---|
| D31 | 61.5% | 4.9% | 1.856 |
| the model | 64.1% | 6.0% | 1.841 |
| the phrase's majority nucleus in the training half (the same words, seen twice or more; else D31) | 62.9% | | 1.847 |
| abs (read from Qwen's pitch of that sentence) | 100% | 100% | 1.518 |

The model closes 4.5% of the distance from D31 to abs (255 sentences closer to Qwen than D31, 173 farther); on its
own training sentences it agrees with abs in 66.5%. **abs is not reproduced, so its result was not listened to.**

The labels are why: the same phrase does not get the same nucleus. Of the phrases whose words occur three times or
more, the majority nucleus covers 76%; する alone is flat 109 times and falls after its first mora 66 times, いる 49
and 50. These are mostly words D31 puts at the start of a phrase that Qwen seems to join to the one before (not
checked), so with D31's phrasing kept fixed the nucleus abs reads there fits that sentence's pitch, not a property of
the phrase. What abs gains is mostly specific to the sentence as Qwen spoke it.

### The same in the LLM's accent phrases (`phrase_corpus.mjs`, `abs.mjs --phrased`; `results/nucleus_phrased.json`, `results/nucleus_eval_phrased.json`)

Claude put ` | ` into the corpus's YomiScripts, changing nothing else (2,501 of 2,503 kept; the line of
eval/llm_phrasing), and abs.mjs read the nuclei again in those phrases (D32: the dictionary's accent in the LLM's
phrases as the start). 6,309 of 16,074 phrases take another nucleus than the start; distance to Qwen 1.861 -> 1.505.
The phrases repeat a little more consistently (majority nucleus 79.6% of the phrases whose words occur three times or
more, against 76.4%; する, して and いる are joined to the phrase before now), but not enough: ある。 is flat 53 times and
falls after its first mora 67 times. The same model, on the test half (1,214 sentences, 7,816 phrases):

| | the same nucleus as abs | mean distance to Qwen's pitch |
|---|---|---|
| D31 as shipped | | 1.857 |
| D32, the start | 61.1% | 1.863 |
| the model | 62.8% (on its training sentences 76.2%) | 1.874 |
| abs in the LLM's phrases | 100% | 1.507 |

The model learns its training sentences and not the test half, and comes no closer to Qwen than the start. **In the
LLM's phrases too, the nuclei abs reads are not predictable from the sentence**: what abs gains is specific to the
sentence as Qwen spoke it, at least with this much data.

The model's test agreement against the size of its training half (the same model, sentences drawn at random; the
start is 61.1%): 321 sentences 60.7%, 643 60.5%, all 1,287 62.8%. Only with all of them does it beat the start, so
more data was tried next.

### More sentences, from Wikipedia (`wiki_sentences.mjs`, `wiki_items.mjs`, `extract.py --wiki`, `abs.mjs --wiki`; `results/nucleus_phrased+_wiki.json`, `results/nucleus_eval_phrased+_wiki.json`)

5,000 sentences of Japanese Wikipedia (wikimedia/wikipedia 20231101.ja, CC BY-SA 4.0; at most two plain sentences
from each of 2,912 articles, 12 to 50 characters of kanji and kana only), written as YomiScript by Claude in the
tools' instructions with the line asking for accent phrases (D32): 4,880 kept (99 did not parse, 21 changed the
text). Qwen read them as the JSUT ones (`generate.py --items work/wiki/items.json --out work/wiki/audio`, 2.2 s a
sentence). There is no hand-checked reading, so Whisper's transcript is checked against the YomiScript's own
reading: 2,393 kept (49%; JSUT's 66.5% was of YomiScripts already checked against the gold, here a YomiScript that
reads the sentence wrong drops it too). abs.mjs read the nuclei: 6,031 of 13,463 phrases take another nucleus than
the start, distance 1.918 -> 1.581, as on JSUT. All of them are added to the training half; the test half is the
same JSUT one (1,214 sentences, 7,816 phrases):

| | the same nucleus as abs | mean distance to Qwen's pitch |
|---|---|---|
| D32, the start | 61.1% | 1.863 |
| the model, JSUT only (1,287 sentences) | 62.8% (training 76.2%) | 1.874 |
| **the model, JSUT and Wikipedia (3,680)** | **64.6%** (training 67.9%) | **1.836** |
| abs in the LLM's phrases | 100% | 1.507 |

With the Wikipedia sentences the model comes closer to Qwen than the start for the first time (397 sentences closer,
274 farther; 7.5% of the gap from the start to abs closed), and it no longer just learns its training sentences. The
gain is about one point of agreement for each doubling of the data (60.5, 62.8, 64.6 at 643, 1,287, 3,680), slow
against the 39 points to abs.

Found on the way: a pause written with no text (`‖<t:>`, the LLM's pause where the sentence has no comma) made
`accentMarks` start the phrase after it at the pause, which put a ` | ` after the final `↘` and broke the YomiScript
(packages/ja-accent `cover`, fixed). The JSUT scores do not change (Codex's answers have no such pause); in
eval/llm_phrasing the dictionary's accent on the base answers goes up by 0.1 point.

### Three fixes to the measurement (found by Codex in an experiment worktree)

- `fit.py` wrote `work/fit.json` refitted on the training and the test half together, so every distance above was
  measured with a pitch model that had seen the test sentences. It now writes the model fitted on the training half
  (its features also taken from the training half only; they are the same 45). Its test rmse, which was always of
  the training-half model, does not change (1.91).
- abs.mjs did not try a fall after a phrase's last mora (it is not heard inside the phrase, but the next phrase
  starts lower: `jaContour` counts it for downstep), and stopped after two passes. It now tries it (nucleus n), goes
  on until no phrase changes (at most 5 passes were needed), and keeps the held nucleus on a tie. The start keeps
  D31's own final falls.
- nucleus.py ran the LSTM over padded batches, so the backward direction of a short sentence started in the padding.
  The batches are now packed; the model has a second output per mora for flat, so that flat and a final fall are
  two choices.

Everything was run again (fit.py; abs.mjs, --phrased, --wiki; nucleus_rows.mjs, nucleus.py, nucleus_eval.mjs). The
test half (the odd JSUT ids):

| | before | after |
|---|---|---|
| D31's phrases: start / abs (1,215 sentences) | 1.856 / 1.518 | 1.866 / 1.502 |
| the LLM's phrases: start / abs (1,214) | 1.863 / 1.507 | 1.871 / 1.494 |
| the model in D31's phrases: agreement / distance / gap closed | 64.1% / 1.841 / 4.5% | 58.3% / 1.848 / 5.0% |
| the model, JSUT (LLM's phrases) | 62.8% / 1.874 / -3.1% | 56.9% / 1.874 / -0.8% |
| the model, JSUT and Wikipedia | 64.6% / 1.836 / 7.5% | 58.7% / 1.846 / 6.8% |

The agreement is lower because a phrase now has one more choice and abs's labels changed (the start agrees with them
in 54.7% of the phrases, was 61.1%); the distances, which do not depend on the labels, barely move, and what was
said above holds: the model from the text features closes a few percent of the gap. The listening tests above were
made with the old pitch model and stay as they were heard.

### With Qwen's own representation of the words (`qwen_hidden.py`, `nucleus.py --qwen <layer>`; `results/nucleus_phrased+_wiki+qwen<layer>.json`, `results/nucleus_eval_phrased+_wiki+qwen<layer>.json`)

Qwen3-TTS has no G2P and no accent module: its talker (28 layers, width 2,048) reads the sentence as BPE text tokens
and writes codec codes, so whatever decides its accent is in the talker's hidden states. `qwen_hidden.py` builds the
clone's input exactly as generation does (mlx-audio's ICL prompt), runs the talker over it once, and keeps the output
of layers 7, 14, 21 and 28 at the sentence's text tokens, as the mean over the tokens of each YomiScript word
(4,894 sentences, 978 MB in `work/qwen_hidden/`, not kept). The talker is causal, so a word has seen the sentence up
to itself and nothing it has said. The tagger takes the word's vector (layer norm, dropout 0.3, a projection to 128)
next to its other inputs; everything else is as above (JSUT and Wikipedia, the same test half):

| | dev agreement | test: the same nucleus as abs | distance to Qwen | gap closed | sentences closer / farther than the start |
|---|---|---|---|---|---|
| D32, the start | | 54.7% | 1.871 | 0 | |
| the model, no Qwen | 57.2% | 58.7% | 1.846 | 6.8% | 435 / 318 |
| + layer 7 | 59.6% | 61.2% | 1.776 | 25.3% | 613 / 298 |
| **+ layer 14** | **60.2%** | **62.4%** | **1.767** | **27.7%** | 621 / 285 |
| + layer 21 | 59.8% | 61.7% | 1.777 | 25.1% | 583 / 269 |
| + layer 28 (the last) | 57.2% | 58.9% | 1.832 | 10.4% | 437 / 261 |
| + all four | 59.5% | 59.8% | 1.787 | 22.3% | 573 / 342 |
| abs in the LLM's phrases | | 100% | 1.494 | 100% | |

(Measured after the fixes above.) Qwen's middle layers carry what the text-side features lack: about three to four
points of agreement, and four times the gap closed, more than the tenfold data would give at one point a doubling.
Layer 14 is the best on the dev half and on the test half; layers 7 and 21 are close to it. The last layer, which is
already turned to the next codec code, helps little, and all four together overfit (training 66.5%, test 59.8%). This is an upper look,
not a tool: Qwen is not shipped, so the shipped tools would need a student that predicts such vectors (or the
nucleus) from the text alone.

### Predicting the values instead of the nucleus (`pitch_rows.mjs`, `pitch.py`, `pitch_eval.mjs`, `pitch_listen.mjs`; `results/pitch.json`, `results/pitch_eval.json`, `results/listening_direct.json`, `results/listening_direct_ts.json`; D33)

The nucleus is a detour: what is compared with Qwen is the values. The same LSTM over the same inputs (no Qwen
vectors), with three outputs per mora added to the values the dictionary's nuclei give (`work/fit.json`, frozen), and
trained on the distance itself: 40 epochs, the epoch chosen on 368 held-out training sentences (25). Idea and first run
by Codex; `pitch.py` gives the same result from the rows of the main scripts. On the test half:

| | distance to Qwen | gap closed | sentences closer / farther than the start |
|---|---|---|---|
| the start (the dictionary's nuclei, LLM's phrases) | 1.871 | 0 | |
| the best nucleus model from the text | 1.846 | 6.8% | 435 / 318 |
| + Qwen's layer 14 (not possible in the tools) | 1.767 | 27.7% | 621 / 285 |
| **the values predicted from the text** | **1.592** | **74.0%** | **903 / 202** |
| abs (nuclei read from Qwen's pitch of that sentence) | 1.494 | 100% | |

The spread of the values within a sentence is 2.63 semitones against the start's 2.32 and Qwen's 2.99: the model does
not win by flattening.

By ear (`pitch_listen.mjs`, blind; the project owner, 2026-11-03, on Codex's run of the same model,
`results/listening_direct.json`): unnatural in 12 sentences: the start 6, abs 3, the values 3, Qwen 2; most natural: Qwen
5, the values 1, no difference 1, none chosen 5.

The numbers above are from the tools' own path: `pitch_eval.mjs` runs `pitchYomite` (TypeScript, `packages/ja-accent/src/pitch.ts`) from
the LLM's YomiScript. Its values are within 0.005 of PyTorch's (the two decimals `f0Mark` writes), 30 ms a sentence,
the dictionary included. The model was trained on single sentences; six joined into one section differ from the same
six alone by 0.6 semitones (rms), in the same range. Whether that matters has not been listened to.

**The same 12 sentences through the TypeScript path, blind again** (`results/listening_direct_ts.json`, one listener, a second hearing of the same sentences): unnatural the dictionary's nuclei 5, the nuclei read from Qwen 3, the predicted values 2, Qwen 2; most natural Qwen 6, same 2, none 4.

**Several sentences as one utterance** (`pitch_listen_long.mjs`, `results/pitch_long.json`). The model was trained on single sentences, but YomiScript keeps several sentences in one section. Six passages of four unseen sentences: the values read as one section differ from those of each sentence read alone by 0.21-0.44 semitones rms, and they stay within -7.2 to 6.6. Blind page: `blind.html?test=qwen_prosody&run=long` (the dictionary accent as it ships, the passage read whole, each sentence read alone). Not listened to yet.

## More sentences (`more_train.py`, `codex_pitch.py`, `results/pitch_split.json`, `results/listening_more_data.json`; D35)

5,000 more Wikipedia sentences, by the same steps with another seed and none already used: 4,961 written, 2,595 kept by Whisper's check. Added to 3,312 of the 3,680 sentences of the training half (5,907); the other 368 are fixed dev sentences (`results/pitch_split.json`). Distance on the test half through the TypeScript path, all seeds, no selection on it; `qwen-1` is 1.5918:

| | seeds' dev | seeds' test | test against `qwen-1` (one seed, 95% CI) |
|---|---|---|---|
| 3,312, baseline | 1.572-1.591 | 1.606-1.616 | |
| 3,312, EMA 0.8 | 1.557-1.578 | 1.582-1.587 | |
| 5,907, baseline | 1.511-1.523 | 1.570-1.584 | -0.022 [-0.038, -0.007] |
| 5,907, EMA 0.8 | 1.489-1.495 | 1.541-1.543 | -0.049 [-0.063, -0.035] (s0) |

8.0 MB against 6.7, the same 30 ms a sentence. The frozen candidate is EMA seed 0, the best dev seed of the lowest dev configuration. Distance is not the ear, so it went to a blind test.

Listening (`results/listening_more_data.json`), 12 fresh test-half sentences and 2 repeats, gate written before: 13 same, 1 candidate (BASIC5000_0675), none current; unnatural: current 1 (that sentence), candidate 0; both repeats same both times. The gate passes (more sentences for the candidate than for current, no more unnatural, repeats agree), but on one sentence that differed: the listener hears no harm and almost no difference, which one decisive answer cannot tell from chance. A 0.05 smaller distance is not an audible gain here. Adopted by the listener's decision as `qwen-2` (D35), retrained by `more_train.py` with `codex_pitch.py` and the fixed sentences of `results/pitch_split.json`. The speech of the added sentences is not in the Hugging Face dataset.

## Words that start with an opening quote (`results/listening_quote.json`)

A word written `<t:「ことに>` lost its accent in two ways: the analysis of 「ことに cut it as こと + に instead of the adverb
ことに, and the dictionary's phrase, which starts after the quote, did not start where the word does, so the whole phrase was
left unmarked and had no pitch values. 78 of the 234 sentences of the story on 青空朗読文庫 have such a word. The fix (`packages/ja-accent`)
asks the dictionary about the quote and the word apart, analyses what follows a quote as what starts a sentence, and lets a phrase
start after opening quotes. It changes 76 of those 78 sentences, and none of the 5,868 others compared (the rest of the story and
two JSUT sets).

Blind, published 0.1.4 against the fix, frozen before listening, on sentences of the story not heard before: fixed preferred on 3 of
10 cases, current on none, the same on 7; unnatural 4 (current) and 1 (fixed); the 2 controls, the same recording on both sides,
heard as the same. The two repeats could not be checked: they had one name on the page, which keeps one answer per name.
