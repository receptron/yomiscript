# Browser TTS: the LLM as the Yomite for Kokoro

Question: in a chat plugin that lets an LLM speak, can the LLM itself be the Yomite (text → YomiScript), so that the
browser only needs the Katarite (Kokoro, ONNX)? Kokoro's original Japanese front end (misaki Cutlet + UniDic 3.1.0) does
not fit in a browser (UniDic 3.1.0 as the `unidic` package installs it: `matrix.bin`, the connection table, 481 MB, 413 MB with gzip; `sys.dic` 243 MB), so this is what makes Kokoro-in-the-browser
possible for Japanese.

The LLM writes YomiScript **without pitch values or accent marks**; Kokoro's own predictor makes the prosody, as in the
original. Everything is compared at the phoneme string Kokoro is given (the Katarite's plan in `packages/kokoro`).

## Sets (read in place by `sets.mjs`)

| set | texts | compared with |
|---|---|---|
| `ja` | `eval/kokoro_parity/texts_ja.json` (24) | the original Kokoro front end |
| `en` | `eval/kokoro_parity/texts.json` (22) | the original Kokoro front end |
| `hard` | `eval/data/hard_set.tsv` (70: homographs, acronyms, numbers, dates) | the gold readings (reviewed by one native speaker of the project) |

Systems: Claude and Codex as the Yomite (`prompt.md`, `examples.json`), the original Kokoro front end, pyopenjtalk
(OpenJTalk + NAIST-JDIC, the front end piper-plus runs as WASM; used as its stand-in for readings), and, for listening
only, Supertonic 3 (raw text in), Audio8 TTS 0.1B (raw text and the LLM's YomiScript as text, made by
`eval/audio8`) and the macOS system voices (what the Web Speech API uses on a Mac).

## Run

```bash
python refs.py                    # references: original Kokoro, pyopenjtalk, gold   (python with kokoro, misaki[ja], pyopenjtalk)
node run.mjs                      # Claude and Codex, all sets -> results/<llm>.<set>.json   (uses the claude and codex CLIs)
node score.mjs                    # -> results/summary.md, results/items.json
../prosody_ref/.venv/bin/python target_score.py   # the hard set's target words -> results/targets.md
node audio_kokoro.mjs             # Kokoro audio for the original front end and both LLMs (demo models, w16)
python audio_supertonic.py        # Supertonic 3 audio from the plain text (pip install supertonic; downloads 385 MB once)
python audio_supertonic.py --ys codex ambiguous   # the Supertonic Katarite from the LLM's YomiScript (rule: ambiguous or kanji)
sh audio_say.sh                   # macOS system voices
python asr.py && python asr_score.py   # Whisper transcripts -> results/asr_summary.md (mlx_whisper, pyopenjtalk)
node page.mjs                     # -> audio/listen.json; then serve this directory and open listen.html
```

`audio/` is not checked in.

## Scoring

- **phoneme string identical**: exactly what Kokoro is given, word spaces included.
- **same reading**: ignores word spaces, punctuation, the spelling of long vowels (イイ / イー, エイ / エー), Kokoro's ɨ for a
  devoiced ɯ, which allophone a moraic nasal is written with, and h / n before i written without the palatal allophone
  (hi = çi, ni = ɲi). For English: stress marks, Kokoro's reduced vowels (ɐ ᵊ ᵻ → ə) and flap (T → t).
  The allophone and stress differences still change what Kokoro is given, so they can be heard; they are not a different reading.
- The hard set's gold was reviewed by one native speaker of the project, not by independent annotators (see the file header).

## Results (2026-10-29, one run per LLM; `results/summary.md`, `results/asr_summary.md`)

Prompt rounds: the first gave the LLMs too little of the notation (they wrote `ni` for に, several utterances per
item); the second added the spec's mora table and the one-utterance rule; the third added the original text
(`<t:…>`, D23). The numbers below are from the third.

- Readings, hard set (gold): Codex 100%, Claude 98.6% (the one miss is notation, not reading: 経済 written `keːzai`,
  where the spec writes ザ as `dza`; in the second round it was 上手 read わて for うわて); pyopenjtalk 78.6%,
  the original Kokoro front end 32.9% (it leaves Latin letters as they are and misreads dates).
- Original text: joining the `<t:…>` values gives back the input in 232 of 232 outputs.
- Cost: the YomiScript is 5.6-6.1 times the characters of the Japanese text (2.7-3.2 without `<t:…>`), 3.1 times for
  English; Claude wrote 8,400-11,100 output tokens per set.
- Intelligibility (Whisper, kana error rate on the hard set): LLM YomiScript with Kokoro 3.7-3.9%; with the Supertonic
  Katarite 5.6-7.6% (text with kana for ambiguous words; an all-kana rendering, 6.2-6.5%, was dropped); Supertonic on
  the plain text 13.8%.
  Whisper and pyopenjtalk add their own errors, so these compare systems only; naturalness is for listening.
- The hint rule leaves 3 of the 35 homographs as written, all in words that fix the reading (市役所, 朝市, 何本).
- A long text (the `long` item) cannot be spoken by Kokoro from a single LLM utterance: the Katarite does not split
  it into pieces of 510 phonemes yet (`docs/plan.md`).

## Target words of the hard set (`target_score.py`, `results/targets.md`)

The hard-set score above is per sentence, so a notation slip anywhere in the sentence counts against the word the
sentence is about (h005: Claude wrote 経済 as `keːzai`). `target_score.py` scores only the words whose reading is in
question, the 69 words in 62 sentences of `eval/tts_readings/targets.tsv` (the other 8 sentences, h005 among them,
have no such word), from the phoneme strings in `results/items.json`.

Method: the sentence's first gold reading is written once with each reading of the word (the right ones and the
listed misreadings, everything else the same), as the TTS judge's minimal pairs. The phoneme string and the
candidates are romanized (`romanized` and `spelt` of `eval/tts_readings/score.py`), and the word takes the reading of
the candidate at the smallest edit distance; a slip elsewhere adds the same distance to every candidate. A word is
listed for checking when the right and the misread candidates are equally far (none are), or when the chosen
reading, romanized, does not occur in the phoneme string.

| system | target words right (69) | sentences, all targets right (62) | sentence-level, same 62 | sentence-level, all 70 |
|---|---|---|---|---|
| Claude | 100% (69) | 100% | 100% | 98.6% (69) |
| Codex | 100% (69) | 100% | 100% | 100% (70) |
| pyopenjtalk | 81.2% (56) | 79.0% (49) | 77.4% (48) | 78.6% (55) |
| original Kokoro front end | 31.9% (22) | 30.6% (19) | 29.0% (18) | 32.9% (23) |

Claude's one sentence-level miss (h005) is not a target-word miss; the LLMs read every target word right. By
category (words): pyopenjtalk 62.9% of the 35 homographs and all acronyms, numbers and dates; the original front end
57.1% of homographs, 0 of 10 acronyms, 1 of 8 numbers, 1 of 16 dates and times.

The words listed for checking, resolved by hand:

- Romanization only (counted right, rightly): JR (pyopenjtalk `ʥeiaːɾɯ`, エイ for エー), IoT (`spelt` writes ティー
  differently from Kokoro's `tʲiː`), 20日 (`spelt` gives ハツカ a geminate).
- 25.5度, pyopenjtalk: `ɲiʥɨːɡoːteŋɡodo`, ゴー with a long vowel. Counted right here; the sentence-level score counts
  it wrong (the gold has ゴ).
- 一日中, the original front end: `iʨiɲiʨi ʨɨː`, いちにちちゅう (no voicing of 中), neither listed reading. The method
  counts it right (一日 is read いちにち); counted as not right, the original front end is at 21 of 69 (30.4%).
- 2人 (`ɲi çito`, にひと) and 4月 in h069 (`joɴ ʦɨkʲi`, よんつき), the original front end: neither listed reading;
  counted misread, which they are.

## Trials

- [`trials/accent_marks/`](trials/accent_marks/): the LLM writes Japanese accent marks and the rules give those
  phrases their pitch (2026-10-29, reverted). Listening found no improvement and more misreadings; at least
  one is the LLM's (市 written as し), hidden by an unchanged score, and Whisper did not notice. Repeated runs
  (three per prompt) and a blind test with the reading fixed: the marks bring the pitch closer to the dictionary
  accent, no misreading comes from the sound, and in a worst-accent test Kokoro's own pitch was the worst in 9 of the
  10 sentences where one was heard. Writing the marks changes the LLM's readings (Claude: 市 -> し, 捕えて ->
  とらえて; Codex: broken phonemes). Marks from OpenJTalk's dictionary, written only where its reading agrees with
  the LLM's, keep every reading and sounded as good (Kokoro's pitch the worst in 7 of 8). That is now what the
  tools do (`packages/ja-accent`, D25).
