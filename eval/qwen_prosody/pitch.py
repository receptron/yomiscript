"""Japanese pitch values predicted from the text (D33): nucleus.py's LSTM over the same inputs, with three outputs per
mora, added to the three values the dictionary's nuclei give (the frozen pitch model of work/fit.json), trained on
the distance to Qwen's pitch itself (abs.mjs's: root mean square, each sentence centred). The test half is the odd JSUT
ids, never seen; the even ids and the Wikipedia sentences are split 90 / 10 for training and for choosing the epoch.

usage: ../prosody_ref/.venv/bin/python pitch.py   (after pitch_rows.mjs)
       -> work/pitch.pt, work/pitch_test.json (the values of the test half, for pitch_eval.mjs), results/pitch.json,
       work/pitch_model/ (what @yomiscript/ja-accent loads: pitch.json.gz, pitch.bin.gz)
"""

import copy
import gzip
import json
import random
from pathlib import Path

import nucleus as nuc
import numpy as np
import torch
from torch import nn

HERE = Path(__file__).resolve().parent
SEED, EPOCHS, BATCH, LR, GRAD = 0, 40, 32, 0.002, 5


def load():
    rows = json.loads((HERE / "work/pitch_rows.json").read_text())
    train = [s for s in rows if not s["test"]]
    random.Random(SEED).shuffle(train)
    n = len(train) // 10
    dev, train = train[:n], train[n:]
    V = nuc.vocabs(train)
    for s in rows:
        s["encoded"] = nuc.encode(s, V)
    return train, dev, [s for s in rows if s["test"]], V


def forward(model, batch):
    rows = nn.utils.rnn.pad_sequence([s["encoded"][0] for s in batch], batch_first=True)
    chars = nn.utils.rnn.pad_sequence([s["encoded"][1] for s in batch], batch_first=True)
    return model(rows, chars, None, torch.tensor([len(s["morae"]) for s in batch]))


def error(out, s):
    """the squared distance of the sentence's values (the prediction on top of the marks') to Qwen's"""
    mask = [i for i, (t, b) in enumerate(zip(s["target"], s["baseline"], strict=True)) if t is not None and b is not None]
    target = torch.tensor([s["target"][i] for i in mask])
    pred = out[mask] + torch.tensor([s["baseline"][i] for i in mask])
    return ((pred - pred.mean()) - (target - target.mean())).square().mean()


def outputs(model, rows):
    model.eval()
    with torch.no_grad():
        return [forward(model, [s])[0] for s in rows]


def mean_distance(model, rows):
    return float(np.mean([float(error(o, s).sqrt()) for o, s in zip(outputs(model, rows), rows, strict=True)]))


def fit(train, dev, V):
    random.seed(SEED)
    torch.manual_seed(SEED)
    model = nuc.Tagger(V)
    model.out = nn.Sequential(nn.Dropout(0.3), nn.Linear(256, 3))
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    best, state, at = float("inf"), None, 0
    for epoch in range(EPOCHS):
        model.train()
        random.shuffle(train)
        for i in range(0, len(train), BATCH):
            batch = train[i : i + BATCH]
            opt.zero_grad()
            out = forward(model, batch)
            torch.stack([error(o[: len(s["morae"])], s).clamp_min(1e-12).sqrt() for o, s in zip(out, batch, strict=True)]).mean().backward()
            nn.utils.clip_grad_norm_(model.parameters(), GRAD)
            opt.step()
        d = mean_distance(model, dev)
        print(f"epoch {epoch + 1}: dev {d:.4f}", flush=True)
        if d < best:
            best, state, at = d, copy.deepcopy(model.state_dict()), epoch + 1
    model.load_state_dict(state)
    torch.save(state, HERE / "work/pitch.pt")
    return model, best, at


def export(model, V):
    """the files @yomiscript/ja-accent loads (PITCH_FILES)"""
    out = HERE / "work/pitch_model"
    out.mkdir(exist_ok=True)
    state = {k: v.numpy().astype("<f4") for k, v in model.state_dict().items()}
    head = {
        "vocab": {k: v.ids for k, v in V.items()},
        "clip": nuc.CLIP,
        "contour": json.loads((HERE / "work/fit.json").read_text()),
        "tensors": [[k, list(v.shape)] for k, v in state.items()],
    }
    (out / "pitch.json.gz").write_bytes(gzip.compress(json.dumps(head, ensure_ascii=False).encode(), mtime=0))
    (out / "pitch.bin.gz").write_bytes(gzip.compress(b"".join(v.tobytes() for v in state.values()), mtime=0))


def main():
    torch.set_num_threads(4)
    train, dev, test, V = load()
    model, best, at = fit(train, dev, V)
    values = {s["name"]: (o.numpy() + np.array(s["baseline"])).tolist() for o, s in zip(outputs(model, test), test, strict=True)}
    (HERE / "work/pitch_test.json").write_text(json.dumps(values))
    export(model, V)
    report = {
        "train_sentences": len(train),
        "dev_sentences": len(dev),
        "test_sentences": len(test),
        "parameters": sum(p.numel() for p in model.parameters()),
        "epoch": at,
        "dev_distance": round(best, 4),
        "test_distance": round(mean_distance(model, test), 4),
    }
    (HERE / "results/pitch.json").write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
