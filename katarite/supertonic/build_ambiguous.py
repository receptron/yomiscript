"""Build ambiguous.json: written forms that IPAdic gives more than one pronunciation (一日: イチニチ / ツイタチ),
plus how many readings each has. The Supertonic Katarite gives the engine the reading as kana for these and leaves
every other word as written. IPAdic is used for its readings only; nothing of it is copied but this list.

usage: python build_ambiguous.py <dir with the IPAdic CSV files (EUC-JP), e.g. from github.com/taku910/mecab/mecab-ipadic>
"""

import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

KANJI = re.compile(r"[㐀-鿿々]")
O_ROW = "オコソトノホモヨロゴゾドボポョォ"
E_ROW = "エケセテネヘメレゲゼデベペェ"


def pron(p):
    # one spelling per pronunciation: long vowels as ー (リョウリ / リョーリ, セイ / セー), ヲ / ヅ / ヂ as said
    p = p.replace("ヲ", "オ").replace("ヅ", "ズ").replace("ヂ", "ジ")
    p = re.sub(f"(?<=[{O_ROW}])ウ", "ー", p)
    return re.sub(f"(?<=[{E_ROW}])イ", "ー", p)


def main():
    readings = defaultdict(set)
    for f in sorted(Path(sys.argv[1]).glob("*.csv")):
        with f.open(encoding="euc_jp", errors="replace") as fh:
            for row in csv.reader(fh):
                if len(row) >= 13 and KANJI.search(row[0]) and row[12] != "*":
                    readings[row[0]].add(pron(row[12]))
    out = {w: len(r) for w, r in sorted(readings.items()) if len(r) > 1}
    (Path(__file__).parent / "ambiguous.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(readings)} written forms with kanji, {len(out)} with more than one reading")


if __name__ == "__main__":
    main()
