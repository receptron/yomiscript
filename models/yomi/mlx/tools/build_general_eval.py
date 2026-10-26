"""学習に使っていない一般文の評価セット (pyopenjtalk 蒸留の正解) を作る。
wiki shard の未採用文 (aug_text / distill / train に無い) から --n 文。出力は JSUT と同じ形式 (text, kana_prosody)。
python tools/build_general_eval.py --n 3000  ->  eval/data/general_heldout.jsonl (リポジトリに置く)"""
import argparse, json, random, sys
from collections import Counter
from pathlib import Path
HERE = Path(__file__).resolve().parents[1]; sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "aug"))
import build_text as bt
from prepare_data import distill_one
ap = argparse.ArgumentParser()
ap.add_argument("--n", type=int, default=3000); ap.add_argument("--pool", type=int, default=30000)
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
        seen.add(k); pool.append(s)
        if len(pool) >= a.pool:
            break
random.Random(0).shuffle(pool); out = []
for s in pool:
    tg = distill_one(s)
    if tg:
        out.append({"id": f"gen:{len(out)}", "text": s, "kana_prosody": tg})
    if len(out) >= a.n:
        break
a.out.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in out), encoding="utf-8")
print(f"build_general_eval: {len(out)} 文 (未使用候補 {len(pool)}) -> {a.out}")
