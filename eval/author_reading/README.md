# Does it matter that the author writes the reading?

The LLM-Yomite results (`eval/browser_tts`) show that an LLM reads Japanese homographs better than a dictionary front
end. They do not show that it matters who the LLM is: the one that wrote the text, or another one reading it
afterwards (issue #18). This experiment separates the two.

## Design

`scenarios.tsv`: 50 chat scenarios, 25 homographs with two readings each (上手 じょうず / かみて, 人気 にんき / ひとけ,
生花 せいか / いけばな, …). Each is a user's message whose context fixes the reading, ending with 「「X」という言葉を使って、
一言で答えて。」 so that the answer contains the word and is short. 一日 is left out because the YomiScript
instructions use it as an example. The right readings were set by the project and are to be reviewed.

Three LLMs, through their CLIs with no tools (2026-11-01): Claude Code (`claude-opus-5-5`), Codex (`gpt-6.1-sol`)
and Antigravity (`gemini-4-argon-medium`). All get the YomiScript instructions the tools give
(`YOMISCRIPT_INSTRUCTIONS` of `@yomiscript/core`). Conditions, on the same answers:

- **author**: the LLM answers the user and writes its answer as YomiScript in the same call, as with a speak tool;
- **reader, text**: an LLM (the author's own model or another) writes YomiScript for the answer alone, in a new call;
- **reader, context**: the same, given the user's message as well;
- **pyopenjtalk**: the dictionary front end on the answer.

Every author's answer is read by every LLM in both reader conditions: 150 author calls and 900 reader calls, one run.

The word's reading is taken from the YomiScript through the `<t:…>` layer (the IPA of the spans that cover it) and
compared, in a coarse spelling, with the right readings and the listed misreadings. A reading that is neither (a
misreading not listed, IPA that does not spell a reading, or a `<t:…>` layer that does not line up with the text) is
not right; `results/r1/other.md` lists them (13).

## Results (`results/r1/summary.md`)

All 150 answers contain the word. Homograph read right, [95% interval from resampling the answers]:

| condition | all (150) | author Claude | author Codex | author Gemini |
|---|---|---|---|---|
| author (its own answer, same call) | 98.0% [95.3, 100] | 96.0% | 100% | 98.0% |
| same LLM, reading the answer only | 92.0% [87.3, 96.0] | 94.0% | 88.0% | 94.0% |
| same LLM, with the user's message | 98.0% [95.3, 100] | 96.0% | 98.0% | 100% |
| another LLM, reading the answer only | 91.7% [87.7, 95.3] | 94.0% | 89.0% | 92.0% |
| another LLM, with the user's message | 97.0% [94.7, 99.0] | 98.0% | 98.0% | 95.0% |
| pyopenjtalk | 56.0% [48.0, 64.0] | | | |

On the same answers (exact McNemar, treating the 150 answers as independent): the author against the same LLM reading
the answer only, 10 answers the author read right and the reader not, 1 the other way (p = 0.012); the author against
the same LLM given the user's message, 1 and 1 (p = 1). No reader LLM differs from another significantly.

The answers are not independent: the three authors answer the same 50 scenarios, and the two scenarios of a word share
the word. Resampling whole scenarios or whole words instead of answers (paired differences on the same answers, in
percentage points, [95% interval]). The accuracies' intervals widen only a little (the author 98.0% [94.7, 100], the
same LLM reading the answer only 92.0% [86.0, 96.7], with words resampled; `results/r1/summary.md` has all of them).

| A − B | difference | answers A / B better | words A / B better (sign test) | resampling scenarios | resampling words |
|---|---|---|---|---|---|
| author − same LLM, answer only | +6.0 | 10 / 1 | 6 / 1 (p = 0.13) | [+1.3, +12.0] | [+0.7, +12.0] |
| author − same LLM, with the user's message | 0.0 | 1 / 1 | 0 / 0 | [0, 0] | [0, 0] |
| (with the message) − (answer only), same LLM | +6.0 | 10 / 1 | 6 / 1 (p = 0.13) | [+1.3, +12.0] | [+0.7, +12.0] |
| author − another LLM, answer only | +6.3 | 16 / 2 | 7 / 1 (p = 0.07) | [+1.7, +12.0] | [+1.3, +12.7] |
| author − another LLM, with the user's message | +1.0 | 7 / 2 | 5 / 2 (p = 0.45) | [-1.3, +3.3] | [-1.3, +3.3] |

The advantage of the context (the author, or a reader given the user's message, over a reader of the answer alone)
stays above 0 when scenarios or words are resampled, but it rests on few words: 7 of the 25 words differ at all, and
counting one vote per word (6 to 1) it is not significant (p = 0.13). It is a consistent direction on a small set,
not an established effect. The author and a reader given the user's message differ on two answers, in opposite
directions and in the same scenario (大事 おおごと), so the clustered interval collapses to [0, 0]: that is no
difference detected on very little evidence, not a shown equivalence. The same holds for the other intervals that
include 0.

What matters, as far as these data show, is the context, not the authorship as such. A reader given only the answer
misreads where the answer is too short to fix the reading: 「それは生花です。」 (いけばな; misread in all 9 reader calls), 「風車ですね。」
(かざぐるま), 「角です。」 (つの), 「辛いです。」 (つらい), 「大事には至らずに済みました。」 (おおごと). Given the user's message,
a reader did as well as the author here (no difference detected). The author has that context by construction, in
the same call and at no extra cost; a separate Yomite has it only if the conversation is passed to it as well.

The answers were often less terse than asked: the authors tended to repeat the context in the answer (「客席から見て
右側の上手から登場します。」), which lets a reader of the answer alone get it right. With terser answers the gap would be
larger.

## Limits

- One run per condition; 50 scenarios written by the project, whose right readings have not been reviewed. With 25
  words and 7 of them differing between conditions, the differences are not established beyond their direction.
- The scenarios ask for the word and a short answer, which makes the situation where the context matters more common
  than in free conversation.
- The LLMs' own misreadings (末期 as まつき) and notation errors count against them in every condition alike.

## Run

```bash
node run.mjs 1                                  # results/r1/author/…, results/r1/reader/… (claude, codex, agy CLIs)
../prosody_ref/.venv/bin/python score.py 1      # results/r1/summary.md, other.md
```
