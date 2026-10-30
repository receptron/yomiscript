"""Latency measurement: old decoding vs new decoding (fixed-length KV cache + precomputed cross-attention K/V + mx.compile), side by side.
  python bench.py --ckpt ckpt/tiny_aug [--device cpu|gpu] [--dtype bfloat16] [--batch 32] [--modes legacy,fast]
Measures the latency per sentence (batch 1) and the time per sentence when --batch sentences are processed together."""

import argparse
import json
import platform
import statistics
import time
from pathlib import Path

import mlx.core as mx
import yomi

REPO = Path(__file__).resolve().parents[3]
ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="ckpt/tiny")
ap.add_argument("--dtype", default=None, choices=["float32", "bfloat16", "float16"])
ap.add_argument("--device", default=None, choices=["cpu", "gpu"], help="defaults to the MLX default device (gpu on a Mac)")
ap.add_argument("--n", type=int, default=100)
ap.add_argument("--batch", type=int, default=32, help="batch size for the batched-inference measurement (0 to skip)")
ap.add_argument("--modes", default="legacy,fast,fast_nocompile", help="legacy=old, fast=new (with compile), fast_nocompile=new (without compile)")
a = ap.parse_args()
if a.device:
    mx.set_default_device(mx.cpu if a.device == "cpu" else mx.gpu)
model, sv, tv, _ = yomi.load(a.ckpt, getattr(mx, a.dtype) if a.dtype else None)
texts = [json.loads(l)["text"] for l in open(REPO / "eval/data/jsut_basic5000_subset.jsonl", encoding="utf-8")][: a.n]
MODES = {"legacy": dict(mode="legacy"), "fast": dict(mode="fast", compile=True), "fast_nocompile": dict(mode="fast", compile=False)}


def stats(lat):
    lat = sorted(lat)
    return {"mean_ms": round(statistics.mean(lat), 2), "median_ms": round(statistics.median(lat), 2), "p95_ms": round(lat[int(0.95 * (len(lat) - 1))], 2)}


res, outs = {}, {}
for name in a.modes.split(","):
    kw = MODES[name]
    yomi.predict(model, sv, tv, texts, batch=1, **kw)  # warm-up (compile for every length)
    lat, o = [], []
    for t in texts:
        s = time.perf_counter()
        o += yomi.predict(model, sv, tv, [t], **kw)
        lat.append((time.perf_counter() - s) * 1000)
    r = {"batch1": stats(lat)}
    if a.batch:
        yomi.predict(model, sv, tv, texts, batch=a.batch, **kw)
        s = time.perf_counter()
        yomi.predict(model, sv, tv, texts, batch=a.batch, **kw)
        r[f"batch{a.batch}_ms_per_sent"] = round((time.perf_counter() - s) * 1000 / len(texts), 2)
    res[name], outs[name] = r, o
base = res.get("legacy")
if base:
    for _name, r in res.items():
        r["speedup_median_vs_legacy"] = round(base["batch1"]["median_ms"] / r["batch1"]["median_ms"], 2)
same = {name: sum(x == y for x, y in zip(outs[next(iter(outs))], o, strict=False)) for name, o in outs.items()}
print(
    json.dumps(
        {
            "device": str(mx.default_device()),
            "machine": platform.machine(),
            "dtype": a.dtype or "checkpoint",
            "params_M": round(yomi.n_params(model) / 1e6, 2),
            "n": len(texts),
            "results": res,
            "identical_outputs_vs_first_mode": same,
        },
        indent=1,
        ensure_ascii=False,
    )
)
