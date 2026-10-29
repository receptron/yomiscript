# yomite/ja_kokoro — Japanese Yomite built on Kokoro

Turns Japanese text into YomiScript, optionally with pitch values, using the two halves of Kokoro-82M that are not voice generation:

```
Japanese text ─► g2p.py (Kokoro's Japanese front end: misaki Cutlet + UniDic) ─► YomiScript: IPA morae, words, boundaries
              ─► Kokoro's prosody predictor (ONNX enc + f0n, demo/ys_web/web/kokoro_prosody.js) ─► + <f0:…> values
```

- `g2p.py` runs the original front end unchanged (`KPipeline(lang_code='j', model=False)`: line splitting, chunking at 400 characters, truncation at 510 phonemes) and rewrites each chunk's phoneme string as YomiScript (D22):
  - morae in YomiScript IPA (spec §4): `ʨ`→`tɕ`, `ʥ`→`dʑ`, `ʦ`→`ts`, `ʣ`→`dz`, `β`→`w`, `ɨ`→`ɯ` (`zɨ`→`dzɯ`), `kʲi`→`ki` (also ɡ b p m ɾ v ɸ t d ts); `ʔ` before a consonant is written as a doubled consonant (`moʔte`→`motte`).
  - Words stay separated by spaces. A final `?` becomes `↗`, and so does a `?` inside the utterance. Other punctuation the model sees (`!` `:` `;` `...` `«` `»`) and text the front end leaves as it is (Latin letters) become `<p:…>`.
  - The original drops `。` and `、` (UniDic knows them, and Cutlet maps their reading `*` to nothing), and also `「」『』・`. So the model never gets a `.` or a `,` in Japanese. The Yomite writes `↘` and `‖` where `。` and `、` stood. It finds those spots by running the same G2P on the pieces of text between them, and keeps the marks only if the pieces give exactly the same phonemes. The Katarite renders the marks the way the original does: as nothing but the word space.
- `yomite_ja.mjs` runs `g2p.py`, then the predictor in Node, and writes up to three `<f0:…>` points per mora (semitones relative to the sentence's mean). The voice is `jf_alpha`, the Katarite's default for `ja`.
- With no pitch values, Yomite + Katarite behave exactly like the original Kokoro (`eval/kokoro_parity`, `results_ja.txt`).

```
YOMITE_PY=<python with kokoro + misaki[ja]> python g2p.py "明日は学校に行きますか？"
  {"index": 0, "text": "明日は学校に行きますか？", "ys": "ja /asɯ wa ɡakkoː ɲi ikimasɯ ka ↗/", "kokoro": "asɨ βa ɡaʔkoː ɲi ikʲimasɨ ka?"}
YOMITE_PY=... node yomite_ja.mjs "明日は学校に行きますか？"
```
Setup: `pip install kokoro "misaki[ja]"`, then `python -m unidic download` (about 500 MB, UniDic 3.1.0). With python.org builds on macOS, set `SSL_CERT_FILE=$(python -m certifi)` for the download.

The ONNX models and voices must be in `demo/ys_web/web` for `yomite_ja.mjs` (see `demo/ys_web/README.md`).

## Known behaviour of the original (2026-10-29)
- **No accent information goes in.** Kokoro's Japanese input is phonemes and spaces only. Pitch accent comes entirely from the model's own prediction, so this Yomite writes no `ꜛ` `ꜜ`.
- **No `.` or `,`.** `。` and `、` are lost, as described above. Pauses at `、` and sentence ends at `。` are not marked in the model's input. Two sentences on one line run together with only a word space between them.
- **Questions.** `？` reaches the model as `?`, but the end does not rise. Across all 5 Japanese voices and 49 sentences, no yes/no question rises at the end (`eval/kokoro_questions`, `results_ja.txt`).
- Latin words (`iPhone`, `OK`) are passed to the model as letters. Unknown kanji are dropped silently.
