"""Convert pyopenjtalk (NAIST-jdic family) readings into a .koedict (base layer). The output is local only and is not committed.
Instead of unpacking the dictionary binary directly, it analyzes a local corpus with pyopenjtalk and collects, for morphemes containing kanji,
"surface -> most frequent reading" (when there are several readings, the second and later are only recorded).
  python tools/pyopenjtalk_to_koedict.py --text data/aug_text/*.txt --out mem/base_pyopenjtalk.koedict --min-count 2
"""

import argparse
import collections
import glob
import json
import re

ap = argparse.ArgumentParser()
ap.add_argument("--text", nargs="+", required=True, help="text / jsonl files (the text column for jsonl)")
ap.add_argument("--out", required=True)
ap.add_argument("--min-count", type=int, default=2)
ap.add_argument("--limit", type=int, default=0, help="maximum number of lines to analyze (0 = all)")
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
print(f"analyzed {n} lines, {k} entries -> {a.out}")
