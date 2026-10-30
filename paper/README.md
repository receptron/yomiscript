# Paper draft

"The Author Knows the Reading: LLM-Written Pronunciation for Small Browser Text-to-Speech, with Japanese Homographs".
First draft, 2026-10-29. Every number comes from files in the repository:

- `eval/browser_tts/results/summary.md`, `asr_summary.md`, `README.md` (readings, text layer, cost, intelligibility)
- `eval/kokoro_parity/README.md` (the Kokoro Katarite reproduces the original)
- `eval/llm_yomite/results/summary.md` (LLM pitch values), `models/yomi/mlx/ckpt/tiny_aug/eval.json` and
  `eval/RESULTS.md` (Yomi-0 and the pyopenjtalk baseline)

What is missing before submission: `TODO.md`. Unverified bibliography entries are marked `TODO verify` in
`references.bib`.

Build: `make` (LuaLaTeX via latexmk; see the Makefile for the fonts). LaTeX was not installed when the draft was
written, so it has not been compiled yet.
