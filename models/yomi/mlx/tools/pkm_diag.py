"""学習型メモリ (PKM) の診断: スロット使用率、メモリ出力のノルムと残差のノルムの比、勾配ノルム。
  python tools/pkm_diag.py --ckpt ckpt/mold_tiny [--pkm X.mem.safetensors] [--data data/names/names_train.jsonl] [--n 256]"""
import argparse, json, sys, random
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import mlx.core as mx, mlx.nn as nn
from mlx.utils import tree_flatten
import yomi, mold, train

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", required=True); ap.add_argument("--pkm")
ap.add_argument("--data", default="data/names/names_train.jsonl"); ap.add_argument("--n", type=int, default=256)
a = ap.parse_args()
model, sv, tv, _ = yomi.load(a.ckpt, memory=a.pkm); model.train()
rows = [json.loads(l) for l in open(a.data, encoding="utf-8")]; random.Random(0).shuffle(rows); rows = rows[:a.n]
S, Ti, To = train.collate(rows, sv, tv)
valid = (S != train.PAD)
mold.ProductKeyMemory.probe = []
loss, g = nn.value_and_grad(model, train.loss_fn)(model, S, Ti, To, 0.0)
mx.eval(loss, g)
res = {"loss": float(loss), "layers": []}
mems = [l.mem for l in model.enc if "mem" in l]
for m, (w, idx, out, x, sc) in zip(mems, mold.ProductKeyMemory.probe):
    v = valid[..., None]
    ids = [i for i, ok in zip(idx.flatten().tolist(), mx.broadcast_to(v, idx.shape).flatten().tolist()) if ok]
    cnt = {}
    for i in ids:
        cnt[i] = cnt.get(i, 0) + 1
    top = sorted(cnt.values(), reverse=True)
    vm = valid.astype(mx.float32); nv = float(vm.sum())
    on = float((mx.linalg.norm(out, axis=-1) * vm).sum()) / nv
    rn = float((mx.linalg.norm(x, axis=-1) * vm).sum()) / nv
    res["layers"].append({"slots_used": len(cnt), "slots_total": m.n_keys ** 2,
                          "usage_top10_share": sum(top[:10]) / max(1, len(ids)),
                          "softmax_wmax_mean": float(w.max(-1).mean()), "score_std": float(sc.std()),
                          "mem_out_norm": on, "resid_norm": rn, "ratio": on / max(rn, 1e-9),
                          "gate": float(m.gate.item()) if "gate" in m else None,
                          "slots_absmean": float(mx.abs(m.slots).mean())})
mold.ProductKeyMemory.probe = None
res["grad_norm"] = {k: float(mx.linalg.norm(v.reshape(-1))) for k, v in tree_flatten(g) if ".mem." in f".{k}."}
res["grad_norm_shared_total"] = float(sum(float(mx.sum(v * v)) for k, v in tree_flatten(g) if ".mem." not in f".{k}.") ** 0.5)
print(json.dumps(res, ensure_ascii=False, indent=1))
