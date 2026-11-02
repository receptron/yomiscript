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
- Kept so far: 2,503 sentences (the kana pass to come).
