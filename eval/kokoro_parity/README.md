# eval/kokoro_parity — Does Yomite + Katarite behave exactly like the original Kokoro?

Reference: the original pipeline, unmodified (`kokoro` 0.9.4: `KPipeline` with misaki + espeak-ng fallback, `KModel` in PyTorch).
Tested: `yomite/en_kokoro/g2p.py` (the original front end, text → YomiScript) → `demo/ys_web/web/ys.js` (Katarite, ONNX, no pitch values).

- `texts.json`: 22 English texts (plain, lists, questions, `!` `;` `:` `—`, quotes, parentheses, numbers, money, abbreviations, contractions, several sentences per line, `...`, an unknown word, a line break, a 510+ phoneme text)
- `ref_kokoro.py`: runs the original and records the phoneme string, input ids, voice-pack index, durations, F0 (captured from `predictor.F0Ntrain`) and audio per chunk
- `compare.mjs`: runs Yomite + Katarite on the same texts and compares each of those; writes our audio next to the reference
- `audio_metrics.py`: correlation, SNR and mel-spectrum L1 against the original, next to the original's own run-to-run variation (its decoder draws random numbers, so two original runs are not identical either)

```
python ref_kokoro.py texts.json REF af_heart      # and again into REF2 for the baseline
YOMITE_PY=<python with kokoro> node compare.mjs REF --m fp32
python audio_metrics.py REF REF2 fp32 w16
```
espeak-ng: the espeakng-loader wheel ignores its data path on this Mac, so the scripts load Homebrew's espeak-ng (same version, 1.52.0); set `ESPEAK_LIB` / `ESPEAK_DATA` to override.

## Result (2026-10-29, voice af_heart, 23 chunks) — see `results.txt`

| | phoneme string | ids | voice index | durations | F0 |
|---|---|---|---|---|---|
| Yomite + Katarite vs original | 23/23 identical | 23/23 | 23/23 | 23/23 | identical (0.000 st) |

| audio vs original | correlation mean / min | SNR | mel L1 mean / max |
|---|---|---|---|
| original, second run (baseline) | 0.9943 / 0.9924 | 19.5 dB | 0.30 / 0.37 dB |
| Yomite + Katarite, fp32 ONNX | 0.9944 / 0.9888 | 19.7 dB | 0.31 / 0.39 dB |
| Yomite + Katarite, fp16-weight ONNX (demo default) | 0.9854 / 0.8545 | 18.3 dB | 0.32 / 0.61 dB |

With fp32, the audio differs from the original no more than the original differs from itself.

## What had to change to get there
1. **Decoder STFT.** The demo's ONNX export used `KModel(disable_complex=True)`, whose `CustomSTFT` only approximates `torch.stft`/`istft` (replicate padding, DC/Nyquist phase sign flips that the decoder network reads as input, an approximate inverse): correlation 0.88 with the original even in PyTorch with the same seed. `demo/ys_web/exact_stft.py` reproduces torch's STFT exactly and exports to ONNX (same seed: SNR 76–109 dB vs the original); `export_split.py` now uses it.
2. **Voice-pack entry.** The Katarite used `pack[number of tokens]`; the original uses `pack[len(ps) - 1]`.
3. **Output.** A single-language utterance is now returned as the model's audio (no trailing trim, no level cap), like the original.
4. **Front end.** The Yomite now runs the original's own G2P and chunking (`KPipeline(model=False)`, with the espeak-ng fallback) and rewrites its phoneme string as YomiScript losslessly. That needed two notation additions: `<p:…>` for punctuation the model uses as a prosodic cue (`!` `;` `:` `—` `…` quotes, parentheses) and `↘` / `↗` inside an utterance for sentence ends within a line.
