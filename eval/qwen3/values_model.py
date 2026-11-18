"""Values-only word memory and sentence network; no accent labels at inference."""

import torch
from torch import nn
from value_metrics import movement_distance


class ValuesNet(nn.Module):
    def __init__(self, sizes, word_prior=False):
        super().__init__()
        self.word_prior = word_prior
        self.memory = nn.Embedding(sizes["keys"] + 1, 32, padding_idx=0)
        self.char = nn.Embedding(sizes["chars"] + 2, 16, padding_idx=0)
        self.mora = nn.Embedding(sizes["ipa"] + 2, 24, padding_idx=0)
        self.bound = nn.Embedding(sizes["bounds"] + 2, 8, padding_idx=0)
        self.pos = nn.Embedding(65, 8)
        self.word = nn.Sequential(nn.Linear(88, 96), nn.Tanh(), nn.Linear(96, 64), nn.Tanh())
        self.word_values = nn.Linear(64, 3)
        self.rnn = nn.LSTM(104, 128, num_layers=2, bidirectional=True, batch_first=True, dropout=0.2)
        self.values = nn.Linear(256, 3)

    def word_state(self, x):
        mem = self.memory(x[..., 0])
        chars = (self.char(x[..., 1]) + self.char(x[..., 2])) / 2
        return self.word(torch.cat([mem, chars, self.mora(x[..., 3]), self.pos(x[..., 5]), self.pos(x[..., 6])], -1))

    def forward(self, x, isolated=False):
        w = self.word_state(x)
        if isolated:
            return self.word_values(w)
        h = torch.cat([w, self.mora(x[..., 3]), self.bound(x[..., 4]), self.pos(x[..., 7])], -1)
        lengths = (x[..., 3] != 0).sum(1).cpu()
        packed = nn.utils.rnn.pack_padded_sequence(h, lengths, batch_first=True, enforce_sorted=False)
        encoded, _ = nn.utils.rnn.pad_packed_sequence(self.rnn(packed)[0], batch_first=True)
        values = self.values(encoded)
        return values + self.word_values(w) if self.word_prior else values


def tensor_batch(rows):
    n = max(len(r["x"]) for r in rows)
    x = torch.zeros(len(rows), n, 8, dtype=torch.long)
    y = torch.full((len(rows), n, 3), float("nan"))
    for i, r in enumerate(rows):
        x[i, : len(r["x"])] = torch.as_tensor(r["x"])
        if "y" in r:
            y[i, : len(r["y"])] = torch.as_tensor(r["y"])
    return x, y


def value_loss(pred, target):
    return movement_distance(pred, target)


def predict(model, rows):
    model.eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(rows), 64):
            batch = rows[i : i + 64]
            values = model(tensor_batch(batch)[0]).numpy()
            out.extend(v[: len(r["x"])].copy() for r, v in zip(batch, values, strict=True))
    return out
