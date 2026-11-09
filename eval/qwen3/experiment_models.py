"""Float32 retrieval and structured-output candidates for the continuation."""

import numpy as np
import torch
from rows import words_of
from torch import nn
from values_model import ValuesNet


class ExperimentNet(ValuesNet):
    def __init__(self, sizes, attention=False, structured=False, bounded_shape=False):
        super().__init__(sizes)
        self.bounded_shape = bounded_shape
        self.gain = 1.0
        self.attention = attention
        self.structured = structured
        if attention:
            self.query = nn.Linear(32, 32)
            self.key = nn.Linear(32, 32, bias=False)
        if structured:
            self.shape_rnn = nn.GRU(40, 32, batch_first=True, bidirectional=True)
            self.shape_values = nn.Linear(64, 3)
            nn.init.zeros_(self.shape_values.weight)
            nn.init.zeros_(self.shape_values.bias)

    def word_state(self, x):
        if not self.attention:
            return super().word_state(x[..., :8])
        ids = x[..., 8:]
        mem = self.memory(ids)
        query = self.query(torch.cat([self.mora(x[..., 3]), self.pos(x[..., 5])], -1))
        scores = (self.key(mem) * query.unsqueeze(-2)).sum(-1) / (32**0.5)
        scores = scores.masked_fill(ids == 0, -1e4)
        weights = scores.softmax(-1) * (ids != 0)
        pooled = (weights.unsqueeze(-1) * mem).sum(-2)
        chars = (self.char(x[..., 1]) + self.char(x[..., 2])) / 2
        return self.word(torch.cat([pooled, chars, self.mora(x[..., 3]), self.pos(x[..., 5]), self.pos(x[..., 6])], -1))

    def components(self, x):
        accent = super().forward(x)
        h = torch.cat([self.mora(x[..., 3]), self.bound(x[..., 4]), self.pos(x[..., 7])], -1)
        lengths = (x[..., 3] != 0).sum(1).cpu()
        packed = nn.utils.rnn.pack_padded_sequence(h, lengths, batch_first=True, enforce_sorted=False)
        h, _ = nn.utils.rnn.pad_packed_sequence(self.shape_rnn(packed)[0], batch_first=True)
        shape = self.shape_values(h)
        return accent, 0.25 * (shape.tanh() if self.bounded_shape else shape)

    def forward(self, x, isolated=False):
        if isolated or not self.structured:
            values = super().forward(x, isolated)
            return values if isolated else self.gain * values
        accent, shape = self.components(x)
        return self.gain * (accent + shape)


class Retrieval:
    def __init__(self, encoder):
        self.encoder = encoder
        self.by_surface = {}
        self.cache = {}
        for (surface, reading), key in encoder.keys.items():
            self.by_surface.setdefault(surface, []).append((reading, key))

    def candidates(self, word):
        surface, kana = word["surface"], word["kana"]
        key = (surface, kana)
        if key not in self.cache:
            entries = set()
            for a in range(len(surface)):
                for z in range(a + 1, len(surface) + 1):
                    for reading, index in self.by_surface.get(surface[a:z], ()):
                        if reading in kana:
                            entries.add(index)
            self.cache[key] = sorted(entries) or [0]
        return self.cache[key]

    def row(self, row):
        words = words_of(row)
        choices = [self.candidates(w) for w in words]
        width = max(map(len, choices), default=1)
        out = np.zeros((len(row["x"]), 8 + width), dtype=np.int64)
        out[:, :8] = row["x"][:, :8]
        for i, (word, ids) in enumerate(zip(words, choices, strict=True)):
            end = words[i + 1]["at"] if i + 1 < len(words) else len(out)
            out[word["at"] : end, 8 : 8 + len(ids)] = ids
        row["x"] = out
        return row


def batch(rows):
    length = max(len(r["x"]) for r in rows)
    width = max(r["x"].shape[1] for r in rows)
    x = torch.zeros(len(rows), length, width, dtype=torch.long)
    y = torch.full((len(rows), length, 3), float("nan"), dtype=torch.float32)
    for i, row in enumerate(rows):
        n, w = row["x"].shape
        x[i, :n, :w] = torch.from_numpy(row["x"])
        if "y" in row:
            y[i, :n] = torch.as_tensor(row["y"], dtype=torch.float32)
    return x, y


def predictions(model, rows):
    model.eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(rows), 48):
            group = rows[i : i + 48]
            values = model(batch(group)[0]).numpy()
            out.extend(v[: len(r["x"])].copy() for r, v in zip(group, values, strict=True))
    return out


def restore(saved):
    model = ExperimentNet({k: len(v) for k, v in saved["vocab"].items()}, saved["attention"], saved["structured"], saved.get("bounded_shape", False))
    model.gain = saved.get("gain", 1.0)
    model.load_state_dict(saved["state"])
    model.eval()
    return model
