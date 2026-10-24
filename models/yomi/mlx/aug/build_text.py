"""増量用のオープンライセンス日本語テキストを集めて 1行1文 の txt にする。

出力 (data/aug_text/): wiki.txt, tatoeba.txt  (重複除去・評価セットとの重複除去済み)
  - Wikipedia 日本語版 (CC BY-SA 4.0): HF wikimedia/wikipedia 20231101.ja の1シャード
  - Tatoeba 日本語文 (CC BY 2.0 FR): downloads.tatoeba.org per_language/jpn
必要: pyarrow (Wikipedia の parquet 読み込み用)

python aug/build_text.py --wiki-max 150000
"""
import argparse, bz2, json, re, unicodedata, urllib.request
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
REPO = HERE.parents[2]
WIKI_URL = "https://huggingface.co/datasets/wikimedia/wikipedia/resolve/main/20231101.ja/train-{:05d}-of-00015.parquet"
TATOEBA_URL = "https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences.tsv.bz2"
# 許可する文字: ひらがな・カタカナ・漢字・々〆ヶ・数字・基本的な句読点。英字や記号の多い文は落とす。
OK = re.compile(r"^[\u3041-\u3096\u30A1-\u30FA\u30FC\u4E00-\u9FFF\u3005\u3006\u30F6０-９0-9、。，．！？「」『』・ー〜]+$")
KANA = re.compile(r"[\u3041-\u3096]")
DIGIT = re.compile(r"[0-9０-９]")


def norm(s):
    return re.sub(r"[、。，．！？「」『』\s]", "", unicodedata.normalize("NFKC", s))


def eval_keys():
    ks = [json.loads(l)["text"] for l in open(REPO / "eval/data/jsut_basic5000_subset.jsonl", encoding="utf-8")]
    for l in open(REPO / "eval/data/hard_set.tsv", encoding="utf-8"):
        if l.strip() and not l.startswith("#"):
            ks.append(l.split("\t")[2])
    return {norm(k) for k in ks}


def fetch(url, dst):
    if not dst.exists():
        print("download", url); dst.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, dst)
    return dst


def check(s, stats, evk):
    s = s.strip()
    if not (5 <= len(s) <= 80): stats["len"] += 1; return None
    if not OK.match(s): stats["chars(英字・記号など)"] += 1; return None
    if not KANA.search(s): stats["ひらがな無し"] += 1; return None
    if DIGIT.search(s): stats["数字入り(ルールセットで扱う)"] += 1; return None
    if s.count("「") != s.count("」"): stats["括弧不整合"] += 1; return None
    n = norm(s)
    if n in evk or any(k in n for k in evk if len(k) >= 8): stats["評価セットと重複"] += 1; return None
    return s


def wiki_sents(paths):
    import pyarrow.parquet as pq
    for p in paths:
        f = pq.ParquetFile(p)
        for i in range(f.num_row_groups):
            for t in f.read_row_group(i, columns=["text"]).column("text").to_pylist():
                for para in t.split("\n"):
                    if para.endswith("。"):  # 本文の段落だけ (見出し・箇条書きは除く)
                        for s in re.findall(r"[^。]+。", para):
                            yield s


def collect(name, it, mx, evk, seen, out):
    stats, n = Counter(), 0
    with open(out, "w", encoding="utf-8") as f:
        for s in it:
            stats["候補"] += 1
            s = check(s, stats, evk)
            if s is None: continue
            k = norm(s)
            if k in seen: stats["重複"] += 1; continue
            seen.add(k); f.write(s + "\n"); n += 1
            if n >= mx: break
    stats["採用"] = n
    print(name, dict(stats))
    return dict(stats)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=HERE / "data/aug_text")
    ap.add_argument("--cache", type=Path, default=HERE / "data/aug_cache")
    ap.add_argument("--wiki-shards", type=int, nargs="*", default=[14])
    ap.add_argument("--wiki-max", type=int, default=150000)
    ap.add_argument("--tatoeba-max", type=int, default=150000)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    evk, seen, st = eval_keys(), set(), {}
    tp = fetch(TATOEBA_URL, a.cache / "jpn_sentences.tsv.bz2")
    tat = (l.rstrip("\n").split("\t")[2] for l in bz2.open(tp, "rt", encoding="utf-8"))
    st["tatoeba"] = collect("tatoeba", tat, a.tatoeba_max, evk, seen, a.out / "tatoeba.txt")
    wp = [fetch(WIKI_URL.format(i), a.cache / f"wiki-{i:05d}.parquet") for i in a.wiki_shards]
    st["wiki"] = collect("wiki", wiki_sents(wp), a.wiki_max, evk, seen, a.out / "wiki.txt")
    json.dump(st, open(a.out / "stats.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
