"""人名メモリの「漏れやすい一般文」(hard negative) を集める。
(1) gate: 現在の mem2 の条件付きゲートが人名でない文で --thr を超える文
(2) chars: 人名に多い漢字 (names_train の名前の文字統計) を含む一般文 (人名データ以外 = 人名でない文脈)
出力 jsonl は train.py --extra に渡す (一般文扱い → gate-sup の 0 目標 / leak-kl がかかる)。最後の行が要約。"""
import argparse, json, random, sys
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import mlx.core as mx
import yomi, mold, train
ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", required=True); ap.add_argument("--pkm", action="append")
ap.add_argument("--data", default="data/distill.jsonl"); ap.add_argument("--n", type=int, default=20000)
ap.add_argument("--thr", type=float, default=0.5); ap.add_argument("--max-gate", type=int, default=3000)
ap.add_argument("--max-chars", type=int, default=2000); ap.add_argument("--top-chars", type=int, default=300)
ap.add_argument("--out", default="data/names/hardneg.jsonl")
a = ap.parse_args()
rows = [json.loads(l) for l in open(a.data, encoding="utf-8")]
random.Random(1).shuffle(rows); rows = [r for r in rows if not r.get("names")][: a.n]
gate_hits = []
if a.pkm:
    model, sv, tv, _ = yomi.load(a.ckpt, memory=a.pkm); model.eval()
    ms = [m for m in mold.memories(model, "mem2") if "cgate" in m]
    for i in range(0, len(rows), 64):
        ch = rows[i:i + 64]; ids = [sv.encode(r["text"])[: model.max_len] for r in ch]; L = max(map(len, ids))
        S = mx.array([x + [train.PAD] * (L - len(x)) for x in ids], dtype=mx.int32)
        model.encode(S); cg = (ms[0]._st.cg * (S != train.PAD)).max(axis=1).tolist()
        gate_hits += [(g, r) for g, r in zip(cg, ch) if g > a.thr]
    gate_hits = [r for _, r in sorted(gate_hits, key=lambda x: -x[0])[: a.max_gate]]
nc = Counter(c for l in open("data/names/names_train.jsonl", encoding="utf-8") for n in json.loads(l).get("names", []) for c in n)
gc = Counter(c for r in rows for c in r["text"])  # 一般文での頻度で割って「人名に偏る漢字」を選ぶ
top = set(sorted((c for c in nc if "一" <= c <= "鿿" and gc[c] >= 3), key=lambda c: -nc[c] / (gc[c] + 20))[: a.top_chars])
seen = {r["text"] for r in gate_hits}; char_hits = []
for r in rows:
    if len(char_hits) >= a.max_chars:
        break
    t = r["text"]
    if t in seen or not any(c in top for c in t):
        continue
    char_hits.append(r); seen.add(t)
with open(a.out, "w", encoding="utf-8") as f:
    for r in gate_hits + char_hits:
        f.write(json.dumps({**r, "hardneg": 1}, ensure_ascii=False) + "\n")
print(f"mine_hardneg: {len(rows)} 文から gate>{a.thr} {len(gate_hits)} 文 + 人名漢字 {len(char_hits)} 文 -> {a.out}")
