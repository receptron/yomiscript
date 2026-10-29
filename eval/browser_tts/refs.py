"""Reference readings for the comparison, written to refs.json.

  kokoro      the original Kokoro front end (KPipeline G2P via yomite/*_kokoro/g2p.py): YomiScript and the original phonemes
  openjtalk   pyopenjtalk readings (the OpenJTalk + NAIST-JDIC front end that piper-plus also runs, as WASM), as YomiScript
  gold        the hard set's gold readings (eval/data/hard_set.tsv), as YomiScript

usage: python refs.py     (python with kokoro, misaki[ja] and pyopenjtalk)
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import pyopenjtalk

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "tools/yomiscript"))
from kana2ipa import convert  # noqa: E402

KATA = re.compile("[^\u30a1-\u30fa\u30fc]")  # keep katakana and the long-vowel mark only


def sets():
    out = subprocess.run(
        ["node", "-e", 'import("./sets.mjs").then(m=>console.log(JSON.stringify(m.SETS)))'], cwd=HERE, capture_output=True, text=True, check=True
    )
    return json.loads(out.stdout)


def kokoro(items, lang):
    g2p = ROOT / ("yomite/ja_kokoro/g2p.py" if lang == "ja" else "yomite/en_kokoro/g2p.py")
    out = subprocess.run([sys.executable, str(g2p), *[x["text"] for x in items]], capture_output=True, text=True, check=True)
    chunks = [json.loads(line) for line in out.stdout.splitlines() if line.startswith("{")]
    return [{"ys": [c["ys"] for c in chunks if c["index"] == i], "ps": [c["kokoro"] for c in chunks if c["index"] == i]} for i in range(len(items))]


def kana_ys(kana):
    kana = KATA.sub("", kana)
    try:
        ys = convert(f"^{kana}$")
        return ys if ys.startswith("ja ") else "ja " + ys  # kana2ipa writes the older untagged form
    except (KeyError, ValueError, IndexError) as e:
        return f"error: {e!r}"


def main():
    refs = {}
    for name, items in sets().items():
        lang = items[0]["lang"]
        rows = kokoro(items, "ja" if lang == "ja" else "en")
        for x, r in zip(items, rows, strict=True):
            r["name"] = x["name"]
            if lang == "ja":
                r["openjtalk"] = kana_ys(pyopenjtalk.g2p(x["text"], kana=True))
            if "gold" in x:
                r["gold"] = [kana_ys(g) for g in x["gold"]]
        refs[name] = rows
    (HERE / "refs.json").write_text(json.dumps(refs, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
