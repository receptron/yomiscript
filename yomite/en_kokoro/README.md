# yomite/en_kokoro — English Yomite built on Kokoro

Turns English text into YomiScript with pitch values, using the two halves of Kokoro-82M that are not voice generation:

```
English text ─► g2p.py (misaki, Kokoro's English G2P) ─► YomiScript: IPA, stress, syllables, boundaries
             ─► Kokoro's prosody predictor (ONNX enc + f0n, packages/kokoro/src/prosody.ts) ─► + <f0:…> values
```

- `g2p.py`: runs the original Kokoro front end unchanged (`KPipeline(model=False)`: misaki with the espeak-ng fallback, line splitting, chunking at 510) and rewrites each chunk's phoneme string as YomiScript, losslessly: Kokoro notation → IPA (`A`→`eɪ`, `I`→`aɪ`, `W`→`aʊ`, `Y`→`ɔɪ`, `O`→`oʊ`, `Q`→`əʊ`, `ʧ`→`tʃ`, `ʤ`→`dʒ`, `T`→`ɾ`), syllables (maximal legal onset), stress at the start of the syllable, `, ` → ` ‖ `, sentence ends → `↘` / `↗` (also inside the utterance), other punctuation → `<p:…>` (D21).
- `yomite_en.mjs`: runs `g2p.py`, then the predictor in Node, and writes up to three `<f0:…>` points per syllable (semitones relative to the sentence's mean).
- With no pitch values, Yomite + Katarite behave exactly like the original Kokoro: same phoneme string, ids, voice-pack entry, durations and F0 on 23/23 test chunks, audio within the original's own run-to-run variation with the fp32 models (`eval/kokoro_parity`).

```
YOMITE_PY=<python with misaki> node yomite_en.mjs "Did you remember to lock the front door?"
```
Needs the demo's ONNX models and voices in `demo/ys_web/web` (see `demo/ys_web/README.md`) and `pip install kokoro` (brings misaki; spaCy's `en_core_web_sm` is downloaded on first use). Pitch is predicted with the voice the Katarite uses for the language (`af_heart` for en-US).

Known behaviour of the original (2026-10-29, `eval/kokoro_questions`): Kokoro does not raise the pitch at the end of questions; the question mark makes no difference to the final pitch (28 voices, 63 sentences). The predictor's last frames can be very low (−12 to −16 semitones) where the voice is fading out; the audible end falls by about 1–4 semitones.
