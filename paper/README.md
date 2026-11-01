# Paper draft

"The LLM as the Front End: Context-Aware Pronunciation for Small Browser Text-to-Speech, with Japanese Homographs".
First draft, 2026-10-29. Every number comes from files in the repository:

- `eval/browser_tts/results/summary.md`, `asr_summary.md`, `README.md` (readings, text layer, cost, intelligibility)
- `eval/kokoro_parity/README.md` (the Kokoro Katarite reproduces the original)
- `eval/tts_readings/results/summary.md`, `README.md` (commercial TTS on the hard set, and the judge's check)
- `eval/author_reading/results/r1/summary.md`, `README.md` (the author against readers with and without the conversation)
- `eval/context_reading/results/r1/summary.md`, `README.md` (external text and chat answers with and without the context; 65 homographs)
- `eval/ipa_value/results/summary.md`, `README.md` (what kana cannot carry: accent on minimal pairs, English in Japanese)
- `eval/koriyama_g2p/results/summary.md`, `README.md` (the independent benchmark, frozen prompts)
- `eval/representation_isolated/results/summary.md`, `README.md` (the hard set in calls with no shared word; SSML per bunsetsu)
- `eval/koriyama_matched/results/summary.md`, `README.md` (post-hoc matched YomiScript prompt on the benchmark)
- `eval/representation/results/summary.md`, `README.md` (YomiScript, kana and SSML written by LLMs)
- `eval/browser_bench/results/summary.md`, `README.md` (the Kokoro Katarite in the browser: loading, speed, memory)
- `eval/llm_yomite/results/summary.md` (LLM pitch values)
- `models/yomi/README.md` (Yomi-0, measured with `models/yomi/mlx/evaluate.py` on the `tiny_aug` checkpoint, which is
  not in the repository) and `eval/RESULTS.md` (the pyopenjtalk baseline)

What is missing before submission: `TODO.md`. Unverified bibliography entries are marked `TODO verify` in
`references.bib`.

Build: `make` (LuaLaTeX via latexmk; see the Makefile for the fonts). It also compiles with XeTeX (tectonic) when the
`luatexja` lines are swapped for `fontspec` + `xeCJK`.

`interspeech/` is the conference version (4 pages + references, the Interspeech 2026 class `Interspeech.cls` and
`IEEEtran.bst`): `cd interspeech && tectonic -X compile main.tex`. Fonts: TeX Gyre Termes (tectonic has it), Charis SIL
(IPA, including U+A71B / U+A71C; install it from SIL) and Hiragino Mincho ProN (macOS; any Japanese font will do).
