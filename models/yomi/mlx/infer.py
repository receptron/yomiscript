"""推論 CLI。 python infer.py --ckpt ckpt/tiny "今日は良い天気です。"  (引数なしなら標準入力から1行1文)"""
import argparse, sys

import mlx.core as mx

import yomi

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="ckpt/tiny")
ap.add_argument("--dtype", default=None, choices=["float32", "bfloat16", "float16"])
ap.add_argument("--plain", action="store_true", help="韻律記号を除いたカナだけ出す")
ap.add_argument("text", nargs="*")
a = ap.parse_args()
model, sv, tv, _ = yomi.load(a.ckpt, getattr(mx, a.dtype) if a.dtype else None)
texts = a.text or [l.strip() for l in sys.stdin if l.strip()]
for t, p in zip(texts, yomi.predict(model, sv, tv, texts)):
    if a.plain:
        p = "".join(c for c in p if c not in "^$?#_[]")
    print(f"{t}\t{p}")
