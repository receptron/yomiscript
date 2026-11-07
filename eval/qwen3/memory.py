"""The word memory of qwen-3: every NAIST-JDIC entry (surface and reading) has a learned vector, read with the network that predicts a word's fall.
The memory is switched off at random in training, so the same network still answers for a word it has no entry for.
Shared by the scripts here.
"""

import csv
import re
from pathlib import Path

import torch
from torch import nn

HERE = Path(__file__).resolve().parent
SRC = HERE / "work/src/naist-jdic-0.1.3/naist-jdic.csv"
MAX_MORAE, MAX_CHARS, DIM, HIDDEN, MEMORY = 12, 12, 48, 128, 32
MORA = re.compile(r"[ァ-ヴー][ァィゥェォャュョヮ]?")


def entries():
    """every (surface, reading), with its fall and part of speech; the first of several falls wins"""
    out = {}
    with SRC.open(encoding="utf8", newline="") as f:
        for r in csv.reader(f):
            if len(r) < 15 or "/" not in r[13]:
                continue
            surface, pos, pron = r[0], r[4], r[12].replace("’", "")
            morae = MORA.findall(pron)
            if "".join(morae) != pron or not 1 <= len(morae) <= MAX_MORAE or len(surface) > MAX_CHARS:
                continue
            fall = int(r[13].split("/")[0])
            if 0 <= fall <= len(morae):
                out.setdefault((surface, pron), {"surface": surface, "pron": pron, "morae": morae, "fall": fall, "pos": pos, "cost": int(r[3])})
    return list(out.values())


class WordNet(nn.Module):
    """characters and morae through two small GRUs, with the entry's memory vector when it has one; a score per mora, and one for no fall.
    encode() is what the sentence model reads."""

    def __init__(self, chars, morae, size):
        super().__init__()
        self.c = nn.Embedding(chars + 2, DIM, padding_idx=0)
        self.m = nn.Embedding(morae + 2, DIM, padding_idx=0)
        self.memory = nn.Embedding(size + 1, MEMORY, padding_idx=0)
        self.cg = nn.GRU(DIM, HIDDEN // 2, batch_first=True, bidirectional=True)
        self.mg = nn.GRU(DIM + HIDDEN + MEMORY, HIDDEN // 2, batch_first=True, bidirectional=True)
        self.out = nn.Linear(HIDDEN, 1)
        self.none = nn.Linear(HIDDEN, 1)

    def encode(self, ch, mo, key):
        cs, _ = self.cg(self.c(ch))
        ctx = cs.mean(1, keepdim=True).expand(-1, mo.size(1), -1)
        mem = self.memory(key).unsqueeze(1).expand(-1, mo.size(1), -1)
        h, _ = self.mg(torch.cat([self.m(mo), ctx, mem], 2))
        return h

    def forward(self, ch, mo, key):
        h = self.encode(ch, mo, key)
        mask = mo == 0
        s = self.out(h).squeeze(2).masked_fill(mask, -1e9)
        pooled = (h * (~mask).unsqueeze(2)).sum(1) / (~mask).sum(1, keepdim=True)
        return torch.cat([self.none(pooled), s], 1)
