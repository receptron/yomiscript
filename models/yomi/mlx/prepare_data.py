"""Yomi-0 学習データ作成: テキスト -> カナ+韻律記号 (jsut-label e2e_symbol 形式)。

出力 (data/): train.jsonl, dev.jsonl, [distill.jsonl], vocab.json
  各行 {"id", "text", "target", "source"}  target 例: ^ミ[ズヲ#マ[レ]ーシアカラ$
  記号: ^ 文頭 / $ 文末 / ? 疑問文末 / # アクセント句境界 / _ ポーズ / [ ピッチ上昇 / ] アクセント核

人手ラベル: jsut-label BASIC5000 (eval/data の280文は除外)。ライセンスは eval/LICENSE_DATA.md 参照。
蒸留 (任意, --distill-text): 1行1文のテキストを pyopenjtalk でラベル付け。source="distill"。
  ※蒸留データの品質は pyopenjtalk 以下に頭打ちになる (誤読もそのまま学習する)。

python prepare_data.py                      # jsut-label を自動 clone
python prepare_data.py --jsut-label /path/to/jsut-label --distill-text my_corpus.txt --distill-max 50000
python prepare_data.py --aug        # data/aug_text/*.txt (aug/build_text.py で作成) + ルールセット(aug/rules.py) を追加
  各行に "src": "distill" (pyopenjtalk 蒸留) / "rule" (ルールで読みを決め pyopenjtalk で韻律付与) を付ける。
  フィルタ統計は data/aug_stats.json に出力。
"""

import argparse
import json
import os
import random
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
EVAL_JSUT = REPO / "eval/data/jsut_basic5000_subset.jsonl"
SMALL = set("ャュョァィゥェォヮ")


def load_jsut(root):
    import yaml

    tk = yaml.safe_load(open(root / "text_kana/basic5000.yaml", encoding="utf-8"))
    kata = yaml.safe_load(open(root / "e2e_symbol/katakana.yaml", encoding="utf-8"))
    excl = {json.loads(l)["id"] for l in open(EVAL_JSUT, encoding="utf-8")}
    rows = []
    for k in sorted(tk):
        if k in excl or k not in kata:
            continue
        rows.append({"id": k, "text": tk[k]["text_level2"], "target": kata[k], "source": "jsut"})
    return rows, len(excl)


def morae(kana):
    out = []
    for c in kana:
        if c in SMALL and out:
            out[-1] += c
        else:
            out.append(c)
    return out


def distill_one(text):
    """pyopenjtalk: カナ + 韻律記号を作る。韻律はモーラ位置に差し込む。失敗時 None。"""
    import pyopenjtalk

    sys.path.insert(0, str(REPO / "eval/scripts"))
    from run_pyopenjtalk_baseline import pp_symbols

    kana = re.sub(r"[^\u30A1-\u30FAー]", "", pyopenjtalk.g2p(text, kana=True))
    pp = pp_symbols(pyopenjtalk.extract_fullcontext(text))
    mo, out, i = morae(kana), [], 0
    for t in pp:
        if t in "^$?#_[]":
            out.append(t)
        elif t in ("a", "i", "u", "e", "o", "A", "I", "U", "E", "O", "N", "cl"):
            if i >= len(mo):
                return None
            out.append(mo[i])
            i += 1
    return "".join(out) if i == len(mo) and mo else None


import unicodedata

UNK_OK = re.compile(r"^[、。，．！？「」『』・ー〜\s]*$")


def _h2k(s):
    return "".join(chr(ord(c) + 0x60) if "\u3041" <= c <= "\u3096" else c for c in s)


def _loose(s):
    # 長音の書き方 (きょう/キョー) の違いを吸収するゆるい比較用
    return re.sub(r"[ーウイ]", "", _h2k(s)).replace("ヲ", "オ").replace("ヅ", "ズ").replace("ヂ", "ジ")


def label_ruby(item):
    """青空文庫の文: ルビを正解の制約にする。戻り値 (row, why, n_ruby, n_agree)"""
    rid, text, ruby = item
    row, why = _label(("distill_aozora", rid, text, text, None))
    if not ruby:
        return row, why, 0, 0
    if row is None:
        agree = 0
    else:
        kana = _loose(re.sub(r"[^\u30A1-\u30FAー]", "", row["target"]))
        agree = sum(_loose(y) in kana for _, y in ruby)
        if agree == len(ruby):
            row["ruby_checked"] = True
            return row, "ok(ルビと一致)", len(ruby), agree
    # 不一致: 親文字をルビのカタカナに置き換えて付け直し、全ルビ読みが入っていれば採用 (src="ruby")
    pron = text
    for b, y in ruby:
        if b not in pron:
            return None, "ルビ位置不明で除外", len(ruby), agree
        pron = pron.replace(b, _h2k(y), 1)
    row2, why2 = _label(("distill_aozora", rid, text, pron, None))
    if row2:
        kana = _loose(re.sub(r"[^\u30A1-\u30FAー]", "", row2["target"]))
        if all(_loose(y) in kana for _, y in ruby):
            row2["src"] = "ruby"
            return row2, "ok(ルビで読みを修正)", len(ruby), agree
    return None, "ルビで修正できず除外", len(ruby), agree


def label(item):
    """ルール例はまず元の文で pyopenjtalk に通し、読みがルールと一致すれば自然な韻律をそのまま使う。
    一致しなければカタカナに置き換えた文 (pron) で韻律を付ける。"""
    kind, rid, text, pron, expect = item
    if expect:
        row, why = _label((kind, rid, text, text, expect))
        if row:
            row["src"] = "rule"
            row["prosody"] = "text"
            return row, "ok(元の文で一致)"
        row, why = _label(item)
        if row:
            row["prosody"] = "kana"
        return row, ("ok(カナ置換)" if row else why)
    return _label(item)


def _label(item):
    """(kind, id, text, pron_text, expect) -> (row, reason)。expect があればカナにその読みが含まれることを要求。"""
    import pyopenjtalk

    kind, rid, text, pron, expect = item
    try:
        for nd in pyopenjtalk.run_frontend(pron):
            if nd["pos"] == "記号" and not UNK_OK.match(unicodedata.normalize("NFKC", nd["string"])) and nd["string"] not in "、。！？「」『』・":
                return None, "未知語(記号扱い)"
            if not nd["pron"] or nd["pron"] == "*":
                return None, "読みなし"
        tg = distill_one(pron)
    except Exception:
        return None, "例外"
    if tg is None:
        return None, "韻律とカナの不整合"
    kana = re.sub(r"[^\u30A1-\u30FAー]", "", tg)
    if expect and expect not in kana:
        return None, "ルール読みと不一致"
    if not expect and len(kana) < 0.6 * len(re.sub(r"[、。！？「」『』・]", "", text)):
        return None, "カナが短すぎる"
    return {"id": rid, "text": text, "target": tg, "source": kind, "src": "rule" if expect else "distill"}, "ok"


def run_aug(a, eval_norm):
    from collections import Counter
    from multiprocessing import Pool

    sys.path.insert(0, str(HERE))
    from aug.rules import gen

    items = []
    for p in sorted(a.aug_text.glob("*.txt")):
        for n, line in enumerate(open(p, encoding="utf-8")):
            if n >= a.aug_max:
                break
            t = line.strip()
            if t:
                items.append((f"distill_{p.stem}", f"{p.stem}:{n}", t, t, None))
    rules = gen()
    for n, (t, pr) in enumerate(rules):
        if re.sub(r"[、。]", "", unicodedata.normalize("NFKC", t)) in eval_norm:
            continue
        seg = None
        # pron と text の差分 = ルールで決めた読み
        i = 0
        while i < min(len(t), len(pr)) and t[i] == pr[i]:
            i += 1
        j = 0
        while j < min(len(t), len(pr)) - i and t[-1 - j] == pr[-1 - j]:
            j += 1
        seg = pr[i : len(pr) - j]
        items.append(("rule", f"rule:{n}", t, pr, seg))
    rows, stats = [], {}
    az = a.aug_text / "aozora.jsonl"
    if az.exists():
        aitems = []
        for n, l in enumerate(open(az, encoding="utf-8")):
            if n >= a.aug_max:
                break
            d = json.loads(l)
            aitems.append((d["id"], d["text"], d["ruby"]))
        c, nr, na = Counter(), 0, 0
        with Pool(a.workers) as pool:
            for row, why, r_, ag in pool.imap(label_ruby, aitems, chunksize=256):
                c[why] += 1
                nr += r_
                na += ag
                if row:
                    rows.append(row)
        c = dict(c)
        c["ルビ総数"] = nr
        c["pyopenjtalkがルビと一致"] = na
        c["ルビ一致率"] = round(na / max(nr, 1), 4)
        stats["distill_aozora"] = c
    with Pool(a.workers) as pool:
        for (kind, *_), (row, why) in zip(items, pool.imap(label, items, chunksize=256), strict=False):
            stats.setdefault(kind, Counter())[why] += 1
            if row:
                rows.append(row)
    stats = {k: dict(v) for k, v in stats.items()}

    for k, v in stats.items():
        print(f"aug {k}: {v}")
    json.dump(stats, open(a.out / "aug_stats.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsut-label", type=Path, default=HERE / "data/jsut-label")
    ap.add_argument("--out", type=Path, default=HERE / "data")
    ap.add_argument("--dev-size", type=int, default=200)
    ap.add_argument("--distill-text", type=Path, nargs="*", default=[])
    ap.add_argument("--distill-max", type=int, default=100000)
    ap.add_argument("--aug", action="store_true", help="増量データ (aug_text + ルールセット) を distill.jsonl に入れる")
    ap.add_argument("--aug-text", type=Path, default=HERE / "data/aug_text")
    ap.add_argument("--aug-max", type=int, default=100000, help="ソースごとの最大文数")
    ap.add_argument("--rule-repeat", type=int, default=5, help="ルールセットを何回繰り返して混ぜるか (数が少ないため)")
    ap.add_argument("--workers", type=int, default=os.cpu_count())
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    if not (a.jsut_label / "e2e_symbol").exists():
        subprocess.run(["git", "clone", "--depth", "1", "https://github.com/sarulab-speech/jsut-label", str(a.jsut_label)], check=True)
    rows, nex = load_jsut(a.jsut_label)
    random.Random(0).shuffle(rows)
    dev, train = rows[: a.dev_size], rows[a.dev_size :]
    print(f"jsut: {len(rows)} 文 (評価用 {nex} 文を除外) -> train {len(train)} / dev {len(dev)}")
    distill = []
    eval_texts = {json.loads(l)["text"] for l in open(EVAL_JSUT, encoding="utf-8")}
    for p in a.distill_text:
        for n, line in enumerate(open(p, encoding="utf-8")):
            t = line.strip()
            if not t or t in eval_texts or len(t) > 120:
                continue
            tg = distill_one(t)
            if tg:
                distill.append({"id": f"distill:{p.name}:{n}", "text": t, "target": tg, "source": "distill"})
            if len(distill) >= a.distill_max:
                break
    if a.aug:
        en = {re.sub(r"[、。]", "", unicodedata.normalize("NFKC", x)) for x in eval_texts}
        for l in open(REPO / "eval/data/hard_set.tsv", encoding="utf-8"):
            if l.strip() and not l.startswith("#"):
                en.add(re.sub(r"[、。]", "", unicodedata.normalize("NFKC", l.split("\t")[2])))
        ar = run_aug(a, en)
        distill += [r for r in ar if r["src"] in ("distill", "ruby")]
        distill += [r for r in ar if r["src"] == "rule"] * a.rule_repeat
    for name, rs in [("train", train), ("dev", dev), ("distill", distill)]:
        if rs:
            with open(a.out / f"{name}.jsonl", "w", encoding="utf-8") as f:
                for r in rs:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
    if distill:
        print(f"distill: {len(distill)} 文 (pyopenjtalk 蒸留。品質は pyopenjtalk が上限)")
    src = sorted({c for r in train + distill for c in r["text"]})
    tgt = sorted({c for r in train + dev + distill for c in r["target"]})
    json.dump({"src": src, "tgt": tgt}, open(a.out / "vocab.json", "w", encoding="utf-8"), ensure_ascii=False)
    print(f"vocab: 入力 {len(src)} 文字, 出力 {len(tgt)} 記号 -> {a.out}")


if __name__ == "__main__":
    main()
