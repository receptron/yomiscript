"""Refine the development winner on paired teachers with the fixed 1:1/4 balance."""

import argparse
import json
import random
import time

import torch
from experiment_models import Retrieval, predictions, restore
from memory import HERE
from run_continuation import clean, metrics, optimize
from values_data import load, training_split


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--annotation-only", action="store_true")
    args = parser.parse_args()
    name = "qwen11" if args.annotation_only else "qwen9"
    kinds = ["gold"] if args.annotation_only else ["gold", "qwen"]
    torch.set_num_threads(6)
    torch.manual_seed(113)
    random.seed(113)
    choices = [torch.load(HERE / f"work/qwen{i}.pt", weights_only=False) for i in range(4, 8)]
    saved = min(choices, key=lambda s: s["selection"]["dev"]["S"])
    source = saved["selection"]["name"]
    model = restore(saved)
    rows, _, _, encoder, _ = load()
    fit, dev = training_split(rows)
    fit = [r for r in fit if clean(r) and all(any(k == kind for k, _ in r["teachers"]) for kind in ["gold", "qwen"])]
    dev = [r for r in dev if r.get("target") and any(k == "qwen" for k, _ in r["teachers"])]
    retrieval = Retrieval(encoder)
    for row in fit + dev:
        retrieval.row(row)
    examples = [dict(r, y=y, kind=k, weight=1.0 if k == "gold" else 0.25) for r in fit for k, y in r["teachers"] if k in kinds]
    optimizer = torch.optim.Adam(model.parameters(), lr=0.0002)
    history, best = [], float("inf")
    started = time.time()
    for epoch in range(20):
        loss = optimize(model, examples.copy(), optimizer)
        score = metrics(dev, predictions(model, dev))
        record = dict(name=name, source=source, epoch=epoch + 1, dev=score, loss=loss, fit_sentences=len(fit), seconds=time.time() - started)
        history.append(record)
        print(json.dumps(record), flush=True)
        if score["S"] < best:
            best = score["S"]
            saved["state"] = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            saved["selection"] = record
            torch.save(saved, HERE / f"work/{name}.pt")
        (HERE / f"work/{name}_history.json").write_text(json.dumps(history, indent=2))


if __name__ == "__main__":
    main()
