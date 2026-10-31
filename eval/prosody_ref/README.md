# Prosody score against commercial TTS (2026-10-31)

A score for Japanese pitch that does not need a listener: our speech is compared, mora by mora, with the same text
read by OpenAI, Gemini and ElevenLabs. It is meant for choosing between versions of the accent step
(`packages/ja-accent`, D25) and the rules (`realize` in `packages/core`), not as a measure of how good the speech is.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
node refs.mjs                 # audio/ref/<service>/<set>.<name>.wav (keys: environment or the repository's .env)
.venv/bin/python refcheck.py  # results/refcheck.json: which references read their text right
node ours.mjs listen <twopass|onepass|dict>       # the blind listening tests' variants, with mora times
node ours.mjs tool <kokoro|accent|accent@<scale>> [reps] [label]   # the LLM's readings through a pipeline
.venv/bin/python score.py <run> [variant …]       # results/<run>.json, e.g. listen-dict, tool
.venv/bin/python paired.py tool <a> <b>           # two variants on the items whose YomiScript differs
.venv/bin/python calibrate.py                     # the score against the blind listening answers
node ours.mjs file <json> <label>                 # a JSON { "<set>.<name>": [ys, mode] } into audio/ours/file/<label>
node mismatch.mjs             # where the LLM's reading and the dictionary's differ, phrase by phrase
```

The texts are the Japanese sets of `eval/browser_tts` (`items.mjs`: the hard set, 70, and the Kokoro parity texts,
24). Our readings are Claude's five `none` runs of the accent trial (`../browser_tts/trials/accent_marks/runs`).
Audio is not kept in the repository (`audio/` is ignored); the API keys stay in `.env`, which git ignores.

## References that misread are not used

Each reference is transcribed by Whisper (large-v3-turbo) twice, as usual and with a prompt in hiragana, so that it
writes what it hears in kana (市 read いち or し looks the same in kanji). A transcript is turned into katakana by
pronunciation and compared with the gold reading (hard set) or the text's OpenJTalk reading (parity texts). A
reference counts only when one transcript matches exactly; Whisper's own errors can only drop a reference.

| service | model, voice | read right |
|---|---|---|
| Gemini | gemini-3.8-flash-tts, Kore | 75 of 94 |
| OpenAI | gpt-4o-mini-tts, coral | 63 of 94 |
| ElevenLabs | eleven_multilingual_v2, Rachel | 39 of 94 |

Most failures are real misreadings of the hard set's homographs (市 し, 上手 じょうず, 人気 にんき, 大家 たいか).

## The score

Our audio carries the time of every mora (Kokoro's durations). Each reference is aligned to it by DTW on MFCCs
(with deltas, cepstral mean removed). Pitch is Praat's autocorrelation F0 in semitones from the utterance median; a
mora's pitch is the median of its voiced frames, and one more than an octave from the median is a tracking error,
left out. The references' mean contour is the target.

- `rmse` (main): root mean square distance in semitones, each sentence centred on its median. Lower is closer.
- `corr`: Pearson correlation of the contours.
- `refs`: the references' rmse against each other, about the closest a score can get.

## Is it what a listener hears?

Checked on the blind listening tests of the accent trial (`listening_*_worst.json`: per sentence, which of Kokoro's
pitch / the rules / the halved rules sounded worst), 22 sentences with an answer and references that read right:

| measure | picks the one heard as worst | worst below each other variant |
|---|---|---|
| rmse, sentences centred | 17 of 22 | 36 of 44 |
| corr | 17 of 22 | 34 of 44 |
| moves between neighbouring morae (correlation of the differences) | 7 of 22 | 15 of 44 |

Chance is about 7 of 22 (`calibrate.py`). The answers are lopsided (Kokoro's pitch was the worst in 21 of the 22), so "always
Kokoro" would get 21: the check shows that the score ranks the way the listener did more often than not, not that it
replaces listening. Measures on single moves are at chance: the alignment across voices is good for levels, not for
the exact mora where a fall happens. The three services agree with each other on about 75% of their rises and falls.

## What it decided (D27)

Claude's five `none` runs (460 YomiScripts that parse; 390 with morae and a reference that read right), through the
tools' pipeline with each change. `rmse` is the mean against the references' mean contour; the paired column counts,
on the items whose YomiScript the change alters, where it is closer / farther by more than 0.05 semitones.

| version | rmse | corr | paired against the row above it |
|---|---|---|---|
| Kokoro's own pitch (no accent step) | 3.14 | 0.557 | |
| D25: dictionary marks, rules at 0.5 | 2.92 | 0.582 | 237 closer / 124 farther (390 items) |
| D27: 0.75, the spelling rule and the user dictionary | 2.87 | 0.608 | 191 closer / 132 farther (390 items) |

The accent strength (`aux@<scale>`: the same marks in every row, on a build with the first auxiliary rule below):

| ACCENT_SCALE | rmse | corr | paired against 0.5 |
|---|---|---|---|
| 0.5 | 2.92 | 0.581 | |
| 0.75 | 2.87 | 0.608 | 197 closer / 116 farther |
| 1 | 2.89 | 0.619 | 187 / 156 |
| 1.5 | 3.16 | 0.605 | 109 / 248 |

By ear: JSUT BASIC5000_0201-0300 rendered from the hand-labelled marks (`node ours.mjs file`) at 0.75, 1, 1.5 and 2
sound right at 0.75 to 1; 1.5 and 2 are too strong. A measure that keeps rewarding larger pitch movements past 1 is
therefore not to be followed on strength.

Tried and not kept: OpenJTalk puts a verb after て (売られて-いる, 晴れて-います, 書いて-おく) in an accent phrase of
its own, which the dictionary gives a rise (いꜛる, いꜛまꜜす). Joining it to the phrase before, at the level that
phrase ended on (`aux`), was closer on 12 and farther on 21 of the 40 items it changes; leaving it unmarked, with
Kokoro's pitch (`new`), closer on 2 and farther on 15. The references keep D25's way more often than either.

The user dictionary in one sentence: 今日の日本経済を論じる。 D25 left 日本経済を unmarked (the dictionary read
ニッポン, the YomiScript にほん); D27 marks it `ɲiꜛhoŋ keꜜːzai o`.
