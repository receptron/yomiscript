"""Choose an output movement gain using development teachers only."""

import json

import numpy as np
import torch
from experiment_models import Retrieval, predictions, restore
from memory import HERE
from run_continuation import metrics
from values_data import load, training_split


def main():
    torch.set_num_threads(6)
    saved = [torch.load(HERE / f"work/qwen{i}.pt", weights_only=False) for i in range(4, 8)]
    source = min(saved, key=lambda s: s["selection"]["dev"]["S"])
    rows, _, _, encoder, _ = load()
    _, dev = training_split(rows)
    dev = [r for r in dev if r.get("target") and any(k == "qwen" for k, _ in r["teachers"])]
    retrieval = Retrieval(encoder)
    for row in dev:
        retrieval.row(row)
    values = predictions(restore(source), dev)
    history = []
    for gain in np.linspace(0.6, 1.4, 17):
        score = metrics(dev, [v * np.float32(gain) for v in values])
        history.append(dict(gain=float(gain), dev=score))
    best = min(history, key=lambda r: r["dev"]["S"])
    source["calibration_source"] = source["selection"]["name"]
    source["gain"] = best["gain"]
    source["selection"] = dict(name="qwen8", epoch=0, **best)
    torch.save(source, HERE / "work/qwen8.pt")
    (HERE / "work/qwen8_history.json").write_text(json.dumps(history, indent=2))
    print(json.dumps(best), flush=True)


if __name__ == "__main__":
    main()
