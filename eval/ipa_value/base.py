"""The reading of each pitch-accent item, without accent: results/base.json.

OpenJTalk (pyopenjtalk, NAIST-JDIC) splits each sentence into words and reads them; every word becomes YomiScript
through the converter eval/browser_tts uses for its gold (refs.kana_ys). Two versions per item:
  ys      the words with their original text in <t:…>  (what a YomiScript Yomite writes, D23)
  ys_kana the same words with their katakana in <t:…>  (all a kana Yomite leaves: the kanji are gone)
and whether OpenJTalk read the target word as intended (the item's kana).

usage: ../prosody_ref/.venv/bin/python base.py
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "browser_tts"))
import pyopenjtalk  # noqa: E402
from refs import kana_ys  # noqa: E402


def ipa(kana):
    ys = kana_ys(kana)
    if ys.startswith("error"):
        raise ValueError(f"{kana}: {ys}")
    return ys.removeprefix("ja /").removesuffix("↘/").strip()


def words(text):
    """[(surface, katakana)] with punctuation joined to the word before it (、 kept as its own pause)"""
    out = []
    for n in pyopenjtalk.run_frontend(text):
        s, p = n["string"], n["pron"].replace("’", "")
        if n["mora_size"] == 0 and s in "、，,":
            out.append((s, None))
        elif n["mora_size"] == 0 and out:
            out[-1] = (out[-1][0] + s, out[-1][1])
        elif out and out[-1][1] and out[-1][1].endswith("ッ"):  # a geminate stays in one word with what follows
            out[-1] = (out[-1][0] + s, out[-1][1] + p)
        else:
            out.append((s, p))
    return out


def yomiscript(ws, kana_text):
    parts = []
    for s, p in ws:
        if p is None:
            parts.append(f"‖<t:{s}>")
        else:
            t = p if kana_text else s
            parts.append(f"{ipa(p)}<t:{t}>")
    return f"ja /{' '.join(parts)} ↘/"


def main():
    items = json.loads((HERE / "items_accent.json").read_text())["items"]
    out = {}
    for x in items:
        ws = words(x["text"])
        read = [p for s, p in ws if s.rstrip("。") == x["word"]]
        out[x["name"]] = {
            "ys": yomiscript(ws, False),
            "ys_kana": yomiscript(ws, True),
            "target_read": read[0] if read else None,
            "target_ok": read == [x["kana"]],
        }
        if not out[x["name"]]["target_ok"]:
            print(f"{x['name']}: OpenJTalk read {x['word']} as {read}, not {x['kana']}", file=sys.stderr)
    (HERE / "results/base.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"{len(out)} items, {sum(not v['target_ok'] for v in out.values())} target words not split or read as intended")


if __name__ == "__main__":
    main()
