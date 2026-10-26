"""地名の読み (mem3) の学習・評価データを郵便番号データ (日本郵便 utf_ken_all.csv, 著作権主張なし) から作る。
地名スパンの読みは KEN_ALL のカナに強制 (aug/names.label)、他の部分とアクセントは pyopenjtalk。
地名単位 (市区町村・町域) の 10% を評価専用 (unseen) にする。生データは data/geo/ (gitignore, 無ければ取得)。
  python tools/build_place_data.py [--out data/places] [--n-train 30000] [--n-eval 500] [--n-neg 6000]
出力: places_train.jsonl, places_eval_seen.jsonl, places_eval_unseen.jsonl, places_hardneg.jsonl (一般文・地名なし), places_stats.json
各行は names と同じ形 (names=地名スパン, name_pron, name_target) なので train.py の gate-sup / leak-kl と eval_names.py がそのまま使える。"""
import argparse, csv, io, json, random, re, sys, urllib.request, zipfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "aug"))
from mold import to_pron  # noqa: E402
from names import label, name_region  # noqa: E402
sys.path.insert(0, str(HERE / "tools"))
from place_label_audit import audit_row, norm_kana  # noqa: E402
SAFE = {"一致", "一致(分割のみ)", "表記 (ヅ/オオ等)", "長音", "町 チョウ/マチ", "村 ソン/ムラ", "ケ/ガ"}  # --confident で残すずれ

GEO_URL = "https://www.post.japanpost.jp/service/search/zipcode/download/utf/zip/utf_ken_all.zip"
T_ONE = ["{P}に行きました。", "{P}駅で降りる。", "{P}に住んでいます。", "{P}から来ました。", "{P}の天気は晴れです。",
         "明日は{P}へ出張です。", "{P}出身です。", "{P}で会議があります。", "{P}の祭りは有名だ。", "週末に{P}を訪れた。",
         "次は{P}に止まります。", "{P}まで車で一時間かかる。", "{P}の近くに川がある。", "実家は{P}です。"]
T_ADDR = ["住所は{P}です。", "{P}に引っ越しました。", "{P}まで送ってください。", "本社は{P}にあります。",
          "お届け先は{P}です。", "会場は{P}の公民館です。"]
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--geo", default=str(HERE / "data/geo/utf_ken_all.csv"))
    ap.add_argument("--out", type=Path, default=HERE / "data/places")
    ap.add_argument("--n-train", type=int, default=30000); ap.add_argument("--n-eval", type=int, default=500)
    ap.add_argument("--n-neg", type=int, default=6000); ap.add_argument("--unseen-frac", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--no-kana-norm", action="store_true", help="郵便番号の読みを発音形 (ヅ→ズ, オオ→オー, イイ→イー) に直さない (v12/v13 の挙動)")
    ap.add_argument("--confident", action="store_true",
                    help="学習データは pyopenjtalk との差が表記・長音・町村 (チョウ/マチ, ソン/ムラ)・ケ/ガ だけの文に限る (評価は全部残す)")
    a = ap.parse_args(); rng = random.Random(a.seed)
    pref, city, town = read_ken(a.geo)
    units = sorted({cs for _, cs in city} | {ts for _, _, ts in town}); rng.shuffle(units)
    unseen = set(units[:int(len(units) * a.unseen_frac)])
    a.out.mkdir(parents=True, exist_ok=True)
    stats = {"pref": len(pref), "city": len(city), "town": len(town), "unseen_units": len(unseen)}
    C, Tn = sorted(city.items()), sorted(town.items())

    def sample(split):
        """(text, forced, pron, names)。評価対象の単位 (市区町村 or 町域) が seen/unseen 側から選ばれる。"""
        ok = (lambda s: s in unseen) if split == "unseen" else (lambda s: s not in unseen)
        kind = rng.choices(["city", "town", "addr", "pref"], [0.35, 0.3, 0.3, 0.05 if split != "unseen" else 0])[0]
        if kind == "pref":
            ps = rng.choice(sorted(pref)); parts = [(ps, pref[ps])]
        elif kind == "city":
            (ps, cs), ck = rng.choice(C)
            if not ok(cs):
                return None
            parts = [(cs, ck)]
        else:
            (ps, cs, ts), tk = rng.choice(Tn)
            if not ok(ts) or (ps, cs) not in city or (split != "unseen" and cs in unseen):
                return None
            parts = [(ts, tk)] if kind == "town" else [(ps, pref[ps]), (cs, city[(ps, cs)]), (ts, tk)]
        P = "".join(s for s, _ in parts)
        text = rng.choice(T_ADDR if kind == "addr" else [t for t in T_ONE if kind != "pref" or "駅" not in t]).format(P=P); st = text.index(P)
        forced, i = [], st
        for s, k in parts:
            forced.append((i, i + len(s), to_pron(k) if a.no_kana_norm else norm_kana(k))); i += len(s)
        return text, forced, "".join(p for *_, p in forced), [s for s, _ in parts], kind

    def gen(split, n, fn):
        rows, c, seen, tries = [], Counter(), set(), 0
        while len(rows) < n and tries < n * 20:
            tries += 1; x = sample(split)
            if not x or x[0] in seen:
                continue
            text, forced, pron, nm, kind = x; seen.add(text)
            tg, info = label(text, forced)
            if tg is None:
                c[info] += 1; continue
            c.update(info)
            rows.append({"id": f"{fn}:{len(rows)}", "text": text, "target": tg, "source": "places", "src": "places",
                         "name_pron": pron, "name_target": name_region(tg, pron), "sex": "男性", "kind": kind, "names": nm,
                         "parts_pron": [p for *_, p in forced]})
        if a.confident and fn == "places_train":  # 生成後に絞る (乱数列を変えないので評価セットは --confident なしと同じ)
            cats = [{x[3] for x in audit_row(r)} for r in rows]
            c["confident_drop"] = sum(not (x <= SAFE) for x in cats)
            rows = [r for r, x in zip(rows, cats) if x <= SAFE]
        with open(a.out / f"{fn}.jsonl", "w", encoding="utf-8") as f:
            f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
        stats[fn] = {"n": len(rows), **dict(c)}; print(fn, stats[fn], flush=True)

    gen("seen", a.n_train, "places_train"); gen("seen", a.n_eval, "places_eval_seen"); gen("unseen", a.n_eval, "places_eval_unseen")
    # 一般文の負例: 地名に多い漢字を含むが pyopenjtalk で地名・人名 (固有名詞) が無い学習文 (学習データ作成時のみの判定)
    import pyopenjtalk
    pc = Counter(c for s in list(units) + list(pref) for c in s if "一" <= c <= "鿿")
    rows = [json.loads(l) for l in open(HERE / "data/train.jsonl", encoding="utf-8")]; rng.shuffle(rows)
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
    stats["hardneg"] = len(neg); print("places_hardneg", len(neg))
    json.dump(stats, open(a.out / "places_stats.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
