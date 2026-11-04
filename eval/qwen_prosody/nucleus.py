"""Can the accent read from Qwen (abs.mjs) be predicted from the sentence alone?

A small neural model (a bidirectional LSTM over the morae of a sentence) is trained on the training half (the even
JSUT ids) to choose, for each accent phrase of D31 of two or more morae, the nucleus abs.mjs read from Qwen's pitch,
from what is known without Qwen: the mora, its word, where it stands in the word and the phrase, the boundary before
it, and D31's nucleus. Each phrase is one choice among its nuclei (0 flat, k: falls after the k-th mora, up to
n: after the last, which the next phrase hears): the model has two outputs at each mora, the score of nucleus k
is the first at the k-th mora, of flat the second at the last. The sentences of a batch are packed (pack_padded_sequence),
so the backward LSTM of a short sentence does not start in the padding.
On the test half (the odd ids, never seen in training) its nuclei are compared with abs's, beside D31's.

usage: ../prosody_ref/.venv/bin/python nucleus.py [tag] [more...]   (after nucleus_rows.mjs [tag])
       -> work/nucleus<tag>.pt, work/nucleus_pred<tag>.json, results/nucleus<tag>.json; each further tag's rows (as
       _wiki: the Wikipedia sentences, all of them training) are added to the training half, and the outputs are
       named <tag>+<more> (_phrased+_wiki); --qwen <layer> (7, 14, 21 or 28, or all) adds to each mora the vector
       qwen_hidden.py took for its word at that layer of Qwen's talker (outputs named …+qwen<layer>)
"""

import json
import random
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from torch import nn

HERE = Path(__file__).resolve().parent
SEED, EPOCHS, BATCH, CLIP = 0, 40, 32, 12
ARGS = sys.argv[1:]
QWEN = ARGS[ARGS.index("--qwen") + 1] if "--qwen" in ARGS else None
TAGS = [a for i, a in enumerate(ARGS) if a != "--qwen" and (i == 0 or ARGS[i - 1] != "--qwen")]
TAG = TAGS[0] if TAGS else ""
MORE = TAGS[1:]
OUT_TAG = "+".join([TAG, *MORE]) + (f"+qwen{QWEN}" if QWEN else "")
QWEN_LAYERS = (7, 14, 21, 28)  # qwen_hidden.py's LAYERS


class Vocab:
    def __init__(self, items, min_count=1):
        c = Counter(items)
        self.ids = {x: i + 1 for i, x in enumerate(sorted(x for x, n in c.items() if n >= min_count))}

    def __call__(self, x):
        return self.ids.get(x, 0)

    def __len__(self):
        return len(self.ids) + 1


def vocabs(train):
    morae = [m for s in train for m in s["morae"]]
    return {
        "ipa": Vocab(m["ipa"] for m in morae),
        "word": Vocab((m["word"] for m in morae), min_count=2),
        "char": Vocab(c for m in morae for c in m["word"]),
        "bound": Vocab(m["bound"] for m in morae),
    }


def encode(s, V):
    """the sentence as tensors: categorical ids per mora, the word's characters, and the phrases' choices"""
    rows, chars = [], []
    for m in s["morae"]:
        d31_here = m["d31nuc"] > 0 and m["ppos"] == m["d31nuc"] - 1
        d31_flat = m["d31nuc"] == 0
        last = m["ppos"] == m["plen"] - 1
        rows.append(
            [
                V["ipa"](m["ipa"]),
                V["word"](m["word"]),
                V["bound"](m["bound"]),
                min(m["ppos"], CLIP),
                min(m["plen"], CLIP),
                min(m["wpos"], CLIP),
                min(m["wlen"], CLIP),
                1 + d31_here + 2 * (d31_flat and last) + 3 * (m["d31nuc"] < 0),
            ]
        )
        w = m["word"]
        chars.append([V["char"](w[0]) if w else 0, V["char"](w[-1]) if w else 0])
    choices = [(p["start"], p["len"], p["abs"], p["d31"]) for p in s["phrases"] if p["abs"] is not None]
    return torch.tensor(rows), torch.tensor(chars), choices, qwen_vectors(s)


def qwen_vectors(s):
    """per mora, its word's vector from Qwen's talker (qwen_hidden.py), or None without --qwen"""
    if not QWEN:
        return None
    H = np.load(HERE / f"work/qwen_hidden/{s['name']}.npy").astype(np.float32)
    H = H.reshape(H.shape[0], -1) if QWEN == "all" else H[:, QWEN_LAYERS.index(int(QWEN))]
    return torch.from_numpy(H[[m["span"] for m in s["morae"]]])


class Tagger(nn.Module):
    def __init__(self, V, dim=64, hidden=128):
        super().__init__()
        self.emb = nn.ModuleList([nn.Embedding(len(V[k]), dim) for k in ("ipa", "word", "bound")])
        self.pos = nn.ModuleList([nn.Embedding(CLIP + 1, 16) for _ in range(4)])
        self.d31 = nn.Embedding(5, 16)
        self.char = nn.Embedding(len(V["char"]), dim)
        qdim = 0
        if QWEN:
            width = 2048 * (len(QWEN_LAYERS) if QWEN == "all" else 1)
            qdim = 128
            self.qwen = nn.Sequential(nn.LayerNorm(width), nn.Dropout(0.3), nn.Linear(width, qdim))
        self.rnn = nn.LSTM(3 * dim + 4 * 16 + 16 + 2 * dim + qdim, hidden, num_layers=2, bidirectional=True, batch_first=True, dropout=0.3)
        self.out = nn.Sequential(nn.Dropout(0.3), nn.Linear(2 * hidden, 2))

    def forward(self, rows, chars, qwen=None, lengths=None):
        x = [e(rows[..., i]) for i, e in enumerate(self.emb)]
        x += [e(rows[..., 3 + i]) for i, e in enumerate(self.pos)]
        x += [self.d31(rows[..., 7]), self.char(chars[..., 0]), self.char(chars[..., 1])]
        if qwen is not None:
            x.append(self.qwen(qwen))
        x = torch.cat(x, -1)
        if lengths is None:
            h, _ = self.rnn(x)
        else:
            h, _ = self.rnn(nn.utils.rnn.pack_padded_sequence(x, lengths, batch_first=True, enforce_sorted=False))
            h, _ = nn.utils.rnn.pad_packed_sequence(h, batch_first=True)
        return self.out(h)


def slot_scores(scores, start, n):
    """the scores of the nuclei 0..n of a phrase: flat at its last mora (the second output), k at its k-th (the first)"""
    return torch.cat([scores[start + n - 1, 1:2], scores[start : start + n, 0]])


def batch_loss(model, batch):
    rows = nn.utils.rnn.pad_sequence([b[0] for b in batch], batch_first=True)
    chars = nn.utils.rnn.pad_sequence([b[1] for b in batch], batch_first=True)
    qwen = nn.utils.rnn.pad_sequence([b[3] for b in batch], batch_first=True) if QWEN else None
    out = model(rows, chars, qwen, torch.tensor([len(b[0]) for b in batch]))
    losses = [nn.functional.cross_entropy(slot_scores(out[i], s, n)[None], torch.tensor([k])) for i, b in enumerate(batch) for s, n, k, _ in b[2]]
    return torch.stack(losses).mean()


def predict(model, data):
    model.eval()
    with torch.no_grad():
        return [[int(slot_scores(model(r[None], c[None], None if q is None else q[None])[0], s, n).argmax()) for s, n, _, _ in ch] for r, c, ch, q in data]


def accuracy(data, pred):
    pairs = [(p, k, d) for (_, _, ch, _), P in zip(data, pred, strict=True) for p, (_, _, k, d) in zip(P, ch, strict=True)]
    sent = [all(p == k for p, (_, _, k, _) in zip(P, ch, strict=True)) for (_, _, ch, _), P in zip(data, pred, strict=True)]
    return {
        "phrases": len(pairs),
        "model_agrees_with_abs": round(sum(p == k for p, k, _ in pairs) / len(pairs), 4),
        "d31_agrees_with_abs": round(sum(d == k for _, k, d in pairs) / len(pairs), 4),
        "sentences": len(sent),
        "model_whole_sentence_as_abs": round(sum(sent) / len(sent), 4),
        "d31_whole_sentence_as_abs": round(sum(all(d == k for _, _, k, d in ch) for _, _, ch, _ in data) / len(data), 4),
    }


def train(model, train_set, dev_set):
    opt = torch.optim.Adam(model.parameters(), lr=2e-3)
    best = (-1.0, None)
    for epoch in range(EPOCHS):
        model.train()
        random.shuffle(train_set)
        for i in range(0, len(train_set), BATCH):
            opt.zero_grad()
            batch_loss(model, train_set[i : i + BATCH]).backward()
            opt.step()
        acc = accuracy(dev_set, predict(model, dev_set))["model_agrees_with_abs"]
        print(f"epoch {epoch + 1}: dev {acc:.4f}", flush=True)
        if acc > best[0]:
            best = (acc, {k: v.clone() for k, v in model.state_dict().items()})
    model.load_state_dict(best[1])
    return best[0]


def main():
    random.seed(SEED)
    torch.manual_seed(SEED)
    rows = json.loads((HERE / f"work/nucleus_rows{TAG}.json").read_text())
    train_rows = [s for s in rows if not s["test"]]
    for tag in MORE:
        train_rows += [s for s in json.loads((HERE / f"work/nucleus_rows{tag}.json").read_text()) if not s["test"]]
    test_rows = [s for s in rows if s["test"]]
    V = vocabs(train_rows)
    data = [encode(s, V) for s in train_rows]
    random.shuffle(data)
    dev_set, train_set = data[: len(data) // 10], data[len(data) // 10 :]
    model = Tagger(V)
    dev = train(model, train_set, dev_set)
    test = [encode(s, V) for s in test_rows]
    pred = predict(model, test)
    result = {"dev_agrees_with_abs": round(dev, 4), "test": accuracy(test, pred), "train": accuracy(train_set, predict(model, train_set))}
    print(json.dumps(result, indent=1))
    torch.save(model.state_dict(), HERE / f"work/nucleus{OUT_TAG}.pt")
    (HERE / f"work/nucleus_pred{OUT_TAG}.json").write_text(json.dumps({s["name"]: P for s, P in zip(test_rows, pred, strict=True)}))
    (HERE / "results").mkdir(exist_ok=True)
    (HERE / f"results/nucleus{OUT_TAG}.json").write_text(json.dumps(result, indent=1) + "\n")


if __name__ == "__main__":
    main()
