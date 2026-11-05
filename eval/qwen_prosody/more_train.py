"""The pitch model on more sentences: the fixed dev and training sentences of Codex's experiment, plus the second
Wikipedia batch in training. Three seeds of one configuration; the test half is not read. EMA seed 0 is the published
qwen-2 (D35).

work/pitch_rows_all.json is work/pitch_rows.json with the rows of the second batch added (WIKI2_; `wiki_sentences.mjs 5000 2`
and the steps after it, in a separate checkout, as they use the same work/wiki).

usage: python more_train.py baseline|ema
"""

import json
import random
import sys

which = sys.argv[1]
import codex_pitch as ex  # noqa: E402
import torch  # noqa: E402

CONFIGS = {"baseline": {"name": "baseline"}, "ema": {"name": "ema", "ema_decay": 0.8}}
ex.OUT = ex.HERE / "work/more_data"
ex.REPORT = ex.OUT / "results.md"


def main():
    torch.set_num_threads(4)
    ex.OUT.mkdir(exist_ok=True)
    split = json.loads((ex.HERE / "results/pitch_split.json").read_text())
    rows = {s["name"]: s for s in json.loads((ex.HERE / "work/pitch_rows_all.json").read_text()) if not s["test"]}
    new = sorted(n for n in rows if n.startswith("WIKI2_"))
    random.Random(1).shuffle(new)
    pool = [rows[n] for n in split["train"] + new]
    dev = [rows[n] for n in split["dev"]]
    print(len(pool), "training,", len(dev), "dev", flush=True)
    for seed in (0, 1, 2):
        ex.run(pool, dev, CONFIGS[which], seed, 1.0)


if __name__ == "__main__":
    main()
