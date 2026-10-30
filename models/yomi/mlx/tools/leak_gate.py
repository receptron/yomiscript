"""Leak diagnosis for the personal-name memory (mem2): on JSUT sentences that are right with none but wrong with mem2, is the conditional gate open?
Usage: python tools/leak_gate.py --ckpt C --pkm P --a none.preds.jsonl --b mem.preds.jsonl  (the last line is the summary)
Verdict: high max gate on the leaked sentences -> gate leak (cut by a threshold / gate-sup) / low -> the memory output has an effect even with a low gate."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import mlx.core as mx
import train
import yomi

import mold

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt")
ap.add_argument("--pkm", action="append")
ap.add_argument("--a")
ap.add_argument("--b")
a = ap.parse_args()
model, sv, tv, _ = yomi.load(a.ckpt, memory=a.pkm)
model.eval()
mems = mold.memories(model, "mem2")
A, B = ([json.loads(l) for l in open(p, encoding="utf-8")] for p in (a.a, a.b))
leak = [b for x, b in zip(A, B, strict=False) if x["pred"] == x["gold"] and b["pred"] != b["gold"]]
ok = [b for b in B if b["pred"] == b["gold"]][:100]


def gates(rs):
    S = mx.array(
        [sv.encode(r["text"])[: model.max_len] + [train.PAD] * (model.max_len - len(sv.encode(r["text"])[: model.max_len])) for r in rs], dtype=mx.int32
    )
    model.encode(S)
    cg = mems[0]._st.cg
    m = S != train.PAD
    return [[float(v) for v, k in zip(cg[i].tolist(), m[i].tolist(), strict=False) if k] for i in range(len(rs))]


gl, go = gates(leak) if leak else [], gates(ok) if ok else []
for r, g in list(zip(leak, gl, strict=False))[:5]:
    top = sorted(zip(g, r["text"], strict=False), reverse=True)[:3]
    print(f"  {r['text'][:20]} max{max(g):.2f} " + " ".join(f"{c}:{v:.2f}" for v, c in top))


def mx_(G):
    return sum(max(g) for g in G) / max(1, len(G))


def fr(G, t):
    return sum(max(g) >= t for g in G) / max(1, len(G))


print(
    f"leak_gate: leaked {len(leak)} sentences mean maxgate {mx_(gl):.2f} (>=0.5 {fr(gl,.5):.0%} >=0.8 {fr(gl,.8):.0%}) "
    f"| correct sentences {len(go)} mean maxgate {mx_(go):.2f} (>=0.5 {fr(go,.5):.0%} >=0.8 {fr(go,.8):.0%})"
)
