"""pyopenjtalk (NAIST-jdic 系) の読みを .koedict (base レイヤー) に変換する。出力はローカル専用で、コミットしない。
辞書バイナリを直接展開するのではなく、手元のコーパスを pyopenjtalk で解析し、漢字を含む形態素の
「表層 → 最頻の読み」を集める (複数読みがあれば2番目以降は記録のみ)。
  python tools/pyopenjtalk_to_koedict.py --text data/aug_text/*.txt --out mem/base_pyopenjtalk.koedict --min-count 2
"""

import argparse
import collections
import glob
import json
import re

ap = argparse.ArgumentParser()
ap.add_argument("--text", nargs="+", required=True, help="テキスト/jsonl ファイル (jsonl なら text 列)")
ap.add_argument("--out", required=True)
ap.add_argument("--min-count", type=int, default=2)
ap.add_argument("--limit", type=int, default=0, help="解析する行数の上限 (0=全部)")
a = ap.parse_args()
import pyopenjtalk

KANJI = re.compile(r"[\u4e00-\u9fff々]")
cnt = collections.defaultdict(collections.Counter)
n = 0
for pat in a.text:
    for f in glob.glob(pat):
        for line in open(f, encoding="utf-8"):
            line = line.strip()
            if f.endswith(".jsonl"):
                line = json.loads(line)["text"]
            if not line:
                continue
            for m in pyopenjtalk.run_frontend(line):
                if KANJI.search(m["string"]) and m["pron"] and m["pron"] != "*":
                    cnt[m["string"]][(m["pron"].replace("’", ""), m["acc"])] += 1
            n += 1
            if a.limit and n >= a.limit:
                break
with open(a.out, "w", encoding="utf-8") as w:
    w.write("# base_pyopenjtalk.koedict — pyopenjtalk(NAIST-jdic 由来, BSD系)から自動変換。ローカル専用・コミットしない\n")
    w.write(f"# pyopenjtalk {pyopenjtalk.__version__ if hasattr(pyopenjtalk, '__version__') else ''} / 入力 {n} 行 / min-count {a.min_count}\n")
    w.write("# layer: base\n# scope: always\n\n@lexicon {\n")
    k = 0
    for s, c in sorted(cnt.items()):
        if sum(c.values()) >= a.min_count:
            (pron, acc), top = c.most_common(1)[0]
            alts = sorted({p for (p, _), _n in c.items() if p != pron})
            note = f"  # 他の読み: {'/'.join(alts)}" if alts else ""
            w.write(f"  {s} = {pron} [accent: {acc}];{note}\n")
            k += 1
    w.write("}\n")
print(f"{n} 行を解析, {k} 項目 -> {a.out}")
