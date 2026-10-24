"""Yomi-0 学習データ作成: テキスト -> カナ+韻律記号 (jsut-label e2e_symbol 形式)。

出力 (data/): train.jsonl, dev.jsonl, [distill.jsonl], vocab.json
  各行 {"id", "text", "target", "source"}  target 例: ^ミ[ズヲ#マ[レ]ーシアカラ$
  記号: ^ 文頭 / $ 文末 / ? 疑問文末 / # アクセント句境界 / _ ポーズ / [ ピッチ上昇 / ] アクセント核

人手ラベル: jsut-label BASIC5000 (eval/data の280文は除外)。ライセンスは eval/LICENSE_DATA.md 参照。
蒸留 (任意, --distill-text): 1行1文のテキストを pyopenjtalk でラベル付け。source="distill"。
  ※蒸留データの品質は pyopenjtalk 以下に頭打ちになる (誤読もそのまま学習する)。

python prepare_data.py                      # jsut-label を自動 clone
python prepare_data.py --jsut-label /path/to/jsut-label --distill-text my_corpus.txt --distill-max 50000
"""
import argparse, json, random, re, subprocess, sys
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
            out.append(mo[i]); i += 1
    return "".join(out) if i == len(mo) and mo else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsut-label", type=Path, default=HERE / "data/jsut-label")
    ap.add_argument("--out", type=Path, default=HERE / "data")
    ap.add_argument("--dev-size", type=int, default=200)
    ap.add_argument("--distill-text", type=Path, nargs="*", default=[])
    ap.add_argument("--distill-max", type=int, default=100000)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    if not (a.jsut_label / "e2e_symbol").exists():
        subprocess.run(["git", "clone", "--depth", "1", "https://github.com/sarulab-speech/jsut-label", str(a.jsut_label)], check=True)
    rows, nex = load_jsut(a.jsut_label)
    random.Random(0).shuffle(rows)
    dev, train = rows[:a.dev_size], rows[a.dev_size:]
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
