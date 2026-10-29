"""推論 CLI。 python infer.py --ckpt ckpt/tiny "今日は良い天気です。"  (引数なしなら標準入力から1行1文)
MoLD: --dict ../../../dict/names/given_names.koedict --sex female  (辞書メモリを学習なしで差し込む)
      --memory mem/xxx.mem.safetensors (学習型メモリ層の差し替え)"""

import argparse
import sys

import mlx.core as mx
import yomi

import mold

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="ckpt/tiny")
ap.add_argument("--dtype", default=None, choices=["float32", "bfloat16", "float16"])
ap.add_argument("--plain", action="store_true", help="韻律記号を除いたカナだけ出す")
ap.add_argument("--dict", action="append", default=[], help=".koedict (複数可, 後勝ちではなく注記>文脈>default の順)")
ap.add_argument("--dialect", default=None, help="fixed モード: @lexicon(dialect: X) を使う")
ap.add_argument("--sex", default=None, help="male/female (人名の文脈条件)")
ap.add_argument("--context", action="append", default=[], help="任意の文脈語")
ap.add_argument("--memory", default=None)
ap.add_argument("--show", action="store_true", help="辞書メモリの適用ログを出す")
ap.add_argument("text", nargs="*")
a = ap.parse_args()
model, sv, tv, _ = yomi.load(a.ckpt, getattr(mx, a.dtype) if a.dtype else None, memory=a.memory)
texts = a.text or [l.strip() for l in sys.stdin if l.strip()]
router = mold.MemoryRouter([mold.LexMemory.from_file(p, dialect=a.dialect) for p in a.dict]) if a.dict else mold.MemoryRouter()
ctx = a.context + ([a.sex] if a.sex else [])
logs = []
for t, p, lg in zip(texts, yomi.predict(model, sv, tv, texts, router=router, context=ctx, logs=logs), logs or [[]] * len(texts), strict=False):
    if a.plain:
        p = "".join(c for c in p if c not in "^$?#_[]")
    print(f"{t}\t{p}")
    if a.show and lg:
        print("   memory:", lg)
