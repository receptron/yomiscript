"""Build values teachers and a disjoint development split without inspecting test scores."""

import csv
import hashlib
import json

import numpy as np
import rows as ts
from memory import HERE, MORA, SRC

EXTRA = "/Users/satoshi/git/ai/voice-more-data/eval/qwen_prosody/work/pitch_rows_all.json"


def dictionary_entries():
    """All spoken entries, without the earlier experiment's length cutoffs."""
    found = {}
    with SRC.open(newline="") as source:
        for row in csv.reader(source):
            if len(row) < 15 or "/" not in row[13]:
                continue
            surface, pron = row[0], row[12].replace("’", "")
            morae = MORA.findall(pron)
            if not morae or "".join(morae) != pron:
                continue
            fall = int(row[13].split("/")[0])
            if 0 <= fall <= len(morae):
                found.setdefault((surface, pron), {"surface": surface, "pron": pron, "fall": fall})
    return list(found.values())


def read(path):
    return json.loads(path.read_text())


def held(name):
    return hashlib.sha256(name.encode()).digest()[0] < 32


def training_split(rows):
    fit = [s for s in rows if not s.get("test") and not held(s["name"])]
    dev = [s for s in rows if not s.get("test") and held(s["name"]) and s["marks"] and s["comparison"].get("gold")]
    return fit, dev


def vocabulary(word_rows, rows):
    keys = [[r["surface"], r["pron"]] for r in dictionary_entries()]
    chars = sorted({c for s, _ in keys for c in s})
    ipa = sorted({m["ipa"] for s in rows for m in s["morae"]} | {i for r in word_rows for i in r["i"]})
    bounds = sorted({m["bound"] for s in rows for m in s["morae"]})
    return {
        "keys": keys,
        "chars": {c: i + 1 for i, c in enumerate(chars)},
        "ipa": {c: i + 1 for i, c in enumerate(ipa)},
        "bounds": {c: i + 1 for i, c in enumerate(bounds)},
    }


class Encoder:
    def __init__(self, vocab):
        self.vocab = vocab
        self.keys = {tuple(k): i + 1 for i, k in enumerate(vocab["keys"])}
        ts.keys_by_surface.clear()
        for s, p in self.keys:
            ts.keys_by_surface.setdefault(s, []).append(p)
        for ps in ts.keys_by_surface.values():
            ps.sort(key=len, reverse=True)

    def row(self, s):
        v = self.vocab
        words = ts.words_of(s)
        x = np.zeros((len(s["morae"]), 8), dtype=np.int64)
        for j, w in enumerate(words):
            z = words[j + 1]["at"] if j + 1 < len(words) else len(x)
            surface = w["surface"]
            first = v["chars"].get(surface[:1], len(v["chars"]) + 1)
            last = v["chars"].get(surface[-1:], len(v["chars"]) + 1)
            for at in range(w["at"], z):
                m = s["morae"][at]
                x[at] = [
                    ts.lookup(w, self.keys),
                    first,
                    last,
                    v["ipa"].get(m["ipa"], len(v["ipa"]) + 1),
                    v["bounds"].get(m["bound"], len(v["bounds"]) + 1),
                    min(at - w["at"], 64),
                    min(z - w["at"], 64),
                    min(m.get("ppos", 0), 64),
                ]
        s["x"] = x
        return s

    def word_row(self, r):
        s = {"morae": [{"ipa": p, "bound": "start" if i == 0 else "", "word": r["s"], "span": 0, "ppos": i} for i, p in enumerate(r["i"])]}
        self.row(s)
        s["x"][:, 0] = self.keys[(r["s"], r["k"])]
        s["y"] = np.array(r["v"], dtype=np.float32)
        return s


def target(values, dtype=np.float32):
    return np.array([[float("nan") if v is None else v for v in (m or [None] * 3)] for m in values], dtype=dtype)


def load():
    rows = read(ts.ROWS)
    from pathlib import Path

    rows += [r for r in read(Path(EXTRA)) if r["name"].startswith("WIKI2_")]
    extra = read(HERE / "work/rows_all.json")
    rows += [r for r in extra["rows"] if r["name"].startswith("JKYB_")]
    values = read(HERE / "work/rows_values.json")
    gold = {r["name"]: r["gold"] for r in read(ts.GOLD)}
    for s in rows:
        n = len(s["morae"])
        starts = [p["start"] for p in s["phrases"]] if "phrases" in s else s["dict"]["starts"]
        s["spans"] = list(zip(starts, [*starts[1:], n], strict=True))
        for a, z in s["spans"]:
            for i in range(a, z):
                s["morae"][i]["ppos"] = i - a
        s["teachers"] = []
        s["marks"] = ts.gold_marks(gold[s["name"]], n) if s["name"] in gold else None
        val = values.get(s["name"], {})
        for kind, source in [("gold", val.get("gold")), ("dict", val.get("dict", s.get("baseline"))), ("qwen", s.get("target"))]:
            if source and len(source) == n:
                s["teachers"].append((kind, target(source)))
        s["comparison"] = val
    words = [json.loads(line) for line in (HERE / "work/word_values.jsonl").open()]
    vocab = vocabulary(words, [r for r in rows if not r.get("test") and not held(r["name"])])
    encoder = Encoder(vocab)
    for s in rows:
        encoder.row(s)
    return rows, words, vocab, encoder, extra["checks"]
