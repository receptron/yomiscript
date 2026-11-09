"""Fit a small bounded shape adapter while freezing the selected direct model."""

import json
import random
import time

import torch
from experiment_models import ExperimentNet, Retrieval, batch, predictions
from memory import HERE
from run_continuation import clean, metrics
from value_metrics import movement_distance
from values_data import load, training_split


def step(model, data, optimizer):
    model.eval()
    random.shuffle(data)
    total = 0.0
    for start in range(0, len(data), 48):
        group = data[start : start + 48]
        x, y = batch(group)
        weights = torch.tensor([r["weight"] for r in group])
        loss = (movement_distance(model(x), y) * weights).mean()
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 5)
        optimizer.step()
        total += loss.item() * len(group)
    return total / len(data)


def checkpoint(model, saved, record):
    saved["state"] = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
    saved["selection"] = record
    saved["structured"] = True
    saved["bounded_shape"] = True
    torch.save(saved, HERE / "work/qwen10.pt")


def main():
    torch.set_num_threads(6)
    torch.manual_seed(211)
    random.seed(211)
    choices = [torch.load(HERE / f"work/qwen{i}.pt", weights_only=False) for i in range(4, 7)]
    saved = min(choices, key=lambda s: s["selection"]["dev"]["S"])
    source = saved["selection"]["name"]
    model = ExperimentNet({k: len(v) for k, v in saved["vocab"].items()}, saved["attention"], True, True)
    model.load_state_dict(saved["state"], strict=False)
    for name, parameter in model.named_parameters():
        parameter.requires_grad_(name.startswith("shape_"))
    rows, _, _, encoder, _ = load()
    fit, dev = training_split(rows)
    fit = [r for r in fit if clean(r) and all(any(k == kind for k, _ in r["teachers"]) for kind in ["gold", "qwen"])]
    dev = [r for r in dev if r.get("target") and any(k == "qwen" for k, _ in r["teachers"])]
    retrieval = Retrieval(encoder)
    for row in fit + dev:
        retrieval.row(row)
    examples = [dict(r, y=y, weight=1.0 if k == "gold" else 0.25) for r in fit for k, y in r["teachers"] if k in ["gold", "qwen"]]
    optimizer = torch.optim.Adam([p for p in model.parameters() if p.requires_grad], lr=0.001)
    score = metrics(dev, predictions(model, dev))
    checkpoint(model, saved, dict(name="qwen10", source=source, epoch=0, dev=score))
    history, best, started = [], score["S"], time.time()
    for epoch in range(20):
        if epoch == 10:
            for group in optimizer.param_groups:
                group["lr"] = 0.0002
        loss = step(model, examples.copy(), optimizer)
        score = metrics(dev, predictions(model, dev))
        record = dict(name="qwen10", source=source, epoch=epoch + 1, dev=score, loss=loss, seconds=time.time() - started)
        history.append(record)
        print(json.dumps(record), flush=True)
        if score["S"] < best:
            best = score["S"]
            checkpoint(model, saved, record)
        (HERE / "work/qwen10_history.json").write_text(json.dumps(history, indent=2))


if __name__ == "__main__":
    main()
