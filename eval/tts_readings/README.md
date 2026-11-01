# How often TTS misreads Japanese words whose reading depends on the context

Question: how often do the newest commercial TTS models read the hard set (`eval/data/hard_set.tsv`: homographs,
acronyms, numbers with counters, dates and times) the wrong way, next to the original Kokoro and to an LLM writing
YomiScript for Kokoro?

## Systems (2026-10-31)

| system | what reads the text | runs |
|---|---|---|
| `openai.gpt-4o-mini-tts-2025-12-15` | OpenAI's newest TTS model (snapshot), voice coral | 3 |
| `gemini.gemini-3.8-flash-tts` | Gemini's newest TTS model, voice Kore | 3 |
| `elevenlabs.eleven_v3` | ElevenLabs' newest model, voice Rachel | 3 |
| `elevenlabs.eleven_multilingual_v2` | ElevenLabs' previous model, for comparison | 3 |
| `kokoro.original` | Kokoro-82M with its own front end (misaki), as the original pipeline runs it | 1 |
| `claude+kokoro`, `codex+kokoro` | the LLM's YomiScript (`eval/browser_tts` results), with the dictionary accent, through Kokoro | 1 |

The commercial systems get the plain text; they are run three times because they do not always read a sentence
the same way. Kokoro reads a YomiScript the same way every time, so one run each (the LLMs' own run-to-run
variation is not measured here).

## The judge

Whisper cannot decide a reading: it writes most of what it hears in kanji and digits, even with a prompt in kana,
and its language model leans to the expected words (a misread 一日 comes out as 一日 again). The judge is a CTC model
that hears Japanese as hiragana (`vumichien/wav2vec2-large-xlsr-japanese-hiragana`, Apache-2.0, no language model),
on minimal pairs: for each word of `targets.tsv`, the sentence's gold reading with that word read each way listed
(right or misread) and everything else the same. The reading with the highest CTC likelihood is the one heard. A
sentence counts as read right when all its words are. `targets.tsv` lists 69 words in 62 of the 70 sentences; the
other 8 are not judged because every plausible reading of them counts as right (今日 in h005, 紅葉, SIP, NHK, and
others).

Checked on the recordings whose spoken phonemes are known (the original Kokoro, and Claude's and Codex's YomiScript
through Kokoro): the judge agrees with the known reading on 193 of 207 words (93.2%). 13 of the 14 errors are a
right reading judged misread (角, 何本, 9時, 30分, 3匹, 10本, 24日); one is the other way: the original Kokoro's 8分
read はちぷん, judged はちふん (a right reading). All are on Kokoro's audio. The judge mostly understates a system's
accuracy, and it understates Kokoro's most.

The known readings are taken from the phoneme strings romanized. Until 2026-10-31 the romanization dropped ʦ ʨ ʣ ʥ
and ŋ (they lie outside the character range it kept); with them kept, the original Kokoro's 辛い in h020 (つらい, a
misreading) is no longer counted as a judge error, and its 8分 (はちぷん) is. The agreement stays at 193 of 207.

Two earlier judges were dropped for that reason: Whisper's transcripts compared with the gold (it counted the
original Kokoro's misread dates as right), and the multilingual forced aligner of `eval/prosody_ref` (MMS, romanized
letters) on whole sentences and then on minimal pairs (71% and 90% agreement; it favours the shorter reading).

## Results (`results/summary.md`)

Sentences with every judged word read right, mean over runs, [95% interval from resampling the sentences]:

| system | all (62) | homographs (33) | acronyms (10) | numbers (8) | dates, times (11) | misread in every run | in at least one |
|---|---|---|---|---|---|---|---|
| Claude + Kokoro | 93.5% [87.1, 98.4] | 93.9% | 100% | 100% | 81.8% | 4 | 4 |
| Codex + Kokoro | 90.3% [82.3, 96.8] | 93.9% | 100% | 75.0% | 81.8% | 6 | 6 |
| Gemini 3.8 Flash TTS | 85.5% [76.9, 93.0] | 87.9% | 100% | 75.0% | 72.7% | 6 | 12 |
| ElevenLabs v3 | 75.3% [65.1, 84.9] | 65.7% | 93.3% | 66.7% | 93.9% | 11 | 19 |
| OpenAI gpt-4o-mini-tts | 72.6% [62.9, 81.7] | 69.7% | 100% | 70.8% | 57.6% | 8 | 25 |
| ElevenLabs multilingual v2 | 60.2% [48.9, 71.0] | 49.5% | 96.7% | 58.3% | 60.6% | 20 | 30 |
| original Kokoro | 30.6% [19.4, 41.9] | 51.5% | 0% | 25.0% | 0% | 43 | 43 |

Without the 8 words the judge misjudged on known readings (55 sentences): Gemini 93.3%, ElevenLabs v3 78.8%, OpenAI
77.0%, ElevenLabs v2 63.6%, the original Kokoro 32.7%. Claude and Codex come out at 100% there, but only because the
words left out are where the judge erred on their audio; for them, what the LLM wrote is the better measure: the
reading is right on 69 and 70 of the 70 sentences at the phoneme level, and on all 69 judged words for both
(`eval/browser_tts`, `results/targets.md`).

Paired differences on the same sentences (each system's runs averaged within a sentence, the difference taken per
sentence, the sentences resampled), in percentage points, [95% interval]:

| A − B | all 62 sentences | sentences A / B better | without the 8 words (55) | A / B better |
|---|---|---|---|---|
| Claude + Kokoro − Gemini | +8.1 [+2.2, +15.6] | 8 / 2 | +6.7 [+1.8, +12.7] | 6 / 0 |
| Claude + Kokoro − OpenAI | +21.0 [+11.3, +31.2] | 22 / 3 | +23.0 [+14.5, +32.1] | 20 / 0 |
| Claude + Kokoro − ElevenLabs v3 | +18.3 [+7.5, +29.0] | 16 / 3 | +21.2 [+11.5, +31.5] | 14 / 0 |
| Claude + Kokoro − ElevenLabs v2 | +33.3 [+21.5, +45.7] | 27 / 2 | +36.4 [+24.8, +48.5] | 24 / 0 |
| Codex + Kokoro − Gemini | +4.8 [0.0, +10.8] | 6 / 2 | +6.7 [+1.8, +12.7] | 6 / 0 |
| Codex + Kokoro − OpenAI | +17.7 [+8.6, +27.4] | 20 / 3 | +23.0 [+14.5, +32.1] | 20 / 0 |
| Codex + Kokoro − ElevenLabs v3 | +15.1 [+4.8, +25.3] | 14 / 4 | +21.2 [+11.5, +31.5] | 14 / 0 |
| Codex + Kokoro − ElevenLabs v2 | +30.1 [+18.3, +41.9] | 25 / 2 | +36.4 [+24.8, +48.5] | 24 / 0 |
| Gemini − OpenAI | +12.9 [+3.8, +22.0] | 18 / 5 | +16.4 [+7.3, +25.5] | 17 / 3 |
| Gemini − ElevenLabs v3 | +10.2 [+0.5, +20.4] | 13 / 8 | +14.5 [+4.8, +24.8] | 12 / 4 |
| Claude + Kokoro − Codex + Kokoro | +3.2 [0.0, +8.1] | 2 / 0 | 0.0 [0, 0] | 0 / 0 |
| ElevenLabs v3 − OpenAI | +2.7 [-7.5, +12.9] | 14 / 11 | +1.8 [-9.1, +12.7] | 12 / 10 |

The LLMs' YomiScript through Kokoro reads more of the hard set right than every commercial system, and Gemini more
than OpenAI and ElevenLabs v3. The margins over Gemini are the smallest: Codex + Kokoro against Gemini on all 62
sentences has an interval that reaches 0 (no difference detected there), and the Gemini − ElevenLabs v3 interval
nearly does. Without the 8 words the judge misjudged on Kokoro's audio, every LLM-with-Kokoro difference excludes 0.
Intervals that include 0 (ElevenLabs v3 against OpenAI; Claude against Codex) mean no difference was detected, not
that the systems are equivalent. The judge's errors on Claude's and Codex's audio all go against them, so on all 62
sentences the differences in favour of Claude and Codex are understated, if anything. The LLMs ran once each, so their own run-to-run variation
is not in these intervals.

What the commercial systems misread most: 上手 (かみて, うわて), 人気 (ひとけ), 一日 (ついたち), 市 (いち), 目下
(もっか), 色紙 (いろがみ), 生物 (なまもの), 大家 (おおや), and dates (二十日, 一日, 八日). Acronyms are read right by
nearly all of them (ElevenLabs: SAP and AI in some runs). `results/review.md` lists every word judged misread, and every close call, for listening.

## Limits

- The hard set is small and its gold readings are provisional (its header): the intervals are wide.
- The judge is checked on Kokoro's audio only; on the commercial systems' natural speech it may err less, but this is
  not measured. The words judged misread should be confirmed by ear before the numbers are published.
- One voice per service; the readings may differ by voice.

## Listening check (`listen/`)

The judge is validated on Kokoro's audio only, so its verdicts on the commercial audio are to be checked by native
listeners. `listen/build.mjs` makes the listening set `listen/set.json`: every recording (system, run, sentence) in
which the judge heard a target word misread (251), and as many recordings it heard read right, sampled at random with
a fixed seed (the control), across all seven systems: 502 clips, 22.7 minutes of audio, about 2 hours per listener
(each clip played twice, about 4 seconds to read the sentence and 4 per word); the page saves the progress in the
browser, so it can be done in several sittings. `set.json` is the key (system, run and verdict of each clip id); the
page is served only the sentence, the words and the readings, and the clips by opaque id, in an order shuffled per
listener. The voices still differ between services, so a listener may recognise one; the names are what is hidden.

The page (Japanese) shows the sentence with the target words marked and asks, per word, which reading was heard: the
readings of `targets.tsv` (right and misread, shuffled), その他（自由記述）, or 聞き取れない; naturalness 1-5 is
optional. It downloads the answers as `listening.<name>.json`.

```bash
node listen/serve.mjs          # http://127.0.0.1:8793/ (needs audio/; builds listen/set.json when it is missing)
node listen/score.mjs answers/listening.*.json   # results/listening.md
node listen/check.mjs          # the page in headless Chromium (Playwright): loads, answers 3 clips, downloads
```

`score.mjs` labels a word right when the reading chosen is a right one, misread when it is a misreading or その他
(the right readings were offered), and leaves out 聞き取れない; with several listeners the majority counts. It writes
the judge's agreement with the listeners (overall, per stratum, per system, per word), each system's accuracy as heard
(the recordings outside the set, and unlabelled ones, take their system's rate in the same stratum; 95% interval
resampling the sentences), Cohen's kappa per pair of listeners and Fleiss' kappa, the naturalness means, and every
word where the listeners and the judge differ. A report made from answers of a listener named `FAKE...` (as
`check.mjs` makes) or marked `"fake": true` is headed as fake.

## Run

```bash
node speak.mjs 3            # audio/<system>/r<k>/hard.<name>.wav (API keys: the environment or the repository's .env)
../prosody_ref/.venv/bin/pip install -r requirements.txt
../prosody_ref/.venv/bin/python score.py   # results/summary.md, items.json, review.md
../prosody_ref/.venv/bin/python score.py --stored   # results/summary.md again from the verdicts in items.json (no audio)
```

`audio/` is not kept in the repository. The services are called through `../prosody_ref/services.mjs`.
