"""Diagnostics for the learned memory (PKM): slot usage, the ratio of the memory output norm to the residual norm, gradient norms.
python tools/pkm_diag.py --ckpt ckpt/mold_tiny [--pkm X.mem.safetensors] [--data data/names/names_train.jsonl] [--n 256]"""

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import mlx.core as mx
import mlx.nn as nn
import train
import yomi
from mlx.utils import tree_flatten

import mold

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", required=True)
ap.add_argument("--pkm", action="append")
ap.add_argument("--data", default="data/names/names_train.jsonl")
ap.add_argument("--n", type=int, default=256)
ap.add_argument("--json", action="store_true", help="also print the full JSON to stdout (by default it is saved under eval_out/ and only the summary is shown)")
ap.add_argument("--gen-data", default="data/dev.jsonl", help="general sentences (no personal names) to compare the conditional gate against")
a = ap.parse_args()
model, sv, tv, _ = yomi.load(a.ckpt, memory=a.pkm)
model.train()
rows = [json.loads(l) for l in open(a.data, encoding="utf-8")]
random.Random(0).shuffle(rows)
rows = rows[: a.n]
S, Ti, To = train.collate(rows, sv, tv)
valid = S != train.PAD
mold.ProductKeyMemory.probe = []
loss, g = nn.value_and_grad(model, train.loss_fn)(model, S, Ti, To, 0.0)
mx.eval(loss, g)
res = {"loss": float(loss), "layers": []}
mems = mold.memories(model)
for m, (w, idx, out, x, sc) in zip(mems, mold.ProductKeyMemory.probe, strict=False):
    v = valid[..., None]
    ids = [i for i, ok in zip(idx.flatten().tolist(), mx.broadcast_to(v, idx.shape).flatten().tolist(), strict=False) if ok]
    cnt = {}
    for i in ids:
        cnt[i] = cnt.get(i, 0) + 1
    top = sorted(cnt.values(), reverse=True)
    vm = valid.astype(mx.float32)
    nv = float(vm.sum())
    on = float((mx.linalg.norm(out, axis=-1) * vm).sum()) / nv
    rn = float((mx.linalg.norm(x, axis=-1) * vm).sum()) / nv
    res["layers"].append(
        {
            "slots_used": len(cnt),
            "slots_total": m.n_keys**2,
            "usage_top10_share": sum(top[:10]) / max(1, len(ids)),
            "softmax_wmax_mean": float(w.max(-1).mean()),
            "score_std": float(sc.std()),
            "mem_out_norm": on,
            "resid_norm": rn,
            "ratio": on / max(rn, 1e-9),
            "gate": float(m.gate.item()) if "gate" in m else None,
            "slots_absmean": float(mx.abs(m.slots).mean()),
            "cond_gate_mean": None,
            "temp": getattr(m, "temp", None),
            "balance_aux": float(m._st.aux) if getattr(m, "_st", None) is not None and m._st.aux is not None else None,
        }
    )
mold.ProductKeyMemory.probe = None


def gate_stats(rs):
    """Per-token statistics of the conditional gate: personal-name tokens / others. Per memory."""
    S, Ti, To = train.collate(rs, sv, tv)
    _, N = train.span_labels(rs, S.shape[1])
    model.eval()
    model(S, Ti)
    model.train()
    sm = (S != train.PAD).astype(mx.float32)
    out = []
    for m in mems:
        cg = m._st.cg if "cgate" in m else None
        if cg is None:
            out.append(None)
            continue

        def st(w, cg=cg):  # called in this iteration; cg bound explicitly
            return {
                "mean": float((cg * w).sum() / mx.maximum(1, w.sum())),
                "n": int(w.sum()),
                "frac_gt_0.5": float(((cg > 0.5) * w).sum() / mx.maximum(1, w.sum())),
            }

        out.append({"all": st(sm), "name_tok": st(sm * N), "non_name_tok": st(sm * (1 - N))})
    return out


gn = gate_stats(rows)
gg = gate_stats([json.loads(l) for l in open(a.gen_data, encoding="utf-8")][: a.n]) if Path(a.gen_data).exists() else [None] * len(mems)
for L, x, y in zip(res["layers"], gn, gg, strict=False):
    L["cond_gate_mean"] = None if x is None else {"names_data": x, "general_data": y and y["all"]}
res["grad_norm"] = {k: float(mx.linalg.norm(v.reshape(-1))) for k, v in tree_flatten(g) if mold.is_mem_key(k)}
res["grad_norm_shared_total"] = float(sum(float(mx.sum(v * v)) for k, v in tree_flatten(g) if not mold.is_mem_key(k)) ** 0.5)
js = json.dumps(res, ensure_ascii=False, indent=1)
od = Path(__file__).resolve().parents[1] / "eval_out"
od.mkdir(exist_ok=True)
fp = od / f"{Path(a.ckpt).name}.pkm_diag.json"
fp.write_text(js, encoding="utf-8")
if a.json:
    print(js)
# The last few lines = the summary (for pasting)
for p in mold.split_pkm(a.pkm):
    print(f"file {Path(p).name}: {mold.memory_file_summary(p)}")
print(f"pkm_diag {a.ckpt}  loss {res['loss']:.4f}  full: {fp}")
for k, (_m, L) in enumerate(zip(mems, res["layers"], strict=False)):
    c = L["cond_gate_mean"]
    cs = (
        ""
        if not c
        else (
            f"  cg name {c['names_data']['name_tok']['mean']:.3f} non {c['names_data']['non_name_tok']['mean']:.3f}"
            f" gen {c['general_data']['mean'] if c['general_data'] else float('nan'):.3f}"
        )
    )
    print(
        f"mem{k}: slots {L['slots_used']}/{L['slots_total']} top10 {L['usage_top10_share']:.2f} wmax {L['softmax_wmax_mean']:.2f}"
        f" ratio {L['ratio']:.3f} gate {L['gate'] if L['gate'] is None else round(L['gate'], 3)}{cs}"
    )
