# Browser bench: the Kokoro Katarite in a browser, measured

Issue #23. The browser motivation (D24: TypeScript, no Python in what ships; the demo and `misread.html` run Kokoro in
the page) was not measured. This measures, on one machine, the fp16-weight Kokoro (`w16`, 163 MB of ONNX) in headless
Chromium: model loading with an empty and with a filled cache, the time to the first audio, the real-time factor and
the peak memory, on WASM with 1 and 4 threads and on WebGPU.

## Files

- `prep.mjs`: the sentences (`sentences.json`). 15 of Codex's YomiScript readings of the hard set
  (`eval/browser_tts/results/codex.hard.json`), spread evenly over the range of lengths (7 to 18 characters, 2.0 to
  4.4 s of audio), with the dictionary accent added as the tools add it (`@yomiscript/ja-accent`, as
  `demo/ys_web/misread.mjs` does for `misread.html`), plus 3 paragraphs that each join 5 of them into one section (11 to
  14 s of audio, under Kokoro's 510 phonemes).
- `bench.html`: the page. It loads `@yomiscript/kokoro` and onnxruntime-web 1.22.0 (`ort.min.mjs`) the way
  `misread.html?local` does, creates the engine with the `w16` models, runs one warm-up synthesis (`ja /a ↘/`, as
  `misread.html` does), then speaks the sentences one after another. Times are `performance.now()` in the page.
- `bench.mjs`: the driver (Playwright 1.48). It makes a temporary folder linking the page, the sentences, `packages/`,
  `node_modules/onnxruntime-web/dist` and `demo/ys_web/models`, `voices`, serves it with `demo/ys_web/serve.py`
  (COOP/COEP for WASM threads) on `127.0.0.1:8811`, and runs each condition.
- `summary.mjs`: `results/summary.md` from `results/raw.json`.
- `results/raw_webgpu_parts.json`: the one-run probe of one part at a time on WebGPU (`webgpu-enc`, `webgpu-f0n`,
  `webgpu-dec`, `wasm-4-cs`).
- `results/raw.json` (every page's timings, per-file downloads, memory peaks, each sentence's audio envelope),
  `results/summary.md`.

```bash
yarn build                       # at the repository root (the page loads packages/*/dist)
node prep.mjs                    # -> sentences.json (needs the dictionary in ~/.cache/yomiscript/ja-dict)
node bench.mjs 3                 # runs=3, port=8811 -> results/raw.json, results/summary.md (about 40 minutes)
node bench.mjs 1 8811 webgpu-enc,webgpu-f0n   # other conditions by name (see ALL in bench.mjs)
```

## Method

Each run of a condition launches Chromium with a new, empty profile (`launchPersistentContext` on a fresh directory)
and loads the page three times:

- **cold**: the first tab of the fresh profile, nothing cached.
- **warm**: a second tab in the same browser after the first is closed (the HTTP cache filled by the cold tab).
- **restart**: the browser closed and started again on the same profile (what a returning user gets: the disk cache,
  and V8's code cache for the WASM).

Per page:

- **ready**: from the start of the navigation to the engine ready to speak (the page and module loading, onnxruntime
  import, the three model downloads, `InferenceSession.create` for each, and the warm-up synthesis). Split into
  **download** (the time each `fetch` + `arrayBuffer` took, summed), **sessions** (session creation: init time minus
  downloads) and **warm-up** (the first synthesis, which prepares the sessions; with WebGPU it compiles the shaders).
- **first audio**: from the start of the navigation to the end of the synthesis of the first sentence (`h028`, 2.0 s
  of audio). The engine is not streaming: a sentence's audio exists only when its synthesis ends, so this is the time
  to first audio for a user who opens the page and asks for one sentence.
- **real-time factor (RTF)**: synthesis time / audio length, for every sentence in every page (cold, warm, restart),
  median; also pooled (total synthesis time / total audio). Below 1 is faster than real time.
- **transferred**: `transferSize` of the model, voice and WASM files (Resource Timing), to see what the cache served.
- **memory**: the RSS of the browser's processes (`ps`, every 100 ms, the browser started with this profile and its
  descendants): the largest renderer (the page's process; the WASM heap and its worker threads live there), the GPU
  process, and all processes summed; the peak over the page's life and the renderer's RSS when the engine was ready.
  Also the page's JS heap (`Performance.getMetrics` `JSHeapUsedSize`, CDP), which does not include the WASM memory.

Output check: since WebGPU gave wrong results for some parts, each condition's audio is compared with `wasm-4`
(first run, cold page): the number of sentences with the same audio length (the same durations), and the correlation
of the loudness envelopes (50 ms RMS frames).

Conditions (`ALL` in `bench.mjs`):

| condition | what |
|---|---|
| `wasm-1` | WASM, 1 thread |
| `wasm-4` | WASM, 4 threads (what `misread.html` uses: `min(4, hardwareConcurrency)`) |
| `wasm-4-cs` | `wasm-4`, the files kept in the Cache Storage API instead of the HTTP cache |
| `webgpu` | the encoder, the F0 predictor and the decoder on WebGPU (`executionProviders: ["webgpu", "wasm"]`) |
| `webgpu-dec` | the decoder on WebGPU, the encoder and the F0 predictor on WASM (4 threads) |
| `webgpu-enc`, `webgpu-f0n` | one part on WebGPU (used to find which part goes wrong; not in the default run) |

The per-part choice is a wrapper the page puts around onnxruntime (`perPart` in `bench.html`); the packages are not
changed. WebGPU in headless Chromium needs `--enable-unsafe-webgpu`.

## Hardware and browser

MacBook Pro (Mac14,5), Apple M2 Max, 12 cores (8 performance, 4 efficiency), 96 GB, macOS 15.6.1 (24G90). Playwright
1.48.2's Chromium 130.0.6723.31 (`HeadlessChrome/130.0.6723.31`), new headless mode, `hardwareConcurrency` 12. The
WebGPU adapter in headless mode is the real GPU (`vendor: apple`, `architecture: common-3`, not a fallback adapter).
The models are served from this machine (`127.0.0.1`), so the downloads are loopback, not a network. The machine was
in normal use during the runs (browsers, editor and chat apps open, load average about 4 to 5).

## Results (2026-11-01, medians over 3 runs; `results/summary.md`)

Loading and first audio, in seconds from the start of the navigation; memory in MB:

| condition | cache | ready | download | sessions | warm-up | first audio | transferred | renderer RSS at ready | peak renderer RSS | peak total RSS | peak GPU process RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|
| wasm-1 | cold | 2.31 | 0.25 | 1.02 | 0.95 | 5.51 | 186 | 1712 | 1796 | 2081 | 103 |
| wasm-1 | warm | 2.17 | 0.18 | 0.98 | 0.94 | 5.33 | 107 | 1740 | 1823 | 2110 | 103 |
| wasm-1 | restart | 2.23 | 0.17 | 0.98 | 0.96 | 5.42 | 107 | 1728 | 1812 | 2204 | 102 |
| wasm-4 | cold | 1.71 | 0.25 | 1.01 | 0.37 | 2.80 | 186 | 1728 | 1781 | 2065 | 102 |
| wasm-4 | warm | 1.63 | 0.20 | 0.98 | 0.37 | 2.72 | 107 | 1730 | 1787 | 2071 | 102 |
| wasm-4 | restart | 1.60 | 0.18 | 0.98 | 0.37 | 2.69 | 107 | 1742 | 1794 | 2185 | 102 |
| wasm-4-cs | cold | 2.12 | 0.65 | 1.02 | 0.38 | 3.23 | 186 | 1737 | 1884 | 2176 | 102 |
| wasm-4-cs | warm | 1.57 | 0.11 | 1.00 | 0.38 | 2.71 | 0 | 1736 | 1796 | 2084 | 102 |
| wasm-4-cs | restart | 1.57 | 0.10 | 1.00 | 0.38 | 2.67 | 0 | 1735 | 1786 | 2179 | 102 |
| webgpu (wrong output) | cold | 1.79 | 0.28 | 1.04 | 0.40 | 1.97 | 186 | 1705 | 1705 | 2125 | 296 |
| webgpu (wrong output) | warm | 1.54 | 0.20 | 1.02 | 0.25 | 1.72 | 107 | 1713 | 1713 | 2144 | 291 |
| webgpu-dec | cold | 1.69 | 0.26 | 1.09 | 0.26 | 1.86 | 186 | 1724 | 1739 | 2199 | 303 |
| webgpu-dec | warm | 1.50 | 0.19 | 1.08 | 0.16 | 1.65 | 107 | 1718 | 1752 | 2217 | 294 |
| webgpu-dec | restart | 1.49 | 0.17 | 1.08 | 0.15 | 1.65 | 107 | 1732 | 1763 | 2326 | 290 |

The page's JS heap stays at 4 to 14 MB in every condition: the memory is in the WASM heap (and, with WebGPU, the GPU
process), which `JSHeapUsedSize` does not count.

Real-time factor (synthesis time / audio length), over every sentence of every page (n = 162 per condition: 18 texts x
3 pages x 3 runs):

| condition | RTF sentences (2.0-4.4 s audio) | median synthesis s | RTF paragraphs (11-14 s audio) | median synthesis s | RTF pooled |
|---|---|---|---|---|---|
| wasm-1 | 1.60 | 4.64 | 1.59 | 20.86 | 1.60 |
| wasm-4 | 0.54 | 1.57 | 0.52 | 6.85 | 0.54 |
| wasm-4-cs | 0.55 | 1.59 | 0.53 | 6.94 | 0.55 |
| webgpu (wrong output) | 0.12 | 0.18 | 0.05 | 0.40 | 0.08 |
| webgpu-dec | 0.07 | 0.19 | 0.06 | 0.73 | 0.06 |

Output check against `wasm-4`: `wasm-1`, `wasm-4-cs` and `webgpu-dec` give the same audio length for all 18 texts and
an envelope correlation of 1.000. `webgpu` gives a different length for all 18 (median 0.57 of the WASM length): its
audio is not the same speech, so its speed is not a result. A one-run probe of one part at a time
(`results/raw_webgpu_parts.json`) finds the encoder: with only the encoder on WebGPU the lengths are wrong again (0 of
18 the same, median 0.57), with only the F0 predictor or only the decoder they are right (18 of 18). The encoder
predicts the durations, which come out shorter on WebGPU; why (which operator, fp16 weights or not) was not
investigated. The envelope check is a sanity check, not a listening test; `webgpu-dec` has not been listened to.

## Findings

- **Loading is about 1.5 to 2.3 s on this machine**, of which creating the three ONNX sessions is a steady 1.0 s and
  the warm-up synthesis 0.95 s (1 thread), 0.37 s (4 threads) or 0.15 to 0.26 s (decoder on WebGPU). The download is
  loopback here (0.2 to 0.3 s for 186 MB); over a real network the cold load is dominated by the 186 MB transferred
  (163 MB of models, 22 MB of onnxruntime's WASM, 0.5 MB voice): about 15 s at 100 Mbit/s, 30 s at 50 Mbit/s
  (computed from the size, not measured).
- **The HTTP cache does not keep the 107 MB decoder.** In the warm and restart pages the encoder, F0 predictor, voice
  and WASM come from the cache (`transferSize` 0, or 300 bytes for a revalidation), but the decoder is downloaded in
  full again every time (107 MB transferred). This is consistent with Chromium's disk cache refusing entries above a
  fraction of its size; it was observed with `serve.py` (no `Cache-Control` on `.onnx`, so heuristic freshness) and
  was not checked against the Hugging Face CDN's headers that `misread.html` uses. Keeping the files in the Cache
  Storage API (`wasm-4-cs`) removes it: 0 bytes transferred warm and after a restart, and 0.1 s to read the 163 MB.
  Storing costs 0.4 s more on the cold load here.
- **Time to first audio** for a 2-second sentence, from opening the page: 5.5 s (1 thread), 2.7 to 2.8 s (4 threads),
  1.65 to 1.86 s (decoder on WebGPU), plus the download over a real network. Warm and cold differ little here
  because the download is loopback; the warm-up and session creation are paid on every page load, cached or not.
- **Real-time factor**: 1.6 with 1 thread (slower than real time), 0.54 with 4 threads, 0.06 to 0.07 with the decoder
  on WebGPU (encoder and F0 predictor still on WASM). The RTF does not depend on the length (sentences and paragraphs
  agree) because the engine runs each section in one pass.
- **Memory**: the renderer reaches about 1.7 GB RSS when the engine is ready and peaks at 1.8 to 1.9 GB during
  synthesis, in every condition, so it is the loading (the WASM heap with the three sessions, the downloaded bytes
  and onnxruntime's arena), not the length of the audio, that sets it. All the browser's processes together peak at
  2.1 to 2.3 GB; with WebGPU the GPU process adds about 200 MB over the 100 MB it has anyway. That is fine on this
  96 GB machine and likely too much for many phones.

## Limits

- One machine (an M2 Max laptop with 96 GB), one browser (Playwright's Chromium 130, headless), one OS. Not measured:
  other CPUs and GPUs, phones and tablets, Safari and Firefox, headed Chrome, a current Chrome release, and memory
  pressure. Headless Chromium may schedule threads and the GPU differently from a visible tab.
- The models come from loopback, so the cold load does not include a real network; the transferred bytes are given
  so the network time can be estimated, and the HTTP caching behaviour was seen only with `serve.py`'s headers.
- RSS is `ps` RSS sampled every 100 ms (macOS counts shared pages in it; a short peak between samples can be missed).
  The RSS "at ready" is the peak so far when the page reported ready.
- The sentences are short Japanese sentences (the hard set) and joins of them, one voice (`jf_alpha`), the `w16`
  models only (not fp32 or i8), WASM with 1 and 4 threads only (not 8 or 12).
- WebGPU with all three parts gives wrong durations; the per-part result rests on one probe run plus the 3 runs of
  `webgpu-dec`.
- The time to first audio counts the warm-up synthesis that `misread.html` does before it enables its buttons; the
  engine is not streaming, so a longer first sentence moves the first audio by its synthesis time.
