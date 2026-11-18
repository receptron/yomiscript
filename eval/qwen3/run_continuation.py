"""Train CPU candidates; select only with the fixed development movement score."""

import json
import random
import time

import numpy as np
import torch
from experiment_models import ExperimentNet, Retrieval, batch, predictions
from generate_inflections import excluded
from memory import HERE
from value_metrics import distance, movement_distance
from values_data import load, target, training_split

START = time.time()


def metrics(rows, values):
    assert all(np.isfinite(v).all() for v in values), "Nonfinite model output"
    gold = [target(s["comparison"]["gold"]) for s in rows]
    measured = [target(s["target"]) for s in rows]
    a = distance(gold, values)["movement_distance"]
    q = distance(measured, values)["movement_distance"]
    return dict(annotation=a, measured_qwen=q, S=a + q / 4, sentences=len(rows))


def clean(row):
    return not any(excluded(m["word"]) for m in row["morae"])


def optimize(model, examples, optimizer, isolated=False):
    model.train()
    random.shuffle(examples)
    total = 0.0
    size = 512 if isolated else 48
    for start in range(0, len(examples), size):
        group = examples[start : start + size]
        x, y = batch(group)
        if isolated:
            keep = (torch.rand(len(group), 1) > 0.1).long()
            x[..., 0] *= keep
            if x.shape[-1] > 8:
                x[..., 8:] *= keep.unsqueeze(-1)
        if model.structured and not isolated:
            accent, shape = model.components(x)
            measured = torch.tensor([r.get("kind") == "qwen" for r in group])[:, None, None]
            pred = torch.where(measured, accent.detach() + shape, accent)
        else:
            pred = model(x, isolated)
        weights = torch.tensor([r.get("weight", 1.0) for r in group])
        loss = (movement_distance(pred, y) * weights).mean()
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5)
        optimizer.step()
        total += loss.item() * len(group)
    return total / len(examples)


def save(model, vocab, name, record, attention, structured):
    state = {k: v.detach().cpu() for k, v in model.state_dict().items()}
    assert all(v.dtype == torch.float32 for v in state.values())
    torch.save(dict(state=state, vocab=vocab, attention=attention, structured=structured, selection=record), HERE / f"work/{name}.pt")


def synthetic(encoder, retrieval, limit=60000):
    path = HERE / "work/inflection_values.jsonl"
    reservoir = []
    rng = random.Random(91)
    with path.open() as source:
        for i, line in enumerate(source):
            if i < limit:
                reservoir.append(line)
            else:
                index = rng.randrange(i + 1)
                if index < limit:
                    reservoir[index] = line
    rows = []
    for line in reservoir:
        row = encoder.row(json.loads(line))
        row["y"] = np.asarray(row["y"], dtype=np.float32)
        row["kind"] = "dict"
        row["weight"] = 0.5
        rows.append(retrieval.row(row))
    return rows


def pretrain(vocab, words, encoder):
    path = HERE / "work/continuation_pretrain.pt"
    model = ExperimentNet({k: len(v) for k, v in vocab.items()})
    if path.exists():
        model.load_state_dict(torch.load(path, weights_only=True))
        return model.state_dict()
    data = [encoder.word_row(r) for r in words if not excluded(r["s"])]
    optimizer = torch.optim.Adam(model.parameters(), lr=0.003)
    for epoch in range(16):
        loss = optimize(model, data, optimizer, True)
        print(json.dumps(dict(stage="pretrain", epoch=epoch + 1, loss=loss, seconds=time.time() - START)), flush=True)
    torch.save(model.state_dict(), path)
    return model.state_dict()


def train_candidate(config, vocab, initial, fit, dev, synth):
    name, attention, structured = config
    model = ExperimentNet({k: len(v) for k, v in vocab.items()}, attention, structured)
    model.load_state_dict(initial, strict=False)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.0005)
    examples = []
    for row in fit:
        for kind, y in row["teachers"]:
            weight = {"gold": 1.0, "dict": 0.3, "qwen": 0.25}[kind]
            examples.extend([dict(row, y=y, kind=kind, weight=weight)] * (4 if kind == "gold" else 1))
    best, history = float("inf"), []
    for epoch in range(18):
        if epoch == 10:
            for group in optimizer.param_groups:
                group["lr"] = 0.00015
        sample = random.sample(synth, min(18000, len(synth))) if synth else []
        loss = optimize(model, examples + sample, optimizer)
        score = metrics(dev, predictions(model, dev))
        record = dict(name=name, epoch=epoch + 1, loss=loss, dev=score, seconds=time.time() - START)
        history.append(record)
        print(json.dumps(record), flush=True)
        if score["S"] < best:
            best = score["S"]
            save(model, vocab, name, record, attention, structured)
        (HERE / f"work/{name}_history.json").write_text(json.dumps(history, indent=2))
    return torch.load(HERE / f"work/{name}.pt", weights_only=False)["state"]


def main():
    torch.set_num_threads(6)
    torch.manual_seed(71)
    random.seed(71)
    rows, words, vocab, encoder, _ = load()
    fit, dev = training_split(rows)
    fit = [r for r in fit if clean(r)]
    dev = [r for r in dev if r.get("target") and any(k == "qwen" for k, _ in r["teachers"])]
    initial = pretrain(vocab, words, encoder)
    retrieval = Retrieval(encoder)
    for row in fit + dev:
        retrieval.row(row)
    baselines = {kind: metrics(dev, [target(r["comparison"][kind]) for r in dev]) for kind in ["dict"]}
    audit = dict(
        fit=len(fit),
        dev=len(dev),
        word_teachers=sum(not excluded(r["s"]) for r in words),
        baselines=baselines,
        max_retrieval_entries=max(r["x"].shape[1] - 8 for r in fit + dev),
        odd_ids_used=0,
    )
    (HERE / "work/continuation_audit.json").write_text(json.dumps(audit, indent=2))
    print(json.dumps(audit), flush=True)
    train_candidate(("qwen4", False, False), vocab, initial, fit, dev, [])
    synth = synthetic(encoder, retrieval)
    print("Synthetic reservoir", len(synth), flush=True)
    train_candidate(("qwen5", False, False), vocab, initial, fit, dev, synth)
    train_candidate(("qwen6", True, False), vocab, initial, fit, dev, synth)
    train_candidate(("qwen7", True, True), vocab, initial, fit, dev, synth)
    (HERE / "work/continuation_complete.json").write_text(json.dumps(dict(seconds=time.time() - START)))


if __name__ == "__main__":
    main()
