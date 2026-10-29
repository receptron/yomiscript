"""人名の評価: 読み正解率とアクセント (名前部分の一致, 文全体の境界/核 F1)。辞書メモリのあり/なしを比較。
python eval_names.py --ckpt ckpt/tiny_aug_names [--data data/names] [--out results.json]"""

import argparse
import json
import sys
from pathlib import Path

import yomi

import mold

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "eval/scripts"))
from metrics import f1, prosody_compare  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="ckpt/tiny_aug")
ap.add_argument("--data", type=Path, default=Path(__file__).resolve().parent / "data/names")
ap.add_argument("--limit", type=int, default=0)
ap.add_argument("--pkm", action="append", default=None, help="差し替える学習型メモリ *.mem.safetensors (複数可/カンマ区切り, 積み重ね)")
ap.add_argument("--out", type=Path)
ap.add_argument("--splits", nargs="*", default=["names_eval_seen", "names_eval_unseen"])
ap.add_argument("--preds", type=Path, help="model モードで人名(地名)の読みを外した行を jsonl で書き出す (place_label_audit.py --preds で分類)")
ap.add_argument("--model-only", action="store_true", help="辞書メモリ (router) ありの評価を省く (地名など)")
a = ap.parse_args()
model, sv, tv, _ = yomi.load(a.ckpt, memory=a.pkm)
D = REPO / "dict/names"
router = mold.MemoryRouter([mold.LexMemory.from_file(D / "surnames.koedict"), mold.LexMemory.from_file(D / "given_names.koedict")])


def strip(s):
    return "".join(c for c in s if c not in "^$?#_[]")


res = {"ckpt": a.ckpt}
fails = []
for split in a.splits:
    rows = [json.loads(l) for l in open(a.data / f"{split}.jsonl", encoding="utf-8")]
    rows = rows[: a.limit] if a.limit else rows
    for mode in ["model"] + ([] if a.model_only else ["memory"]):
        preds = []
        for sex in ["男性", "女性"]:  # 性別ごとにまとめて文脈を渡す
            idx = [i for i, r in enumerate(rows) if r["sex"] == sex]
            ps = yomi.predict(model, sv, tv, [rows[i]["text"] for i in idx], router=router if mode == "memory" else None, context=[sex])
            preds += list(zip(idx, ps, strict=False))
        preds = [p for _, p in sorted(preds)]
        rd = acc = sent = 0
        agg = dict.fromkeys(["bnd_tp", "bnd_fp", "bnd_fn", "nuc_tp", "nuc_fp", "nuc_fn"], 0)
        for r, p in zip(rows, preds, strict=False):
            rd += (ok := r["name_pron"] in strip(p))
            if not ok and mode == "model":
                fails.append({**r, "split": split, "pred": p})
            acc += bool(r["name_target"]) and r["name_target"] in p
            sent += strip(p) == strip(r["target"])
            c = prosody_compare(list(r["target"]), list(p))
            for k in agg:
                agg[k] += c[k]
        n = len(rows)
        res[f"{split}/{mode}"] = {
            "n": n,
            "name_reading_acc": rd / n,
            "name_prosody_exact": acc / n,
            "sent_kana_acc": sent / n,
            "boundary_f1": f1(agg["bnd_tp"], agg["bnd_fp"], agg["bnd_fn"])[2],
            "accent_f1": f1(agg["nuc_tp"], agg["nuc_fp"], agg["nuc_fn"])[2],
        }
        print(split, mode, json.dumps(res[f"{split}/{mode}"], ensure_ascii=False), flush=True)
if a.preds:
    with open(a.preds, "w", encoding="utf-8") as f:
        f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in fails)
if a.out:
    json.dump(res, open(a.out, "w"), ensure_ascii=False, indent=1)
