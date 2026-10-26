"""人名の評価: 読み正解率とアクセント (名前部分の一致, 文全体の境界/核 F1)。辞書メモリのあり/なしを比較。
  python eval_names.py --ckpt ckpt/tiny_aug_names [--data data/names] [--out results.json]"""
import argparse, json, sys
from pathlib import Path

import mold, yomi

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "eval/scripts"))
from metrics import f1, prosody_compare  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="ckpt/tiny_aug")
ap.add_argument("--data", type=Path, default=Path(__file__).resolve().parent / "data/names")
ap.add_argument("--limit", type=int, default=0)
ap.add_argument("--pkm", action="append", default=None, help="差し替える学習型メモリ *.mem.safetensors (複数可/カンマ区切り, 積み重ね)")
ap.add_argument("--out", type=Path)
a = ap.parse_args()
model, sv, tv, _ = yomi.load(a.ckpt, memory=a.pkm)
D = REPO / "dict/names"
router = mold.MemoryRouter([mold.LexMemory.from_file(D / "surnames.koedict"), mold.LexMemory.from_file(D / "given_names.koedict")])
strip = lambda s: "".join(c for c in s if c not in "^$?#_[]")
res = {"ckpt": a.ckpt}
for split in ["names_eval_seen", "names_eval_unseen"]:
    rows = [json.loads(l) for l in open(a.data / f"{split}.jsonl", encoding="utf-8")]
    rows = rows[:a.limit] if a.limit else rows
    for mode in ["model", "memory"]:
        preds = []
        for sex in ["男性", "女性"]:  # 性別ごとにまとめて文脈を渡す
            idx = [i for i, r in enumerate(rows) if r["sex"] == sex]
            ps = yomi.predict(model, sv, tv, [rows[i]["text"] for i in idx],
                              router=router if mode == "memory" else None, context=[sex])
            preds += list(zip(idx, ps))
        preds = [p for _, p in sorted(preds)]
        rd = acc = sent = 0; agg = dict.fromkeys(["bnd_tp", "bnd_fp", "bnd_fn", "nuc_tp", "nuc_fp", "nuc_fn"], 0)
        for r, p in zip(rows, preds):
            rd += r["name_pron"] in strip(p)
            acc += bool(r["name_target"]) and r["name_target"] in p
            sent += strip(p) == strip(r["target"])
            c = prosody_compare(list(r["target"]), list(p))
            for k in agg: agg[k] += c[k]
        n = len(rows)
        res[f"{split}/{mode}"] = {"n": n, "name_reading_acc": rd / n, "name_prosody_exact": acc / n, "sent_kana_acc": sent / n,
                                  "boundary_f1": f1(agg["bnd_tp"], agg["bnd_fp"], agg["bnd_fn"])[2],
                                  "accent_f1": f1(agg["nuc_tp"], agg["nuc_fp"], agg["nuc_fn"])[2]}
        print(split, mode, json.dumps(res[f"{split}/{mode}"], ensure_ascii=False), flush=True)
if a.out:
    json.dump(res, open(a.out, "w"), ensure_ascii=False, indent=1)
