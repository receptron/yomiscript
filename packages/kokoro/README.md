# @yomiscript/kokoro

The Kokoro-82M Katarite: YomiScript -> Kokoro's phoneme string and ids -> ONNX (split export enc / f0n / dec) -> audio.
Given a YomiScript written by the original Kokoro front end, it hands Kokoro exactly what the original pipeline does
(D21, D22; `eval/kokoro_parity`).

- `plan(ys)`: what Kokoro is given, per language section (no ONNX).
- `Engine(ort, loadBytes)`: the ONNX engine, for onnxruntime-web (browser; `W16`, fp16 weights) or onnxruntime-node
  (`FP32`, identical to the original). `nodeEngine({ dir, model })` from `@yomiscript/kokoro/node`.
- `KokoroKatarite(engine, { voice })`: core's `Katarite` (audio at 24 kHz and the time of each `<t:…>` span).
- `KokoroProsody`: Kokoro's predicted pitch written back as `<f0:…>` values (a Yomite tool).

Models: `models/{enc,f0n,dec}[_w16].onnx` and `voices/<voice>.bin` in one directory (made by `demo/ys_web/export_split.py`
and `export_voices.py`; distribution from Hugging Face is to do, see `docs/plan.md`).
