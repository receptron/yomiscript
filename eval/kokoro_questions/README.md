# eval/kokoro_questions — Does the original Kokoro raise the pitch at the end of questions?

Original pipeline, unmodified (`kokoro` 0.9.4, `KPipeline` + `KModel`, PyTorch). `run.py` records, for all 28 English voices
(American and British, female and male) and 63 sentences (`sentences.json`), the F0 the model predicts, mapped to
phonemes with its predicted durations, and for 3 voices also synthesizes the audio and measures it with librosa.pyin.
`analyze.py` summarizes (`results.txt`).

Sentences: 12 pairs with the same words ending in `.` or `?` (declarative questions), 12 inverted yes/no questions with
the matching statements, 8 wh-questions, 4 tag questions, 3 alternative questions.

## Result (2026-10-29)

**The question mark does not change the pitch at the end.** Same voice, same words, only `.` vs `?`: the end pitch
differs by +0.01 ± 0.98 semitones (310 pairs). Inverted yes/no questions vs their statements: −0.16 ± 2.14.

| (28 voices, model F0) | clearly rising end* | end vs median | paper-style "rising" (slope > 0)** |
|---|---|---|---|
| same words, `.` | 2.6 % | −4.7 st | 11.5 % |
| same words, `?` | 1.6 % | −4.7 st | 11.2 % |
| yes/no questions | 3.7 % | −5.6 st | 6.1 % |
| statements | 2.7 % | −5.5 st | 6.1 % |
| wh-questions | 3.4 % | −4.8 st | 8.7 % |

\* end of the last word ≥ 2 st above its lowest point and above the utterance median. \*\* sign of a line fitted to the
second half, as in Salem et al. (below).

- Every voice behaves the same (per-voice table in `results.txt`); a few voices (af_bella, bm_lewis) rise occasionally,
  equally often on statements.
- Audio check: the predicted F0 is what is heard. Time-aligned, predicted and measured contours correlate 0.97–0.99
  (mean difference 0.3–0.45 st). In the audio of 3 voices, statements and questions also look the same.
- The model does receive the `?`: it is in the phoneme string and the input ids (see `eval/kokoro_parity`).

## Compared with the published number
Salem et al., "Evaluating Question Prosody in Text-to-Speech Software" (Speech Prosody 2026) report that Kokoro produced
rising pitch on 66.7 % of yes/no questions and 61.9 % of wh-questions. That is 9 yes/no questions from one audiobook
story, an unnamed voice, and a slope-sign rule on the second half of the utterance (the paper's text says a *negative*
slope was classified as rising, which reads like a typo). With the same slope rule on our audio, yes/no questions rise
21 % and statements 12.5 % (3 voices); on the model F0 of 28 voices, 6 % for both. We see no effect of the question
form or the question mark itself.
