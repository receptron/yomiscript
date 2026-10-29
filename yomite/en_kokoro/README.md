# yomite/en_kokoro — English Yomite built on Kokoro

Turns English text into YomiScript with pitch values, using the two halves of Kokoro-82M that are not voice generation:

```
English text ─► g2p.py (misaki, Kokoro's English G2P) ─► YomiScript: IPA, stress, syllables, boundaries
             ─► Kokoro's prosody predictor (ONNX enc + f0n, demo/ys_web/web/kokoro_prosody.js) ─► + <f0:…> values
```

- `g2p.py`: converts misaki's Kokoro notation to YomiScript IPA (`A`→`eɪ`, `I`→`aɪ`, `W`→`aʊ`, `Y`→`ɔɪ`, `O`→`oʊ`, `Q`→`əʊ`, `ʧ`→`tʃ`, `ʤ`→`dʒ`, `T`→`ɾ`), splits syllables (maximal legal onset), puts stress marks at the start of the syllable, and turns `,` `;` `:` `—` into ` ‖ `.
- `yomite_en.mjs`: runs `g2p.py`, then the predictor in Node, and writes up to three `<f0:…>` points per syllable (semitones relative to the sentence's mean).
- Round trip: for the test sentences, the Katarite (`demo/ys_web/web/ys.js`) turns this YomiScript back into exactly the phoneme string misaki gives Kokoro, so the reading is unchanged; the Katarite maps `ɾ` back to Kokoro's English flap token `T`.

```
YOMITE_PY=<python with misaki> node yomite_en.mjs "Did you remember to lock the front door?"
```
Needs the demo's ONNX models and voices in `demo/ys_web/web` (see `demo/ys_web/README.md`) and `pip install kokoro` (brings misaki; spaCy's `en_core_web_sm` is downloaded on first use). Pitch is predicted with the voice the Katarite uses for the language (`af_heart` for en-US).

Known behaviour (2026-10-29): Kokoro's predictor does not raise the pitch at the end of yes/no questions, and its sentence-final falls are deep (−12 to −16 semitones on the last syllable). Compare with LLM Yomites in `eval/llm_yomite`.
