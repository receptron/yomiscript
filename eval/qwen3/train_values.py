"""Train a single values output, select every setting on development sentences only."""

import json
import random
import time

import torch
from memory import HERE
from value_metrics import distance
from values_data import load, training_split
from values_model import ValuesNet, predict, tensor_batch, value_loss

DIRECT_EPOCHS = 12
TEACHER_SETTINGS = [{"gold": 1.0, "dict": 0.25, "qwen": 0.35}, {"gold": 1.0, "dict": 0.1, "qwen": 0.15}]


def optimize(model, data, optimizer, isolated=False):
    model.train()
    random.shuffle(data)
    total = 0.0
    batch_size = 512 if isolated else 48
    for i in range(0, len(data), batch_size):
        batch = data[i : i + batch_size]
        x, y = tensor_batch(batch)
        if isolated:
            x[..., 0] *= (torch.rand(x.shape[:1] + (1,)) > 0.1).long()
        pred = model(x, isolated)
        weights = torch.tensor([r.get("weight", 1.0) for r in batch])
        loss = (value_loss(pred, y) * weights).mean()
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5)
        optimizer.step()
        total += loss.item() * len(batch)
    return total / len(data)


def select(model, dev):
    values = predict(model, dev)
    return distance([s["comparison"]["gold"] for s in dev], values)


def train_sentences(model, rows, dev, vocab):
    best = float("inf")
    log = []
    start = time.time()
    for phase, weights in enumerate(TEACHER_SETTINGS):
        if phase:
            model.load_state_dict(torch.load(HERE / "work/qwen3_movement.pt", weights_only=False)["state"])
        optimizer = torch.optim.Adam(model.parameters(), lr=0.001 if phase == 0 else 0.0003)
        examples = [dict(s, y=y, weight=weights[k]) for s in rows for k, y in s["teachers"]]
        for epoch in range(DIRECT_EPOCHS):
            loss = optimize(model, examples, optimizer)
            metrics = select(model, dev)
            rank = metrics["movement_distance"]
            record = {"phase": phase, "epoch": epoch + 1, "loss": loss, "dev": metrics, "seconds": time.time() - start}
            log.append(record)
            print(json.dumps(record), flush=True)
            if rank < best:
                best = rank
                torch.save(
                    {"state": model.state_dict(), "vocab": vocab, "selection": record, "teacher_weights": weights},
                    HERE / "work/qwen3_movement.pt",
                )
            (HERE / "work/values_movement_history.json").write_text(json.dumps(log, indent=1))


def main():
    torch.set_num_threads(6)
    torch.manual_seed(19)
    random.seed(19)
    rows, words, vocab, encoder, checks = load()
    del checks
    (HERE / "work/qwen3_vocab.json").write_text(json.dumps(vocab, ensure_ascii=False, separators=(",", ":")))
    model = ValuesNet({k: len(v) for k, v in vocab.items()})
    fit, dev = training_split(rows)
    print("CPU", len(fit), "fit", len(dev), "annotated dev", len(words), "word teachers", flush=True)
    pretrain_path = HERE / "work/values_movement_pretrain.pt"
    if pretrain_path.exists():
        model.load_state_dict(torch.load(pretrain_path, weights_only=True))
    else:
        data = [encoder.word_row(r) for r in words]
        optimizer = torch.optim.Adam(model.parameters(), lr=0.003)
        for epoch in range(16):
            start = time.time()
            loss = optimize(model, data, optimizer, True)
            print("word", epoch + 1, loss, time.time() - start, flush=True)
        torch.save(model.state_dict(), pretrain_path)
        del data
    train_sentences(model, fit, dev, vocab)


if __name__ == "__main__":
    main()
