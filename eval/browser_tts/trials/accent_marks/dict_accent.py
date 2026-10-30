"""Dictionary accent phrases from pyopenjtalk (OpenJTalk + NAIST-JDIC, with its accent-sandhi rules), for writing
accent marks onto an LLM's YomiScript (dict_marks.mjs): dict_accent.json,
{set: {name: [{"start": i, "end": j, "kana": "...", "ipa": "...", "hl": ["L", "H", ...]}, ...] | null}}.

One entry per accent phrase: the characters of the text it covers ([start, end)), its reading (kana and YomiScript IPA,
by tools/yomiscript/kana2ipa.py) and the Tokyo H / L of each mora. null when the morae do not add up. Whether a
phrase gets marks is decided on the JS side, by comparing its reading with the LLM's.

usage: python dict_accent.py   (python with pyopenjtalk)
"""

import importlib.util
import json
import unicodedata
from pathlib import Path

import pyopenjtalk
from accent_ref import morae, sets

HERE = Path(__file__).parent
_spec = importlib.util.spec_from_file_location("kana2ipa", HERE.parents[3] / "tools" / "yomiscript" / "kana2ipa.py")
kana2ipa = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(kana2ipa)


def nfkc(s):
    return unicodedata.normalize("NFKC", s)


def place(text, words):
    """[start, end) of each word in the text. Words not found where they should be (numbers, which OpenJTalk writes
    as kanji numerals) take the stretch up to the next word that is found, all of them the whole stretch."""
    out, cur, pending = [], 0, []
    for w in words:
        s = nfkc(w["string"])
        i = nfkc(text).find(s, cur) if s else -1
        if i < 0 or (i > cur and not pending and text[cur:i].strip()):
            pending.append(len(out))
            out.append(None)
            continue
        for k in pending:
            out[k] = (cur, i)
        pending = []
        out.append((i, i + len(s)))
        cur = i + len(s)
    for k in pending:
        out[k] = (cur, len(text))
    return out


def separate(P):
    """drop the phrases whose span overlaps a neighbour's (a stretch of numbers split between phrases)"""
    bad = {i for i in range(len(P) - 1) if P[i]["end"] > P[i + 1]["start"]}
    return [p for i, p in enumerate(P) if i not in bad and i - 1 not in bad]


def phrases(text):
    words = pyopenjtalk.run_frontend(text)
    spans, M = place(text, words), morae(text)
    if sum(w["mora_size"] for w in words) != len(M):
        return None
    out, k = [], 0
    for w, (a, z) in zip(words, spans, strict=True):
        n = w["mora_size"]
        if n == 0:
            continue
        ph = M[k]["phrase"]
        if not out or out[-1]["phrase"] != ph:
            out.append({"phrase": ph, "start": a, "end": z, "kana": "", "hl": []})
        p = out[-1]
        p["start"], p["end"], p["kana"] = min(p["start"], a), max(p["end"], z), p["kana"] + w["pron"].replace("’", "")
        p["hl"] += [m["hl"] for m in M[k : k + n]]
        k += n
    for p in out:
        p["ipa"] = kana2ipa.convert(p["kana"]).strip("/")
        del p["phrase"]
    return separate(out)


def main():
    ref = {name: {x["name"]: phrases(x["text"]) for x in items} for name, items in sets().items()}
    (HERE / "dict_accent.json").write_text(json.dumps(ref, ensure_ascii=False, indent=0))
    print({k: sum(v is None for v in d.values()) for k, d in ref.items()}, "texts not placed")


if __name__ == "__main__":
    main()
