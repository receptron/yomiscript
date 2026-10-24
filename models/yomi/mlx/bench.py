"""レイテンシ計測 (1文ずつ, バッチ1, ウォームアップ後)。 python bench.py --ckpt ckpt/tiny [--dtype bfloat16]"""
import argparse, json, platform, statistics, time
from pathlib import Path

import mlx.core as mx

import yomi

REPO = Path(__file__).resolve().parents[3]
ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="ckpt/tiny")
ap.add_argument("--dtype", default=None, choices=["float32", "bfloat16", "float16"])
ap.add_argument("--n", type=int, default=100)
a = ap.parse_args()
model, sv, tv, _ = yomi.load(a.ckpt, getattr(mx, a.dtype) if a.dtype else None)
texts = [json.loads(l)["text"] for l in open(REPO / "eval/data/jsut_basic5000_subset.jsonl", encoding="utf-8")][: a.n]
for t in texts[:5]:
    yomi.predict(model, sv, tv, [t])
lat = []
for t in texts:
    s = time.perf_counter(); yomi.predict(model, sv, tv, [t]); lat.append((time.perf_counter() - s) * 1000)
lat.sort()
print(json.dumps({"device": str(mx.default_device()), "machine": platform.machine(), "dtype": a.dtype or "checkpoint",
                  "params_M": round(yomi.n_params(model) / 1e6, 2), "n": len(lat), "mean_ms": statistics.mean(lat),
                  "median_ms": statistics.median(lat), "p95_ms": lat[int(0.95 * (len(lat) - 1))]}, indent=1))
