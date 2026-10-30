"""Reference Tokyo accent per mora from pyopenjtalk (OpenJTalk + NAIST-JDIC, with its accent-sandhi rules):
accent_ref.json, {set: {name: [{"key": vowel | "N" | "cl", "hl": "H" | "L", "phrase": n}, ...]}}.

A provisional reference, like the gold readings: OpenJTalk's accents are a dictionary's and its rules', not a
listener's. key is what the mora is aligned on (its vowel; N for the moraic nasal, cl for the geminate).

usage: python accent_ref.py   (python with pyopenjtalk)
"""

import json
import re
import subprocess
from pathlib import Path

import pyopenjtalk

HERE = Path(__file__).parent
SETS_DIR = HERE.parents[1]


def sets():
    js = 'import("./sets.mjs").then(m=>console.log(JSON.stringify({ja: m.SETS.ja, hard: m.SETS.hard})))'
    out = subprocess.run(["node", "-e", js], cwd=SETS_DIR, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def num(rx, s):
    m = re.search(rx, s)
    return None if m is None or m.group(1) == "xx" else int(m.group(1))


def tokyo(pos, accent):
    """H or L for mora pos (1-based) of an accent phrase of accent type accent (0 = flat)"""
    if accent == 1:
        return "H" if pos == 1 else "L"
    if pos == 1:
        return "L"
    return "H" if accent == 0 or pos <= accent else "L"


def morae(text):
    out, last = [], None
    for lab in pyopenjtalk.extract_fullcontext(text):
        p = re.search(r"\-(.*?)\+", lab).group(1)
        if p in ("sil", "pau"):
            last = None
            continue
        pos, accent = num(r"/A:[0-9\-]+\+(\d+)\+", lab), num(r"/F:\d+_(\d+)#", lab)
        phrase = (num(r"/I:\d+\-\d+@(\d+)\+", lab), num(r"/F:\d+_\d+#\d+_\w+@(\d+)_", lab))
        here = (phrase, pos)
        if here != last:
            out.append({"key": None, "hl": tokyo(pos, accent), "phrase": phrase})
            last = here
        if p in ("N", "cl") or p.lower() in "aiueo":
            out[-1]["key"] = p if p in ("N", "cl") else p.lower()
    ids = {}
    for m in out:
        m["phrase"] = ids.setdefault(m["phrase"], len(ids))
    return out


def main():
    ref = {name: {x["name"]: morae(x["text"]) for x in items} for name, items in sets().items()}
    (HERE / "accent_ref.json").write_text(json.dumps(ref, ensure_ascii=False, indent=0))
    print({k: len(v) for k, v in ref.items()})


if __name__ == "__main__":
    main()
