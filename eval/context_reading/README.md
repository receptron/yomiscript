# How much context does the Yomite need?

`eval/author_reading` found that an LLM reads a Japanese homograph about as well as the author when it is given the
conversation, and worse when it is given the answer alone. That rests on 25 words, of which 7 differ between
conditions (per-word sign test p = 0.13); the authors often restated the clue in their answers; and every text there
was written by an LLM. This experiment asks the question again with more words, a fixed ambiguous sentence, and text
that does not come from the LLM.

## Design (written before the run)

`items.tsv`: 65 homographs with two readings each, 130 items: 21 of the 25 words of `author_reading` (目下, 気質, 一見 and
変化 did not give a sentence that is ambiguous on its own, or stayed ambiguous with context) and 44 more. One word gives two items that
share the **same short target sentence**, ambiguous on its own (「それは生花です。」, 「十分です。」, 「何人ですか。」), and
differ only in the context that fixes the reading:

- a **preceding paragraph** of 2-4 sentences, as on a web page, in the news or in a document (external text);
- a **user's message** in a chat, to which the target sentence is the assistant's answer.

Neither contains the homograph or its reading in kana. 一日 is left out (the YomiScript instructions use it as an
example). The right readings were set by the project and were **reviewed on 2026-11-01 by one native speaker of the project** (all accepted); items where both
readings stayed plausible with the context were dropped while drafting (大分, 背筋, 空いて, 汚れて, 礼拝, 火口, …).
Because the two items of a word have the same sentence, a reader without context can be right on at most one of them
per call: about 50% is the expected accuracy without context, by construction.

Three LLMs through their CLIs with no tools (`eval/llm_yomite/llm.mjs`): Claude Code, Codex and Antigravity (Gemini),
all given `YOMISCRIPT_INSTRUCTIONS` of `@yomiscript/core`. Conditions:

| condition | what the LLM sees | writes YomiScript for |
|---|---|---|
| `ext.alone` | the target sentence | the sentence |
| `ext.context` | the preceding paragraph and the target sentence | the sentence only |
| `chat.alone` | the assistant's answer (the target sentence) | the answer |
| `chat.context` | the user's message and the same answer | the answer |
| `author` | the user's message, asked for the word (「X」という言葉を使って、一言で答えて。) and an answer of at most 15 characters that repeats no word of the message | its own answer, in the same call |
| `authread.<reader>.<alone\|context>` | an author's answer, without or with the user's message | that answer |
| pyopenjtalk | the target sentence | (dictionary front end) |

The chat conditions fix the answer, so it cannot restate the clue; the author condition lets the LLM write the
answer, and the restating is counted: an answer restates when it shares a content word (a noun, verb, adjective or
adverb with a kanji or katakana in it, from pyopenjtalk's analysis) with the user's message, other than the
homograph. Author and readers are compared on all answers and on the answers that do not restate.

Ten items go in one call, no two of the same word in a call, and the batches are the same in every condition
(`results/r<run>/batches.json`); the items are numbered in the prompt, not named, so an id does not give the reading
away. 13 batches: 195 calls for the first five conditions, 234 for the readers of the authors' answers.

The reading of the word is taken from the YomiScript through the `<t:…>` layer and compared with the right reading
and the misreadings in the coarse spelling of `eval/author_reading/score.py` (its code is imported). When both a
reading and a longer one contain the match (ダイテ in イダイテ, ゾーサ in ゾーサク, アケ in ヒラケ) the longest match decides.
Neither a listed reading nor a misreading counts as not right and is listed in `results/r<run>/other.md`.

### Primary comparison, stated in advance

**`ext.context` minus `ext.alone`, pooled over the three LLMs**: per item, the share of the three LLMs that read it
right with the paragraph minus the share without, averaged over the 130 items. Reported with a 95% interval from
resampling whole words (cluster bootstrap, 10,000 resamples) and an exact sign test with one vote per word (the sign
of the word's summed difference). The hypothesis: the difference is positive, and the context brings the accuracy to
near the author's level in `author_reading` (95% or more).

Secondary, without a correction for multiple comparisons and to be read as such: the same for `chat.context` minus
`chat.alone`; exact McNemar on the item × LLM pairs (390) and per LLM; the author against the readers of its answers,
on all answers and on the answers that do not restate; each condition's accuracy with an interval resampling words.

## Results (`results/r1/summary.md`, per item `results/r1/items.md`)

One run, 2026-11-01: 429 calls in 832 s wall time (10 items per call, 3 calls at a time per LLM), Claude Code
`claude-opus-5-5`, Codex `gpt-6.1-sol`, Antigravity `gemini-4-argon-medium`. 35 calls failed, all Gemini reading the
authors' answers in batches 7-12: its quota ran out (HTTP 429, "resets in 165 h"), so they could not be repeated.
Every call of the first five conditions returned all its items.

Homograph read right, 130 items, 65 words, [95% interval resampling words]:

| condition | 3 LLMs pooled | Claude | Codex | Gemini |
|---|---|---|---|---|
| external text, sentence alone | 48.5% [45.6, 51.0] | 48.5% | 50.8% | 46.2% |
| external text, with the preceding paragraph | 97.7% [95.4, 99.5] | 97.7% | 97.7% | 97.7% |
| chat, fixed answer alone | 48.5% [46.4, 50.5] | 48.5% | 50.8% | 46.2% |
| chat, fixed answer with the user's message | 98.2% [96.4, 99.7] | 99.2% | 98.5% | 96.9% |
| pyopenjtalk, sentence | 49.2% [47.7, 50.0] | | | |

**Primary result.** With the paragraph minus without, external text, pooled: **+49.2 points [+46.2, +52.3]**
resampling words; 64 words better with the paragraph, 0 worse (sign test p = 1e-19); on the 390 item × LLM pairs 193
to 1 (McNemar p = 2e-56). Each LLM alone: +47 to +52 points. Without context the LLMs read about one of the two
items of each word right, which is the most a reader can do on the same sentence; the paragraph brings all three to
97.7%. The hypothesis stated in advance holds.

The chat, with the answer fixed so that it cannot restate the clue, gives the same: +49.7 points [+46.9, +52.3], 65
words to 0. A preceding paragraph and a user's message fix the reading equally well (difference -0.5 points
[-2.3, +1.3], 2 words to 4, p = 0.69).

**Authors.** All 390 answers contain the word and are at most 15 characters; 5 restate a content word of the user's
message (the count is lexical, see the limits). Because of the failed Gemini calls, the comparison uses the 210
answers (all 65 words) that every reader read, with and without the message:

| condition | right [95% interval resampling words] |
|---|---|
| author (its own answer, same call) | 99.0% [97.6, 100] |
| same LLM, the answer alone | 75.2% [67.6, 82.4] |
| same LLM, with the user's message | 99.0% [97.6, 100] |
| other LLMs, the answer alone | 74.8% [67.4, 81.7] |
| other LLMs, with the user's message | 98.6% [97.4, 99.5] |
| pyopenjtalk, the answer | 57.1% [46.4, 67.6] |

The author against the same LLM given the user's message: 0.0 points [-1.9, +1.9], 2 answers to 2; against the
other LLMs given the message, +0.5 [-1.4, +2.2], 6 words to 2 (p = 0.29). The author against a reader of the
answer alone: +23.8 [+16.4, +31.8], 32 words to 1 (p = 8e-9). On the 207 answers that do not restate the numbers
are within half a point of these. The authors' answers alone are read better (75%) than the fixed sentences (49%)
because a short answer still has words of its own (「見事な金星だ！」), not because it restates the message.

So, on these items: what decides the reading is whether the context is there, and authorship adds nothing measurable
once a reader has the context. With 65 words and accuracies near 99%, a difference of a couple of points either way
cannot be excluded; it is not a shown equivalence.

**What the context did not fix** (`results/r1/items.md`): 河岸 as かわぎし (the river bank) was read かし in nearly
every condition, authors included, as in the idiom 河岸を変える, so the item may be one where the idiom wins even with
the context; 外面 がいめん (2/3 and 1/3); 一文 いちぶん, 自重 じじゅう and 分別 ふんべつ in some calls. Some of the not-right
readings are notation errors rather than misreadings (`itɕibɯm`, `naɲin`, `ɸɯmbetɯ`); they count as not right, as in
`author_reading` (`results/r1/other.md`, 25 outside the reader-of-author conditions).

pyopenjtalk reads every target sentence one way, so it is right on one item of each word (49.2%); it reads 角 as カク,
neither listed reading.

## Changes after the run

Three changes to the scoring, made after looking at `other.md`, all toward accepting valid readings: シュクジ is a
right reading of 祝詞 (as in the speech) and クロゴ of 黒子 (the stage hand), both in dictionaries; and ヒュ written
`hj` (`hjɯːɡa`) is spelled like kana2ipa's `çɯ`. Before them the primary result was +48.2 points [+44.9, +51.5],
64 words to 0, and the authors' table 97.6% / 99.0% / 98.1% for the author / same LLM / other LLMs with the
message.

## Limits

- The items, and their right readings, were written by the project; the readings were reviewed by one native speaker of the project, not by independent annotators.
  The target sentences were chosen to be ambiguous, so the 50% without context is by design, not an estimate of how
  often real text is ambiguous: the experiment measures whether the context is used, not how often it is needed.
- One run. Ten items per call: the items of a batch are unrelated and none share a word, but a reader saw them side
  by side.
- The Gemini quota cut the authors' comparison to 210 of 390 answers (batches 0-6, chosen by the failure, not by the
  results); the first five conditions are complete.
- Restating is counted lexically (a shared content word); a paraphrase of the clue is not caught.
- 65 words in one language, three LLMs from one date.

## Run

```bash
node run.mjs 1                                  # results/r1/... (claude, codex, agy CLIs); a stopped run continues
../prosody_ref/.venv/bin/python score.py 1      # results/r1/summary.md, items.md, other.md
```
