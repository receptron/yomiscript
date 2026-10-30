"""Build training and evaluation data for place-name readings (mem3) from the postal code data (Japan Post utf_ken_all.csv, no copyright claimed).
The reading of the place-name span is forced to the KEN_ALL kana (aug/names.label); the rest and the accent come from pyopenjtalk.
10% of the place-name units (municipalities, town areas) are kept for evaluation only (unseen). Raw data is in data/geo/ (gitignored, downloaded if missing).
  python tools/build_place_data.py [--out data/places] [--n-train 30000] [--n-eval 500] [--n-neg 6000]
Output: places_train.jsonl, places_eval_seen.jsonl, places_eval_unseen.jsonl, places_hardneg.jsonl (general sentences, no place names), places_stats.json
Each row has the same shape as names (names=place-name span, name_pron, name_target), so train.py's gate-sup / leak-kl and eval_names.py use it as is."""

import argparse
import csv
import io
import json
import random
import re
import sys
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "aug"))
from names import label, name_region  # noqa: E402

from mold import to_pron  # noqa: E402

sys.path.insert(0, str(HERE / "tools"))
from place_label_audit import audit_row, norm_kana  # noqa: E402

SAFE = {"一致", "一致(分割のみ)", "表記 (ヅ/オオ等)", "長音", "町 チョウ/マチ", "村 ソン/ムラ", "ケ/ガ"}  # mismatch kinds kept by --confident

GEO_URL = "https://www.post.japanpost.jp/service/search/zipcode/download/utf/zip/utf_ken_all.zip"
T_ONE = [
    "{P}に行きました。",
    "{P}駅で降りる。",
    "{P}に住んでいます。",
    "{P}から来ました。",
    "{P}の天気は晴れです。",
    "明日は{P}へ出張です。",
    "{P}出身です。",
    "{P}で会議があります。",
    "{P}の祭りは有名だ。",
    "週末に{P}を訪れた。",
    "次は{P}に止まります。",
    "{P}まで車で一時間かかる。",
    "{P}の近くに川がある。",
    "実家は{P}です。",
]
T_ADDR = ["住所は{P}です。", "{P}に引っ越しました。", "{P}まで送ってください。", "本社は{P}にあります。", "お届け先は{P}です。", "会場は{P}の公民館です。"]
KANA = re.compile(r"^[\u30A1-\u30FAー]+$")
SURF = re.compile(r"^[一-鿿々ヶケ\u3041-\u3096\u30A1-\u30FAー]{2,10}$")


def read_ken(path):
    p = Path(path)
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(GEO_URL, timeout=60).read())).extractall(p.parent)
    pref, city, town = {}, {}, {}
    for r in csv.reader(open(p, encoding="utf-8")):
        pk, ck, tk, ps, cs, ts = r[3], r[4], r[5], r[6], r[7], r[8]
        pref[ps] = pk
        if KANA.match(ck) and SURF.match(cs):
            city[(ps, cs)] = ck
        if KANA.match(tk) and SURF.match(ts) and "以下に" not in ts and not ts.endswith("一円"):
            town[(ps, cs, ts)] = tk
    return pref, city, town


def sample(g, split):
    """(text, forced, pron, names). The unit under evaluation (municipality or town area) is drawn from the seen/unseen side."""
    ok = (lambda s: s in g.unseen) if split == "unseen" else (lambda s: s not in g.unseen)
    kind = g.rng.choices(["city", "town", "addr", "pref"], [0.35, 0.3, 0.3, 0.05 if split != "unseen" else 0])[0]
    if kind == "pref":
        ps = g.rng.choice(sorted(g.pref))
        parts = [(ps, g.pref[ps])]
    elif kind == "city":
        (ps, cs), ck = g.rng.choice(g.C)
        if not ok(cs):
            return None
        parts = [(cs, ck)]
    else:
        (ps, cs, ts), tk = g.rng.choice(g.Tn)
        if not ok(ts) or (ps, cs) not in g.city or (split != "unseen" and cs in g.unseen):
            return None
        parts = [(ts, tk)] if kind == "town" else [(ps, g.pref[ps]), (cs, g.city[(ps, cs)]), (ts, tk)]
    P = "".join(s for s, _ in parts)
    text = g.rng.choice(T_ADDR if kind == "addr" else [t for t in T_ONE if kind != "pref" or "駅" not in t]).format(P=P)
    st = text.index(P)
    forced, i = [], st
    for s, k in parts:
        forced.append((i, i + len(s), to_pron(k) if g.a.no_kana_norm else norm_kana(k)))
        i += len(s)
    return text, forced, "".join(p for *_, p in forced), [s for s, _ in parts], kind


def gen(g, split, n, fn):
    rows, c, seen, tries = [], Counter(), set(), 0
    while len(rows) < n and tries < n * 20:
        tries += 1
        x = sample(g, split)
        if not x or x[0] in seen:
            continue
        text, forced, pron, nm, kind = x
        seen.add(text)
        tg, info = label(text, forced)
        if tg is None:
            c[info] += 1
            continue
        c.update(info)
        rows.append(
            {
                "id": f"{fn}:{len(rows)}",
                "text": text,
                "target": tg,
                "source": "places",
                "src": "places",
                "name_pron": pron,
                "name_target": name_region(tg, pron),
                "sex": "男性",
                "kind": kind,
                "names": nm,
                "parts_pron": [p for *_, p in forced],
            }
        )
    if (
        g.a.confident and fn == "places_train"
    ):  # filter after generation (the random sequence is unchanged, so the evaluation sets equal those without --confident)
        cats = [{x[3] for x in audit_row(r)} for r in rows]
        c["confident_drop"] = sum(not (x <= SAFE) for x in cats)
        rows = [r for r, x in zip(rows, cats, strict=False) if x <= SAFE]
    with open(g.a.out / f"{fn}.jsonl", "w", encoding="utf-8") as f:
        f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    g.stats[fn] = {"n": len(rows), **dict(c)}
    print(fn, g.stats[fn], flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--geo", default=str(HERE / "data/geo/utf_ken_all.csv"))
    ap.add_argument("--out", type=Path, default=HERE / "data/places")
    ap.add_argument("--n-train", type=int, default=30000)
    ap.add_argument("--n-eval", type=int, default=500)
    ap.add_argument("--n-neg", type=int, default=6000)
    ap.add_argument("--unseen-frac", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument(
        "--no-kana-norm",
        action="store_true",
        help="do not convert postal readings to the pronounced form (ヅ→ズ, オオ→オー, イイ→イー) (the v12/v13 behaviour)",
    )
    ap.add_argument(
        "--confident",
        action="store_true",
        help="keep only training sentences that differ from pyopenjtalk just in spelling, long vowels, 町/村 (チョウ/マチ, ソン/ムラ) or ケ/ガ (eval: all)",
    )
    a = ap.parse_args()
    rng = random.Random(a.seed)
    pref, city, town = read_ken(a.geo)
    units = sorted({cs for _, cs in city} | {ts for _, _, ts in town})
    rng.shuffle(units)
    unseen = set(units[: int(len(units) * a.unseen_frac)])
    a.out.mkdir(parents=True, exist_ok=True)
    stats = {"pref": len(pref), "city": len(city), "town": len(town), "unseen_units": len(unseen)}
    C, Tn = sorted(city.items()), sorted(town.items())

    g = SimpleNamespace(a=a, rng=rng, pref=pref, city=city, unseen=unseen, C=C, Tn=Tn, stats=stats)
    gen(g, "seen", a.n_train, "places_train")
    gen(g, "seen", a.n_eval, "places_eval_seen")
    gen(g, "unseen", a.n_eval, "places_eval_unseen")
    # Negative examples from general sentences: training sentences containing kanji common in place names but in which pyopenjtalk
    # finds no place or personal name (proper noun). Judged only when building training data
    import pyopenjtalk

    pc = Counter(c for s in list(units) + list(pref) for c in s if "一" <= c <= "鿿")
    rows = [json.loads(l) for l in open(HERE / "data/train.jsonl", encoding="utf-8")]
    rng.shuffle(rows)
    gcnt = Counter(c for r in rows[:20000] for c in r["text"])
    bias = set(sorted((c for c in pc if gcnt[c] >= 3), key=lambda c: -pc[c] / (gcnt[c] + 20))[:400])
    neg = []
    for r in rows:
        if len(neg) >= a.n_neg:
            break
        if r.get("names") or not any(c in bias for c in r["text"]) or len(r["text"]) > 80:
            continue
        if any(f["pos_group1"] == "固有名詞" for f in pyopenjtalk.run_frontend(r["text"])):
            continue
        neg.append({**r, "hardneg": 1})
    with open(a.out / "places_hardneg.jsonl", "w", encoding="utf-8") as f:
        f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in neg)
    stats["hardneg"] = len(neg)
    print("places_hardneg", len(neg))
    json.dump(stats, open(a.out / "places_stats.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
