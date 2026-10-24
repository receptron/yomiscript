"""人名入り学習文の生成 (MoLD / 名前の読み・アクセント対策)。
苗字 (dict/names/surnames_top200.csv) × 下の名前 (given_names_by_generation.csv, 性別つき) をテンプレートに入れ、
pyopenjtalk で韻律 (アクセント/句境界) を付ける。名前の読みは辞書の読みに **強制** する:
  - pyopenjtalk の読みが辞書と一致 → そのまま (自然なアクセント)
  - 不一致 → NJD の該当ノードを辞書の読みに書き換え、アクセント核は「読みのカタカナだけを pyopenjtalk に通した推定」を使う
最後にラベルのカナに名前の読みが入っていることを検証する。

  python aug/names.py --out data/names --n-train 30000 --n-eval 1000 [--estimated skip|down|keep]
出力: names_train.jsonl (学習用, src=names), names_eval_seen.jsonl, names_eval_unseen.jsonl (未学習の名前), names_stats.json
"""
import argparse, csv, json, random, re, sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(REPO / "eval/scripts"))
from mold import hira2kata, morae, to_pron  # noqa: E402

HON = {"男性": ["さん", "くん", "様", "氏"], "女性": ["さん", "ちゃん", "様", "氏"]}
CUE = {"男性": ["彼", "息子の", "兄の", "弟の", "夫の", "父の"], "女性": ["彼女", "娘の", "姉の", "妹の", "妻の", "母の"]}
T_FULL = ["{F}{H}が来ました。", "{F}{H}に電話をかけた。", "昨日、{F}{H}と会いました。", "担当は{F}{H}です。",
          "{F}{H}の意見を聞いてみよう。", "{F}が優勝した。", "受付で{F}と名乗った。", "{C}{F}は医者です。",
          "{F}{H}から手紙が届いた。", "司会の{F}{H}をお呼びします。", "{F}{H}はどこにいますか。", "私は{F}と申します。"]
T_GIV = ["{G}{H}、おはよう。", "{C}{G}が生まれた。", "{G}{H}はいつも元気だね。", "{G}{H}を見かけた。",
         "{G}{H}に本を貸した。", "{C}{G}{H}が笑った。", "あの子の名前は{G}です。"]
T_SUR = ["{S}{H}の家はこの近くです。", "{S}{H}、こちらへどうぞ。", "{S}{H}が会議に遅れた。", "{S}{H}に確認します。"]


def load(est):
    sur = [r for r in csv.DictReader(open(REPO / "dict/names/surnames_top200.csv", encoding="utf-8"))]
    S = [(r["surname"], to_pron(hira2kata(r["reading"]))) for r in sur]
    giv, w = {}, {}
    for r in csv.DictReader(open(REPO / "dict/names/given_names_by_generation.csv", encoding="utf-8")):
        e = r.get("is_estimated") == "1"
        if e and est == "skip":
            continue
        k = (r["name"], to_pron(hira2kata(r["reading"])), r["sex"])
        giv[k] = max(giv.get(k, 0), 0.3 if (e and est == "down") else 1.0)
    return S, [(k, v) for k, v in giv.items()]


def _acc_of(pron):
    import pyopenjtalk
    f = pyopenjtalk.run_frontend(pron)
    return f[0]["acc"] if len(f) == 1 else 0


def label(text, forced):
    """forced: [(start, end, pron)] (text 上の文字位置)。戻り値 (target, info) または (None, 理由)。"""
    import pyopenjtalk
    from run_pyopenjtalk_baseline import pp_symbols
    feats = pyopenjtalk.run_frontend(text)
    pos, spans = 0, []
    for f in feats:
        k = text.find(f["string"], pos); spans.append((k, k + len(f["string"]))); pos = k + len(f["string"])
    info = Counter()
    for s, e, pron in sorted(forced, reverse=True):
        idx = [i for i, (a, b) in enumerate(spans) if a >= s and b <= e]
        if not idx or spans[idx[0]][0] != s or spans[idx[-1]][1] != e:
            return None, "名前が形態素境界と合わない"
        cur = "".join(feats[i]["pron"] for i in idx).replace("’", "")
        if len(idx) == 1 and cur == pron:
            info["一致"] += 1; continue
        f0 = dict(feats[idx[0]])
        f0.update(string=text[s:e], pron=pron, read=pron, mora_size=len(morae(pron)), acc=_acc_of(pron))
        feats[idx[0]:idx[-1] + 1] = [f0]; spans[idx[0]:idx[-1] + 1] = [(s, e)]
        info["強制"] += 1
    kana = "".join(f["pron"] for f in feats if f["pron"] != "*" and f["pron"] != "、").replace("’", "")
    kana = re.sub(r"[^\u30A1-\u30FAー]", "", kana)
    pp = pp_symbols(pyopenjtalk.make_label(feats))
    mo, out, i = morae(kana), [], 0
    for t in pp:
        if t in "^$?#_[]":
            out.append(t)
        elif t in ("a", "i", "u", "e", "o", "A", "I", "U", "E", "O", "N", "cl"):
            if i >= len(mo):
                return None, "モーラ数不一致"
            out.append(mo[i]); i += 1
    if i != len(mo) or not mo:
        return None, "モーラ数不一致"
    tg = "".join(out)
    plain = re.sub(r"[\^$?#_\[\]]", "", tg)
    if any(p not in plain for _, _, p in forced):
        return None, "名前の読みがラベルに無い"
    return tg, info


def name_region(target, pron):
    """target 中で名前の読みを覆う部分 (記号込み) を返す。名前のアクセント評価用。"""
    ks = [i for i, c in enumerate(target) if c not in "^$?#_[]"]
    st = "".join(target[i] for i in ks)
    j = st.find(pron)
    if j < 0:
        return None
    a, b = ks[j], ks[j + len(pron) - 1] + 1
    while b < len(target) and target[b] in "[]":
        b += 1
    return target[a:b]


def make(rng, S, G, kind):
    (g, gp, sex), _ = G
    s, sp = S
    H, C = rng.choice(HON[sex]), rng.choice(CUE[sex])
    if kind == "full":
        t = rng.choice(T_FULL); F = s + g
        text = t.format(F=F, H=H, C=C); st = text.index(F)
        return text, [(st, st + len(s), sp), (st + len(s), st + len(F), gp)], sp + gp, sex
    if kind == "giv":
        t = rng.choice(T_GIV); text = t.format(G=g, H=H, C=C); st = text.index(g, len(C) if "{C}" in t else 0)
        return text, [(st, st + len(g), gp)], gp, sex
    t = rng.choice(T_SUR); text = t.format(S=s, H=H); st = text.index(s)
    return text, [(st, st + len(s), sp)], sp, sex


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=HERE / "data/names")
    ap.add_argument("--n-train", type=int, default=30000)
    ap.add_argument("--n-eval", type=int, default=1000)
    ap.add_argument("--estimated", default="down", choices=["skip", "down", "keep"], help="is_estimated の行: 除外/重み0.3/そのまま")
    ap.add_argument("--unseen-frac", type=float, default=0.1, help="評価専用 (学習に出さない) 名前の割合")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    S, G = load(a.estimated)
    names = sorted({k[0] for k, _ in G}); rng.shuffle(names)
    unseen = set(names[:int(len(names) * a.unseen_frac)])
    Gs = [x for x in G if x[0][0] not in unseen]; Gu = [x for x in G if x[0][0] in unseen]
    a.out.mkdir(parents=True, exist_ok=True)
    stats = {"surnames": len(S), "given_rows": len(G), "unseen_names": len(unseen)}

    def gen(pool, n, fn):
        rows, c, seen = [], Counter(), set()
        wts = [w for _, w in pool]
        tries = 0
        while len(rows) < n and tries < n * 5:
            tries += 1
            kind = rng.choices(["full", "giv", "sur"], [0.5, 0.35, 0.15])[0]
            text, forced, pron, sex = make(rng, rng.choice(S), rng.choices(pool, wts)[0], kind)
            if text in seen:
                continue
            seen.add(text)
            tg, info = label(text, forced)
            if tg is None:
                c[info] += 1; continue
            c.update(info)
            rows.append({"id": f"{fn}:{len(rows)}", "text": text, "target": tg, "source": "names", "src": "names",
                         "name_pron": pron, "name_target": name_region(tg, pron), "sex": sex, "kind": kind,
                         "names": [text[s:e] for s, e, _ in forced]})
        with open(a.out / f"{fn}.jsonl", "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        stats[fn] = {"n": len(rows), **dict(c)}
        print(fn, stats[fn], flush=True)

    gen(Gs, a.n_train, "names_train")
    gen(Gs, a.n_eval, "names_eval_seen")
    gen(Gu, a.n_eval, "names_eval_unseen")
    json.dump(stats, open(a.out / "names_stats.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
