# tts/kokoro_ft — Fine-tuning Kokoro on accent marks (experiment, discontinued)

Experimental code that assigns YomiScript's accent marks `[ ] =` to unused Kokoro vocabulary entries (7, 8, 26, length 0) and fine-tunes with the decoder frozen. Since accents can already be specified with the F0 override in `tts/kokoro_ys`, this experiment was discontinued. It is kept as a record.

- `ftlib.py` / `prep.py` / `train.py`: the training code (Japanese aligns JSUT to Kokoro; fr/zh/en use distillation)
- `ys_ja.py`: Japanese YomiScript → phonemes (refers to `../kokoro_ys`)
- `build_distill.py`: builds the distillation data (the output `distill_ph.json` is not included)
- `smoke.py`: small smoke test; `mac_worker.py`: for running on a Mac

Weights are fetched from `hexgrad/Kokoro-82M` (Apache-2.0) via `pip install kokoro torch`. Because of its license, do not include JSUT in distributed artifacts.
