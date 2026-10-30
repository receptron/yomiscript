"""Classify the mismatches between "the KEN_ALL reading" and "pyopenjtalk's in-sentence reading" in the place-name data
(for building and analyzing training data).
  python tools/place_label_audit.py [--data data/places] [--files places_train places_eval_seen] [--preds p.jsonl]
With --preds (eval_names predictions {"id","pred"}), counts the evaluation errors by mismatch kind."""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
from mold import to_pron  # noqa: E402

DAK = str.maketrans("ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ", "カキクケコサシスセソタチツテトハヒフヘホハヒフヘホ")


_ORow = set("オコソトノホモヨロゴゾドボポョォ")
_IRow = set("イキシチニヒミリギジヂビピ")


def norm_kana(k):
    """Postal-code readings (close to spelling) to the pronounced form: to_pron (オウ→オー, エイ→エー) + ヅ→ズ ヂ→ジ + o-row + オ → ー (オオタ→オータ)."""
    k = to_pron(k).replace("ヅ", "ズ").replace("ヂ", "ジ")
    out = []
    for c in k:
        out.append("ー" if out and ((c == "オ" and out[-1] in _ORow) or (c == "イ" and out[-1] in _IRow)) else c)
    return "".join(out)


def ojt_spans(text):
    import pyopenjtalk

    out, i = [], 0
    for f in pyopenjtalk.run_frontend(text):
        out.append((i, i + len(f["string"]), f["pron"].replace("’", "")))
        i += len(f["string"])
    return out


def ojt_read(text, s, e):
    """Pronunciation of the morphemes covering [s,e) (None if the boundaries do not line up)."""
    sp = [x for x in ojt_spans(text) if x[0] < e and x[1] > s]
    if not sp or sp[0][0] != s or sp[-1][1] != e:
        return None, len(sp)
    return "".join(p for *_, p in sp), len(sp)


def category(surf, gold, ojt, nm):
    if ojt is None:
        return "境界ずれ"
    if ojt == gold:
        return "一致" if nm == 1 else "一致(分割のみ)"
    if norm_kana(gold) == norm_kana(ojt):
        return "表記 (ヅ/オオ等)"
    g, o = gold, ojt
    if g.replace("ー", "") == o.replace("ー", ""):
        return "長音"
    if re.search("[ケヶが]", surf) and g.replace("ガ", "ケ") == o.replace("ガ", "ケ"):
        return "ケ/ガ"
    if "町" in surf and re.sub("チョ[ーウ]", "マチ", g) == re.sub("チョ[ーウ]", "マチ", o):
        return "町 チョウ/マチ"
    if "村" in surf and g.replace("ソン", "ムラ") == o.replace("ソン", "ムラ"):
        return "村 ソン/ムラ"
    if g.translate(DAK) == o.translate(DAK):
        return "濁り(連濁)"
    if len(g) == len(o) and sum(a != b for a, b in zip(g, o, strict=False)) == 1:
        return "1字違い"
    return "別の読み"


def audit_row(r):
    """Classification of each place-name span. Returns [(surface, gold, ojt, cat)]."""
    out, pos = [], 0
    golds = split_gold(r)
    for surf, gold in zip(r["names"], golds, strict=False):
        s = r["text"].find(surf, pos)
        e = s + len(surf)
        pos = e
        o, nm = ojt_read(r["text"], s, e)
        out.append((surf, gold, o, category(surf, gold, o, nm) if gold else None))
    return out


def split_gold(r):
    """Split name_pron into the spans (the row's parts if present, otherwise one span)."""
    if r.get("parts_pron"):
        return r["parts_pron"]
    if len(r["names"]) == 1:
        return [r["name_pron"]]
    return [None] * len(r["names"])


def audit_preds(fn, n_ex=3):
    """Classify the failed rows of eval_names.py --preds per span: correct / as pyopenjtalk (= label-side difference, with the audit category)
    / neither (model error)."""

    def strip(s):
        return "".join(c for c in s if c not in "^$?#_[]")

    c, ex = Counter(), {}
    for l in open(fn, encoding="utf-8"):
        r = json.loads(l)
        p = strip(r["pred"])
        for surf, gold, o, cat in audit_row(r):
            if gold is None:
                continue
            k = "正解" if gold in p else f"ojt通り:{cat}" if o and norm_kana(o) in p else f"モデル誤り:{cat}"
            c[k] += 1
            ex.setdefault(k, []).append(f"{surf} gold{gold} ojt{o}")
    n = sum(c.values())
    print(f"{fn} spans in failed sentences {n}: " + "  ".join(f"{k} {v/n*100:.0f}%" for k, v in c.most_common(10)))
    g = Counter()
    for k, v in c.items():
        g[
            "正解"
            if k == "正解"
            else "ラベル側(ojt通り)"
            if k.startswith("ojt")
            else "モデル誤り(正=ojt)"
            if k.split(":")[1] in ("一致", "一致(分割のみ)")
            else "モデル誤り(正≠ojt)"
        ] += v
    print("  counts: " + "  ".join(f"{k} {v}" for k, v in g.most_common()))
    for k, _ in c.most_common(4):
        print(f"  {k}: " + " / ".join(ex[k][:n_ex]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=HERE / "data/places")
    ap.add_argument("--files", nargs="*", default=["places_train", "places_eval_seen", "places_eval_unseen"])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--preds", type=Path)
    ap.add_argument("--examples", type=int, default=3)
    a = ap.parse_args()
    if a.preds:
        return audit_preds(a.preds, a.examples)
    OK = {"一致", "一致(分割のみ)"}
    for fn in a.files:
        rows = [json.loads(l) for l in open(a.data / f"{fn}.jsonl", encoding="utf-8")]
        rows = rows[: a.limit] if a.limit else rows
        c, ex = Counter(), {}
        for r in rows:
            for surf, g, o, cat in audit_row(r):
                if g is None:
                    continue
                c[cat] += 1
                ex.setdefault(cat, []).append(f"{surf}:{g}/{o}")
        n = sum(c.values())
        rc = [{x[3] for x in audit_row(r)} for r in rows]
        print(
            f"{fn}: sentence-level pyopenjtalk match {sum(x <= OK for x in rc)/len(rc)*100:.1f}%  "
            f"spelling differences only {sum(x <= OK | {'表記 (ヅ/オオ等)', '長音'} for x in rc)/len(rc)*100:.1f}%  "
            f"up to 町/村 differences {sum(x <= OK | {'表記 (ヅ/オオ等)', '長音', '町 チョウ/マチ', '村 ソン/ムラ', 'ケ/ガ'} for x in rc)/len(rc)*100:.1f}%"
        )
        print(f"{fn} ({n} spans): " + "  ".join(f"{k} {v/n*100:.1f}%" for k, v in c.most_common()))
        for k, _ in c.most_common():
            if k not in ("一致", "一致(分割のみ)"):
                print(f"   {k}: " + " ".join(ex[k][: a.examples]))


if __name__ == "__main__":
    main()
