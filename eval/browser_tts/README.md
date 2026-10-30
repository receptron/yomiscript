# Browser TTS: the LLM as the Yomite for Kokoro

Question: in a chat plugin that lets an LLM speak, can the LLM itself be the Yomite (text → YomiScript), so that the
browser only needs the Katarite (Kokoro, ONNX)? Kokoro's original Japanese front end (misaki Cutlet + UniDic 3.1.0) does
not fit in a browser (the UniDic connection table alone is 413 MB gzip), so this is what makes Kokoro-in-the-browser
possible for Japanese.

The LLM writes YomiScript **without pitch values or accent marks**; Kokoro's own predictor makes the prosody, as in the
original. Everything is compared at the phoneme string Kokoro is given (the Katarite's plan in `packages/kokoro`).

## Sets (read in place by `sets.mjs`)

| set | texts | compared with |
|---|---|---|
| `ja` | `eval/kokoro_parity/texts_ja.json` (24) | the original Kokoro front end |
| `en` | `eval/kokoro_parity/texts.json` (22) | the original Kokoro front end |
| `hard` | `eval/data/hard_set.tsv` (70: homographs, acronyms, numbers, dates) | the gold readings (provisional) |

Systems: Claude and Codex as the Yomite (`prompt.md`, `examples.json`), the original Kokoro front end, pyopenjtalk
(OpenJTalk + NAIST-JDIC, the front end piper-plus runs as WASM; used as its stand-in for readings), and, for listening
only, Supertonic 3 (raw text in) and the macOS system voices (what the Web Speech API uses on a Mac).

## Run

```bash
python refs.py                    # references: original Kokoro, pyopenjtalk, gold   (python with kokoro, misaki[ja], pyopenjtalk)
node run.mjs                      # Claude and Codex, all sets -> results/<llm>.<set>.json   (uses the claude and codex CLIs)
node score.mjs                    # -> results/summary.md, results/items.json
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
- The hard set's gold is provisional (see the file header).

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
