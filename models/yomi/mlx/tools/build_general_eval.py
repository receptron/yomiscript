"""Build an evaluation set of general sentences not used in training (pyopenjtalk-distilled references).
--n sentences from the unused sentences of the wiki shard (not in aug_text / distill / train). The output has the same format as JSUT (text, kana_prosody).
python tools/build_general_eval.py --n 3000  ->  eval/data/general_heldout.jsonl (kept in the repository)"""

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "aug"))
import build_text as bt
from prepare_data import distill_one

ap = argparse.ArgumentParser()
ap.add_argument("--n", type=int, default=3000)
ap.add_argument("--pool", type=int, default=30000)
ap.add_argument("--out", type=Path, default=HERE.parents[2] / "eval/data/general_heldout.jsonl")
a = ap.parse_args()
seen = set()
for p in (HERE / "data/aug_text").glob("*.txt"):
    seen |= {bt.norm(l) for l in open(p, encoding="utf-8")}
for p in ("train.jsonl", "dev.jsonl", "distill.jsonl"):
    seen |= {bt.norm(json.loads(l)["text"]) for l in open(HERE / "data" / p, encoding="utf-8")}
evk, st, pool = bt.eval_keys(), Counter(), []
for s in bt.wiki_sents([HERE / "data/aug_cache/wiki-00014.parquet"]):
    s = bt.check(s, st, evk)
    if s and (k := bt.norm(s)) not in seen:
        seen.add(k)
        pool.append(s)
        if len(pool) >= a.pool:
            break
random.Random(0).shuffle(pool)
out = []
for s in pool:
    tg = distill_one(s)
    if tg:
        out.append({"id": f"gen:{len(out)}", "text": s, "kana_prosody": tg})
    if len(out) >= a.n:
        break
a.out.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in out), encoding="utf-8")
print(f"build_general_eval: {len(out)} sentences (unused candidates {len(pool)}) -> {a.out}")
