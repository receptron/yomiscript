"""Evaluate with the eval/ metrics (JSUT 280 sentences + the hard set). python evaluate.py --ckpt ckpt/tiny

Prosody (phrase boundaries, accent nuclei) is compared by aligning the output kana + symbol string character by character with the reference kana_prosody.
The pyopenjtalk baseline compares per phoneme, so the numbers are close but the procedure is not strictly identical.
"""

import argparse
import json
import sys
import time
from pathlib import Path

import mlx.core as mx
import yomi

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "eval/scripts"))
from metrics import edit_distance, f1, loose_kana, norm_kana, prosody_compare

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="ckpt/tiny")
ap.add_argument("--dtype", default=None, choices=["float32", "bfloat16", "float16"])
ap.add_argument("--pkm", action="append", default=None, help="learned memory *.mem.safetensors to swap in (repeatable / comma-separated, stacked)")
ap.add_argument("--out", type=Path)
ap.add_argument(
    "--general-eval",
    type=int,
    default=0,
    metavar="N",
    help="also evaluate the first N general sentences not used in training (eval/data/general_heldout.jsonl, pyopenjtalk-distilled references) (0 = off)",
)
ap.add_argument("--general-preds", type=Path, help="save all predictions on the general sentences as jsonl")
ap.add_argument("--preds", type=Path, help="save all JSUT predictions as jsonl (for error analysis)")
a = ap.parse_args()
model, sv, tv, meta = yomi.load(a.ckpt, getattr(mx, a.dtype) if a.dtype else None, memory=a.pkm)
jsut = [json.loads(l) for l in open(REPO / "eval/data/jsut_basic5000_subset.jsonl", encoding="utf-8")]
t0 = time.time()
preds = yomi.predict(model, sv, tv, [r["text"] for r in jsut])
agg = dict.fromkeys(["ce", "cl", "ok", "cel", "cll", "okl", "bnd_tp", "bnd_fp", "bnd_fn", "nuc_tp", "nuc_fp", "nuc_fn", "ap_ok", "ap_tot"], 0)
errs = []
for r, p in zip(jsut, preds, strict=False):
    g, q = norm_kana(r["kana_prosody"]), norm_kana(p)
    e = edit_distance(g, q)
    agg["ce"] += e
    agg["cl"] += len(g)
    agg["ok"] += e == 0
    el = edit_distance(loose_kana(g), loose_kana(q))
    agg["cel"] += el
    agg["cll"] += len(loose_kana(g))
    agg["okl"] += el == 0
    res = prosody_compare(list(r["kana_prosody"]), list(p))
    for k in ["bnd_tp", "bnd_fp", "bnd_fn", "nuc_tp", "nuc_fp", "nuc_fn", "ap_ok", "ap_tot"]:
        agg[k] += res[k]
    if e:
        errs.append({"id": r["id"], "text": r["text"], "gold": g, "pred": q})
rows = [l.rstrip("\n").split("\t") for l in open(REPO / "eval/data/hard_set.tsv", encoding="utf-8") if l.strip() and not l.startswith("#")]
if a.preds:
    a.preds.parent.mkdir(parents=True, exist_ok=True)
    with open(a.preds, "w", encoding="utf-8") as f:
        for r, p in zip(jsut, preds, strict=False):
            f.write(json.dumps({"id": r["id"], "text": r["text"], "gold": norm_kana(r["kana_prosody"]), "pred": norm_kana(p)}, ensure_ascii=False) + "\n")
hp = yomi.predict(model, sv, tv, [x[2] for x in rows])
cats = {}
for (_hid, cat, _text, gold, *_), p in zip(rows, hp, strict=False):
    gs = [norm_kana(x) for x in gold.split("|")]
    e = min(edit_distance(x, norm_kana(p)) for x in gs)
    c = cats.setdefault(cat, {"n": 0, "ok": 0})
    c["n"] += 1
    c["ok"] += e == 0
gen = None
if a.general_eval:
    gr = [json.loads(l) for l in open(REPO / "eval/data/general_heldout.jsonl", encoding="utf-8")][: a.general_eval]
    gp = yomi.predict(model, sv, tv, [r["text"] for r in gr])
    ce = cl = ok = okl = 0
    gf = open(a.general_preds, "w", encoding="utf-8") if a.general_preds else None
    for r, p in zip(gr, gp, strict=False):
        g, q = norm_kana(r["kana_prosody"]), norm_kana(p)
        e = edit_distance(g, q)
        ce += e
        cl += len(g)
        ok += e == 0
        okl += loose_kana(g) == loose_kana(q)
        if gf:
            gf.write(json.dumps({"id": r["id"], "text": r["text"], "gold": g, "pred": q}, ensure_ascii=False) + "\n")
    gen = {"n_sent": len(gr), "kana_cer": ce / max(cl, 1), "sent_acc": ok / len(gr), "sent_acc_loose": okl / len(gr)}
n = len(jsut)
out = {
    "ckpt": str(a.ckpt),
    "step": meta["step"],
    "params_M": yomi.n_params(model) / 1e6,
    "jsut": {
        "n_sent": n,
        "kana_cer": agg["ce"] / agg["cl"],
        "sent_acc": agg["ok"] / n,
        "kana_cer_loose": agg["cel"] / agg["cll"],
        "sent_acc_loose": agg["okl"] / n,
        "phrase_boundary_p_r_f1": f1(agg["bnd_tp"], agg["bnd_fp"], agg["bnd_fn"]),
        "accent_nucleus_p_r_f1": f1(agg["nuc_tp"], agg["nuc_fp"], agg["nuc_fn"]),
        "accent_phrase_acc": agg["ap_ok"] / max(agg["ap_tot"], 1),
    },
    "hard": {"n_sent": len(rows), "sent_acc": sum(c["ok"] for c in cats.values()) / len(rows), "by_category": {k: v["ok"] / v["n"] for k, v in cats.items()}},
    **({"general": gen} if gen else {}),
    "eval_seconds": time.time() - t0,
    "errors_sample": errs[:10],
}
print(json.dumps(out, ensure_ascii=False, indent=1))
if a.out:
    json.dump(out, open(a.out, "w"), ensure_ascii=False, indent=1)
