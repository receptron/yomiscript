"""eval/ の指標で評価 (JSUT 280文 + ハードセット)。 python evaluate.py --ckpt ckpt/tiny

韻律 (句境界・アクセント核) は出力のカナ+記号列を文字単位で正解の kana_prosody と整列して比較する。
pyopenjtalk ベースラインは音素単位の比較なので、数値は近いが厳密に同一の手順ではない。
"""
import argparse, json, sys, time
from pathlib import Path

import mlx.core as mx

import yomi

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "eval/scripts"))
from metrics import edit_distance, f1, loose_kana, norm_kana, prosody_compare

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="ckpt/tiny")
ap.add_argument("--dtype", default=None, choices=["float32", "bfloat16", "float16"])
ap.add_argument("--pkm", action="append", default=None, help="差し替える学習型メモリ *.mem.safetensors (複数可/カンマ区切り, 積み重ね)")
ap.add_argument("--out", type=Path)
a = ap.parse_args()
model, sv, tv, meta = yomi.load(a.ckpt, getattr(mx, a.dtype) if a.dtype else None, memory=a.pkm)
jsut = [json.loads(l) for l in open(REPO / "eval/data/jsut_basic5000_subset.jsonl", encoding="utf-8")]
t0 = time.time()
preds = yomi.predict(model, sv, tv, [r["text"] for r in jsut])
agg = dict.fromkeys(["ce", "cl", "ok", "cel", "cll", "okl", "bnd_tp", "bnd_fp", "bnd_fn", "nuc_tp", "nuc_fp", "nuc_fn", "ap_ok", "ap_tot"], 0)
errs = []
for r, p in zip(jsut, preds):
    g, q = norm_kana(r["kana_prosody"]), norm_kana(p)
    e = edit_distance(g, q); agg["ce"] += e; agg["cl"] += len(g); agg["ok"] += e == 0
    el = edit_distance(loose_kana(g), loose_kana(q)); agg["cel"] += el; agg["cll"] += len(loose_kana(g)); agg["okl"] += el == 0
    res = prosody_compare(list(r["kana_prosody"]), list(p))
    for k in ["bnd_tp", "bnd_fp", "bnd_fn", "nuc_tp", "nuc_fp", "nuc_fn", "ap_ok", "ap_tot"]:
        agg[k] += res[k]
    if e:
        errs.append({"id": r["id"], "text": r["text"], "gold": g, "pred": q})
rows = [l.rstrip("\n").split("\t") for l in open(REPO / "eval/data/hard_set.tsv", encoding="utf-8") if l.strip() and not l.startswith("#")]
hp = yomi.predict(model, sv, tv, [x[2] for x in rows])
cats = {}
for (hid, cat, text, gold, *_), p in zip(rows, hp):
    gs = [norm_kana(x) for x in gold.split("|")]
    e = min(edit_distance(x, norm_kana(p)) for x in gs)
    c = cats.setdefault(cat, {"n": 0, "ok": 0}); c["n"] += 1; c["ok"] += e == 0
n = len(jsut)
out = {"ckpt": str(a.ckpt), "step": meta["step"], "params_M": yomi.n_params(model) / 1e6,
       "jsut": {"n_sent": n, "kana_cer": agg["ce"] / agg["cl"], "sent_acc": agg["ok"] / n,
                "kana_cer_loose": agg["cel"] / agg["cll"], "sent_acc_loose": agg["okl"] / n,
                "phrase_boundary_p_r_f1": f1(agg["bnd_tp"], agg["bnd_fp"], agg["bnd_fn"]),
                "accent_nucleus_p_r_f1": f1(agg["nuc_tp"], agg["nuc_fp"], agg["nuc_fn"]),
                "accent_phrase_acc": agg["ap_ok"] / max(agg["ap_tot"], 1)},
       "hard": {"n_sent": len(rows), "sent_acc": sum(c["ok"] for c in cats.values()) / len(rows),
                "by_category": {k: v["ok"] / v["n"] for k, v in cats.items()}},
       "eval_seconds": time.time() - t0, "errors_sample": errs[:10]}
print(json.dumps(out, ensure_ascii=False, indent=1))
if a.out:
    json.dump(out, open(a.out, "w"), ensure_ascii=False, indent=1)
