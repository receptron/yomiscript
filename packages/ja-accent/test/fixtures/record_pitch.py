"""A tiny random model and what PyTorch's LSTM makes of an input, for pitch.spec.ts: the TypeScript LSTM must give the same.
usage: eval/prosody_ref/.venv/bin/python packages/ja-accent/test/fixtures/record_pitch.py   -> fixtures/pitch_tiny.json
"""

import json
from pathlib import Path

import torch
from torch import nn

torch.manual_seed(0)
VOCAB = {
    "ipa": {"a": 1, "ka": 2, "ɕi": 3, "te": 4},
    "word": {"書いて": 1},
    "char": {"書": 1, "て": 2},
    "bound": {"": 1, "start": 2, "#": 3},
}
CLIP, DIM, POS, HIDDEN = 12, 3, 2, 4


class Tiny(nn.Module):
    def __init__(self):
        super().__init__()
        self.emb = nn.ModuleList([nn.Embedding(len(VOCAB[k]) + 1, DIM) for k in ("ipa", "word", "bound")])
        self.pos = nn.ModuleList([nn.Embedding(CLIP + 1, POS) for _ in range(4)])
        self.d31 = nn.Embedding(5, POS)
        self.char = nn.Embedding(len(VOCAB["char"]) + 1, DIM)
        self.rnn = nn.LSTM(3 * DIM + 4 * POS + POS + 2 * DIM, HIDDEN, num_layers=2, bidirectional=True, batch_first=True)
        self.out = nn.Sequential(nn.Dropout(0.3), nn.Linear(2 * HIDDEN, 3))


MORAE = [
    # ipa, word, bound, ppos, plen, wpos, wlen, d31nuc, its category
    {"ipa": "ka", "word": "書いて", "bound": "start", "ppos": 0, "plen": 3, "wpos": 0, "wlen": 3, "d31nuc": 1, "cat": 2},
    {"ipa": "i", "word": "書いて", "bound": "", "ppos": 1, "plen": 3, "wpos": 1, "wlen": 3, "d31nuc": 1, "cat": 1},
    {"ipa": "te", "word": "書いて", "bound": "", "ppos": 2, "plen": 3, "wpos": 2, "wlen": 3, "d31nuc": 1, "cat": 1},
    {"ipa": "ɕi", "word": "未知", "bound": "#", "ppos": 0, "plen": 1, "wpos": 0, "wlen": 1, "d31nuc": -1, "cat": 4},
    {"ipa": "a", "word": "", "bound": "#", "ppos": 0, "plen": 2, "wpos": 0, "wlen": 1, "d31nuc": 0, "cat": 1},
    {"ipa": "ka", "word": "", "bound": "", "ppos": 13, "plen": 2, "wpos": 0, "wlen": 1, "d31nuc": 0, "cat": 1},
]


def ids(m):
    w = m["word"]
    return [
        VOCAB["ipa"].get(m["ipa"], 0),
        VOCAB["word"].get(w, 0),
        VOCAB["bound"].get(m["bound"], 0),
        min(m["ppos"], CLIP),
        m["plen"],
        m["wpos"],
        m["wlen"],
        m["cat"],
        VOCAB["char"].get(w[0], 0) if w else 0,
        VOCAB["char"].get(w[-1], 0) if w else 0,
    ]


def main():
    model = Tiny().eval()
    r = torch.tensor([ids(m) for m in MORAE])[None]
    x = [e(r[..., i]) for i, e in enumerate(model.emb)]
    x += [e(r[..., 3 + i]) for i, e in enumerate(model.pos)]
    x += [model.d31(r[..., 7]), model.char(r[..., 8]), model.char(r[..., 9])]
    with torch.no_grad():
        h, _ = model.rnn(torch.cat(x, -1))
        out = model.out(h)[0]
    tensors = {k: {"shape": list(v.shape), "data": v.flatten().tolist()} for k, v in model.state_dict().items()}
    morae = [{k: v for k, v in m.items() if k != "cat"} for m in MORAE]
    text = {"vocab": VOCAB, "clip": CLIP, "tensors": tensors, "morae": morae, "out": out.tolist()}
    (Path(__file__).parent / "pitch_tiny.json").write_text(json.dumps(text, ensure_ascii=False))


if __name__ == "__main__":
    main()
