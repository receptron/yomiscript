"""Offline fixed-split pitch experiments, by Codex; more_train.py uses its training run. Writes only to work/."""

import copy
import gzip
import json
import random
import sys
import time
from pathlib import Path

sys.argv = sys.argv[:1]  # nucleus has legacy command-line globals
import nucleus as nuc
import numpy as np
import torch
from torch import nn

HERE = Path(__file__).resolve().parent
OUT = HERE / "work/codex_night"
REPORT = HERE / "CODEX_PITCH_RESULTS.md"


def context(s):
    n = len(s["morae"])
    phrases = s["phrases"]
    result = []
    for g, p in enumerate(phrases):
        for j in range(p["len"]):
            i = p["start"] + j
            result.append(
                [
                    i / max(n - 1, 1),
                    (n - i - 1) / n,
                    g / max(len(phrases) - 1, 1),
                    j / max(p["len"] - 1, 1),
                    (p["len"] - j - 1) / n,
                    p["len"] / n,
                    float(j == 0),
                    float(j == p["len"] - 1),
                ]
            )
    return torch.tensor(result)


class Model(nuc.Tagger):
    def __init__(self, vocab, config):
        h = config.get("hidden", 128)
        super().__init__(vocab, hidden=h)
        self.config = config
        width = 400 + (8 if config.get("context") else 0) + (64 if config.get("phrase") else 0)
        if config.get("phrase"):
            self.phrase_rnn = nn.LSTM(400, 32, bidirectional=True, batch_first=True)
        self.rnn = nn.LSTM(width, h, num_layers=2, bidirectional=True, batch_first=True, dropout=config.get("dropout", 0.3))
        self.out = nn.Sequential(nn.Dropout(config.get("dropout", 0.3)), nn.Linear(2 * h, 3))

    def forward(self, rows, chars, extra, lengths):
        x = [e(rows[..., i]) for i, e in enumerate(self.emb)]
        x[1] = nn.functional.dropout(x[1], p=self.config.get("word_dropout", 0.0), training=self.training)
        x += [e(rows[..., 3 + i]) for i, e in enumerate(self.pos)]
        x += [self.d31(rows[..., 7]), self.char(chars[..., 0]), self.char(chars[..., 1])]
        if self.config.get("chars"):
            embedded = self.char(extra[1])
            mask = extra[2].unsqueeze(-1)
            x[-1] = (embedded * mask).sum(-2) / mask.sum(-2).clamp_min(1)
        if self.config.get("phrase"):
            x.append(self.phrase_context(torch.cat(x, -1), rows, lengths))
        if self.config.get("context"):
            x.append(extra[0])
        packed = nn.utils.rnn.pack_padded_sequence(torch.cat(x, -1), lengths, batch_first=True, enforce_sorted=False)
        h, _ = self.rnn(packed)
        h, _ = nn.utils.rnn.pad_packed_sequence(h, batch_first=True)
        return self.out(h)

    def phrase_context(self, x, rows, lengths):
        sequences, indices = [], []
        for b, length in enumerate(lengths.tolist()):
            starts = [i for i in range(length) if rows[b, i, 3] == 0]
            ends = starts[1:] + [length]
            sequences.append(torch.stack([x[b, start:end].mean(0) for start, end in zip(starts, ends, strict=True)]))
            indices.append(torch.tensor([g for g, (start, end) in enumerate(zip(starts, ends, strict=True)) for _ in range(end - start)]))
        packed = nn.utils.rnn.pack_sequence(sequences, enforce_sorted=False)
        encoded, _ = self.phrase_rnn(packed)
        encoded, _ = nn.utils.rnn.pad_packed_sequence(encoded, batch_first=True)
        return nn.utils.rnn.pad_sequence([encoded[b, idx] for b, idx in enumerate(indices)], batch_first=True)


def prepare(rows, vocab):
    for s in rows:
        s["encoded"] = nuc.encode(s, vocab)
        s["ctx"] = context(s)
        words = [[vocab["char"](c) for c in m["word"]] or [0] for m in s["morae"]]
        width = max(map(len, words))
        s["allchars"] = torch.tensor([w + [0] * (width - len(w)) for w in words])
        s["charmask"] = torch.tensor([[1.0] * len(w) + [0.0] * (width - len(w)) for w in words])
        mask = [i for i, (t, b) in enumerate(zip(s["target"], s["baseline"], strict=True)) if t is not None and b is not None]
        s["mask"] = torch.tensor(mask)
        s["base"] = torch.tensor([s["baseline"][i] for i in mask])
        s["truth"] = torch.tensor([s["target"][i] for i in mask])
        s["groups"] = [[k for k, i in enumerate(mask) if p["start"] <= i < p["start"] + p["len"]] for p in s["phrases"]]


def forward(model, batch):
    def pad(values):
        return nn.utils.rnn.pad_sequence(values, batch_first=True)

    width = max(s["allchars"].shape[1] for s in batch)
    chars = [nn.functional.pad(s["allchars"], (0, width - s["allchars"].shape[1])) for s in batch]
    masks = [nn.functional.pad(s["charmask"], (0, width - s["charmask"].shape[1])) for s in batch]
    extra = (pad([s["ctx"] for s in batch]), pad(chars), pad(masks))
    return model(pad([s["encoded"][0] for s in batch]), pad([s["encoded"][1] for s in batch]), extra, torch.tensor([len(s["morae"]) for s in batch]))


def loss(out, s, kind="rmse"):
    pred = out[s["mask"]] + s["base"]
    target = s["truth"]
    residual = (pred - pred.mean()) - (target - target.mean())
    base = residual.square().mean().clamp_min(1e-12).sqrt()
    if kind == "shape":
        terms = [(residual[g] - residual[g].mean()).square().mean() for g in s["groups"] if g]
        return base + 0.25 * torch.stack(terms).mean().clamp_min(1e-12).sqrt()
    if kind == "delta":
        return base + 0.2 * (residual.mean(-1).diff().square().mean().clamp_min(1e-12).sqrt())
    if kind == "robust":
        return nn.functional.smooth_l1_loss(residual, torch.zeros_like(residual), beta=1.5)
    if kind == "window":
        local = residual.square().mean(-1)
        return base + 0.2 * local.unfold(0, min(5, len(local)), 1).mean(-1).max().clamp_min(1e-12).sqrt()
    return base


def evaluate(model, rows):
    model.eval()
    errors = []
    with torch.no_grad():
        for i in range(0, len(rows), 32):
            batch = rows[i : i + 32]
            errors.extend(float(loss(o, s)) for o, s in zip(forward(model, batch), batch, strict=True))
    return float(np.mean(errors))


def export(model, vocab, folder):
    folder.mkdir(exist_ok=True)
    state = {k: v.detach().numpy().astype("<f4") for k, v in model.state_dict().items()}
    meta = {
        "vocab": {k: v.ids for k, v in vocab.items()},
        "clip": nuc.CLIP,
        "contour": json.loads((HERE / "work/fit.json").read_text()),
        "codex": model.config,
        "tensors": [[k, list(v.shape)] for k, v in state.items()],
    }
    (folder / "pitch.json.gz").write_bytes(gzip.compress(json.dumps(meta, ensure_ascii=False).encode(), mtime=0))
    (folder / "pitch.bin.gz").write_bytes(gzip.compress(b"".join(v.tobytes() for v in state.values()), mtime=0))


def evaluation_state(model, average, decay):
    raw = copy.deepcopy(model.state_dict())
    if not decay:
        return raw, raw
    for k, value in raw.items():
        average[k].mul_(decay).add_(value, alpha=1 - decay)
    model.load_state_dict(average)
    return raw, average


def run(pool, dev, config, seed, fraction):
    tag = f"{config['name']}_s{seed}_f{fraction}"
    folder = OUT / tag
    folder.mkdir(exist_ok=True)
    if (folder / "result.json").exists():
        return
    train = pool[: int(len(pool) * fraction)]
    vocab = nuc.vocabs(train)
    prepare(train + dev, vocab)
    random.seed(seed)
    torch.manual_seed(seed)
    model = Model(vocab, config)
    opt = torch.optim.Adam(model.parameters(), lr=0.002, weight_decay=config.get("weight_decay", 0.0))
    best, at, state = float("inf"), 0, None
    start = time.monotonic()
    history = []
    average = copy.deepcopy(model.state_dict())
    for epoch in range(40):
        model.train()
        order = list(train)
        random.shuffle(order)
        for i in range(0, len(order), 32):
            batch = order[i : i + 32]
            opt.zero_grad()
            outputs = forward(model, batch)
            torch.stack([loss(o, s, config.get("loss", "rmse")) for o, s in zip(outputs, batch, strict=True)]).mean().backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5)
            opt.step()
        raw, average = evaluation_state(model, average, config.get("ema_decay", 0.0))
        score = evaluate(model, dev)
        history.append(score)
        print(f"{tag} epoch {epoch + 1}: {score:.5f}", flush=True)
        if score < best:
            best, at, state = score, epoch + 1, copy.deepcopy(model.state_dict())
        model.load_state_dict(raw)
    model.load_state_dict(state)
    export(model, vocab, folder)
    torch.save(state, folder / "model.pt")
    result = {
        "tag": tag,
        "config": config,
        "seed": seed,
        "fraction": fraction,
        "train_n": len(train),
        "dev_n": len(dev),
        "dev": best,
        "epoch": at,
        "train": evaluate(model, train),
        "seconds": time.monotonic() - start,
        "parameters": sum(p.numel() for p in model.parameters()),
        "bytes_gzip": sum((folder / f).stat().st_size for f in ("pitch.json.gz", "pitch.bin.gz")),
        "history": history,
    }
    (folder / "result.json").write_text(json.dumps(result, indent=2))
    with REPORT.open("a") as f:
        f.write(f"\n| {tag} | {len(train)} | {best:.5f} | {result['train']:.5f} | {at} | {result['bytes_gzip']} | {result['seconds']:.0f} |\n")


def main():
    torch.set_num_threads(4)
    OUT.mkdir(exist_ok=True)
    rows = json.loads((HERE / "work/pitch_rows.json").read_text())
    pool = [s for s in rows if not s["test"]]
    random.Random(0).shuffle(pool)
    dev, pool = pool[: len(pool) // 10], pool[len(pool) // 10 :]
    (OUT / "split.json").write_text(json.dumps({"dev": [s["name"] for s in dev], "train": [s["name"] for s in pool]}, indent=1))
    tests = sorted(s["name"] for s in rows if s["test"])
    (OUT / "listening_extra.json").write_text(json.dumps(random.Random(20261103).sample(tests, 12)))
    configs = [
        {"name": "baseline"},
        {"name": "context", "context": True},
        {"name": "chars", "chars": True},
        {"name": "wide", "hidden": 160},
        *[{"name": k, "loss": k} for k in ("shape", "delta", "robust", "window")],
        {"name": "context_chars", "context": True, "chars": True},
    ]
    for fraction in (0.25, 0.5, 1.0):
        for seed in (0, 1, 2):
            run(pool, dev, configs[0], seed, fraction)
    for config in configs[1:]:
        for seed in (0, 1, 2):
            run(pool, dev, config, seed, 1.0)


if __name__ == "__main__":
    main()
