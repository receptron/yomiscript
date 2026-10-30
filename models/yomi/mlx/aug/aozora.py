"""Extract sentences and ruby from Aozora Bunko (works out of copyright, in modern kanji and kana (新字新仮名)).

Ruby (｜漢字《かんじ》 / 漢字《かんじ》) is a reading assigned by hand, so it is used as a "constraint from the reference" when labelling.
The ruby markup is removed from the input text, and the ruby is kept separately as {"ruby": [[base text, reading], ...]}.
To avoid historical kana usage, only works whose orthography type is 「新字新仮名」 are used, and sentences containing ゐ・ゑ・ヰ・ヱ are dropped.

python aug/aozora.py --works 400      # builds data/aug_text/aozora.jsonl
"""

import argparse
import csv
import io
import json
import re
import sys
import time
import zipfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_text import HERE, check, eval_keys, fetch, norm

INDEX = "https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip"
KANJI = r"[\u4E00-\u9FFF\u3005\u3006\u30F6]"
RUBY = re.compile(r"｜([^《｜]+)《([^》]+)》|(" + KANJI + r"+)《([^》]+)》")
OLD = re.compile(r"[ゐゑヰヱ]")


def works(cache, n):
    z = zipfile.ZipFile(fetch(INDEX, cache / "aozora_index.zip"))
    rows = list(csv.reader(io.TextIOWrapper(z.open(z.namelist()[0]), encoding="utf-8-sig")))[1:]
    seen, out = set(), []
    for r in sorted(rows, key=lambda r: int(r[0])):
        url = r[45]
        if r[9] == "新字新仮名" and r[10] == "なし" and r[23] == "著者" and url.endswith(".zip") and "aozora.gr.jp" in url and r[0] not in seen:
            seen.add(r[0])
            out.append((r[0], url))
    step = max(1, len(out) // n)  # pick at even intervals from the whole list so authors and periods are not skewed
    return out[::step][:n]


def body(raw):
    t = raw.decode("cp932", errors="replace")
    parts = re.split(r"-{20,}", t)
    t = parts[2] if len(parts) >= 3 else t
    t = t.split("底本：")[0]
    t = re.sub(r"［＃[^］]*］", "", t)
    return t.replace("\r", "")


def sentences(text):
    for para in text.split("\n"):
        para = para.strip().lstrip("　")
        for s in re.findall(r"[^。]+。", para):
            yield s.strip("　 ")


def strip_ruby(s):
    ruby = []

    def rep(m):
        base, yomi = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        ruby.append([base, yomi])
        return base

    return RUBY.sub(rep, s), ruby


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=HERE / "data/aug_text/aozora.jsonl")
    ap.add_argument("--cache", type=Path, default=HERE / "data/aug_cache/aozora")
    ap.add_argument("--works", type=int, default=400)
    ap.add_argument("--max", type=int, default=100000)
    a = ap.parse_args()
    a.cache.mkdir(parents=True, exist_ok=True)
    evk, seen, st, n = eval_keys(), set(), Counter(), 0
    with open(a.out, "w", encoding="utf-8") as f:
        for wid, url in works(a.cache, a.works):
            p = a.cache / f"{wid}.zip"
            if not p.exists():
                try:
                    fetch(url, p)
                    time.sleep(0.3)
                except Exception:
                    st["DL失敗"] += 1
                    continue
            try:
                z = zipfile.ZipFile(p)
                txt = [x for x in z.namelist() if x.endswith(".txt")][0]
                text = body(z.read(txt))
            except Exception:
                st["読込失敗"] += 1
                continue
            st["作品"] += 1
            for s in sentences(text):
                st["候補"] += 1
                if OLD.search(s):
                    st["旧仮名文字"] += 1
                    continue
                plain, ruby = strip_ruby(s)
                if "《" in plain or "｜" in plain:
                    st["ルビ解析不能"] += 1
                    continue
                plain = check(plain, st, evk)
                if plain is None:
                    continue
                k = norm(plain)
                if k in seen:
                    st["重複"] += 1
                    continue
                seen.add(k)
                n += 1
                st["採用"] += 1
                st["ルビ数"] += len(ruby)
                st["ルビ付き文"] += bool(ruby)
                f.write(json.dumps({"id": f"aozora:{wid}:{n}", "text": plain, "ruby": ruby}, ensure_ascii=False) + "\n")
            if n >= a.max:
                break
    print("aozora", dict(st))
    sp = a.out.parent / "stats.json"
    d = json.load(open(sp, encoding="utf-8")) if sp.exists() else {}
    d["aozora"] = dict(st)
    json.dump(d, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
