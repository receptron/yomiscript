# eval/ — Evaluation sets and metrics (Issue #5, #6)

```
uv venv -p 3.11 .venv && uv pip install -p .venv -r eval/requirements.txt   # building pyopenjtalk requires cmake and a C++ compiler
.venv/bin/python eval/scripts/run_pyopenjtalk_baseline.py
```

- `data/jsut_basic5000_subset.jsonl`: 280 sentences from JSUT BASIC5000, with human-annotated readings, accent nuclei, accent phrase boundaries and pauses (CC-BY-SA 4.0; see `LICENSE_DATA.md`).
- `data/hard_set.tsv`: 70 handcrafted hard sentences (35 homographs, 12 acronyms, 12 numerals, 11 dates). **The references are provisional and need human review.**
- `scripts/metrics.py`: computes the following metrics.
  - Kana CER (strict, and with spelling-variant normalization)
  - Phrase boundary P/R/F1
  - Accent nucleus P/R/F1
  - Accent phrase exact-match rate
- `results/`: measured results as JSON, and error examples as TSV. The summary of results is in `RESULTS.md`.
