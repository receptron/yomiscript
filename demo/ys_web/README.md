# demo/ys_web — Browser-only YomiScript speech synthesis demo

Enter YomiScript and the demo runs Kokoro-82M in the browser (onnxruntime-web, WASM) to turn it into speech. F0 override from Japanese accent marks is also done in the browser. In YomiScript you write how you want each word to be pronounced.

## Layout
- `web/index.html`, `web/ys.js`: the demo itself (YomiScript conversion, F0 override, inference). `web/presets.json` holds Tokyo/Osaka and mixed-language examples
- `export_split.py`: exports Kokoro as three ONNX files, `enc` / `f0n` / `dec` (so that F0 can be swapped in between)
- `quant.py`: size reduction. `python quant.py w16` creates a version with only the weights stored in fp16 (compute stays fp32) at `models_q/*_w16.onnx` (used by default, about 163 MB total). `i8` is an int8 trial for the decoder
- `serve.py`: local server with COOP/COEP headers (required for WASM multithreading)
- `qeval.py`: quality comparison against fp32 (pyin F0 correlation, mel difference). `drift.py`: per-segment comparison of torch, Python ONNX and JS
- `parity.mjs` / `node_test.mjs` / `pw_test.mjs` / `pw_bench.mjs` / `ort_check.py`: parity checks against the Python version, tests and speed measurement in Node and Playwright

## Exporting the split ONNX (Python 3.11)
```
pip install kokoro torch onnx
python export_split.py     # creates models/enc.onnx, f0n.onnx, dec.onnx (about 311 MB total)
```
Voice files are created with `export_voices.py`. From `voices-v1.0.bin` (obtained as described in `tts/kokoro_ys/README.md`), it writes each voice's style vector (510, 1, 256) float32 as raw bytes to `voices/<name>.bin`.
```
python export_voices.py path/to/voices-v1.0.bin   # the demo's 7 voices by default
```
Weights and voices are fetched automatically from `hexgrad/Kokoro-82M` (Apache-2.0). Generated files are not included in the repository.

## Running
```
npm install
python quant.py w16
cd web && ln -s ../models models && ln -s ../voices voices && ln -s ../node_modules/onnxruntime-web/dist ort && cd ..
for f in enc_w16 f0n_w16 dec_w16; do ln -s ../models_q/$f.onnx models/$f.onnx; done
python serve.py 8000 web   # open http://localhost:8000/
```
URL parameters:
- `?m=` model: `w16` (default; fp16 weights, about 163 MB total) / `fp32` (about 311 MB) / `i8` (decoder MatMul and Gemm in int8)
- `?t=` number of WASM threads (default 4; requires COOP/COEP headers, so serve with `serve.py`)
- `?ep=webgpu` try WebGPU (falls back to WASM where unavailable)

Rough figures (8-core CPU, headless Chromium, 4 threads): 3.5 s of audio synthesized in about 2.8 s (real-time factor about 0.8). Mixed-language sentences run inference per segment, so about 1.2.
Quality: the fp16-weight version has an F0 correlation of 0.995 or higher with fp32, and the Whisper transcriptions are identical.
Speed measurement: `node pw_bench.mjs 8000 "m=w16"`
