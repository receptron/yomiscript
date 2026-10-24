"""MoLD デモ: 同じ重みのまま辞書メモリを差し込み/外して読みが変わることと、遅延の増分を見る。
  python mold_demo.py --ckpt ckpt/tiny_aug [--extra mem/base_pyopenjtalk.koedict]"""
import argparse, time
from pathlib import Path

import mold, yomi

ROOT = Path(__file__).resolve().parents[3]
ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="ckpt/mold_smoke")
ap.add_argument("--extra", action="append", default=[])
ap.add_argument("--n", type=int, default=20)
a = ap.parse_args()
model, sv, tv, _ = yomi.load(a.ckpt)
demo = ROOT / "dict/names/demo_extra.koedict"  # 辞書に無い名前を「その場で」足す例
router = mold.MemoryRouter([mold.LexMemory.from_file(p) for p in
                            [*a.extra, ROOT / "dict/sample.koedict", ROOT / "dict/names/surnames.koedict",
                             ROOT / "dict/names/given_names.koedict", demo]])
print("memories:", [(m.name, m.layer, m.scope, len(m)) for m in router.memories])
cases = [("梨奈さんは来ますか。", None), ("智さんに会った。", "female"), ("智さんに会った。", "male"),
         ("佐藤光が優勝した。", "female"), ("佐藤光が優勝した。", "male"), ("朝市の市で魚を買う。", None),
         ("{梨奈|りいな}さんは来ますか。", None)]
for t, sex in cases:
    base = yomi.predict(model, sv, tv, [mold.ANNOT.sub(r"\1", t)])[0]
    logs = []
    withm = yomi.predict(model, sv, tv, [t], router=router, context=[sex] if sex else None, logs=logs)[0]
    print(f"{t} [{sex or '-'}]\n  model only : {base}\n  +memory    : {withm}\n  memory log : {[(l['surface'], l['reading'], l['by']) for l in logs[0]]}")

sent = ["佐藤梨奈さんは朝市の市で魚を買った。"] * 1
def bench(r):
    yomi.predict(model, sv, tv, sent, router=r)
    t0 = time.perf_counter()
    for _ in range(a.n): yomi.predict(model, sv, tv, sent, router=r)
    return (time.perf_counter() - t0) / a.n * 1000
t_res = time.perf_counter()
for _ in range(200): router.resolve(sent[0])
t_res = (time.perf_counter() - t_res) / 200 * 1000
print(f"latency/sentence: model {bench(None):.2f} ms, model+memory {bench(router):.2f} ms, router.resolve only {t_res:.3f} ms")
