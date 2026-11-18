"""What the value scripts share about sentence rows: the kana of a mora, and the words of a sentence."""

import re
import sys
import unicodedata

from memory import HERE

sys.path.insert(0, str(HERE.parent.parent / "tools/yomiscript"))
from kana2ipa import MORA as KANA_IPA  # noqa: E402

ROWS = HERE.parent / "qwen_prosody/work/pitch_rows.json"
GOLD = HERE.parent / "jsut_accent/data/items.json"
# the readings of each surface in the memory, longest first; filled by the caller
keys_by_surface = {}

IPA_KANA = {}
for k, v in KANA_IPA.items():
    IPA_KANA.setdefault(v, k)
IPA_KANA.update(
    {
        "ː": "ー",
        "ɴ": "ン",
        "n": "ン",
        "m": "ン",
        "ŋ": "ン",
        "ɲ": "ン",
        "ni": "ニ",
        "hi": "ヒ",
        "u": "ウ",
        "ɾu": "ル",
        "bu": "ブ",
        "mu": "ム",
        "pu": "プ",
        "ɡu": "グ",
        "dʑu": "ジュ",
        "z": "ッ",
        "za": "ザ",
        "zɯ": "ズ",
        "zo": "ゾ",
        "ze": "ゼ",
        "tɯ": "トゥ",
        "dɯ": "ドゥ",
        "ʑi": "ジ",
        "çɯ": "ヒュ",
        "hʲo": "ヒョ",
        "hʲa": "ヒャ",
        "nʲɯ": "ニュ",
    }
)
for g in "tksɕdɡʔhɸɾp":
    IPA_KANA.setdefault(g, "ッ")


def words_of(s):
    """(first mora, surface, reading) of each word of a sentence"""
    out, cur = [], None
    for i, m in enumerate(s["morae"]):
        if cur is None or m["span"] != cur["span"]:
            cur = {
                "span": m["span"],
                "at": i,
                "surface": "".join(c for c in unicodedata.normalize("NFKC", m["word"]) if unicodedata.category(c)[0] not in "PSZ"),
                "kana": "",
            }
            out.append(cur)
        cur["kana"] += IPA_KANA.get(m["ipa"], "?")
    return out


def gold_marks(text, n):
    """falls and phrase starts of JSUT's annotation, per mora, or None if it has another number of morae"""
    falls, starts, i, new = [], [], 0, True
    s = text.strip("^$?")
    for c in re.findall(r"[ァ-ヴー][ァィゥェォャュョヮ]?|[\[\]#_]", s):
        if c == "]":
            falls.append(i - 1)
        elif c in "#_":
            new = True
        elif c != "[":
            if new:
                starts.append(i)
                new = False
            i += 1
    return (falls, starts) if i == n else None


def lookup(word, keys):
    """the entry of the word itself, or of the longest part it starts with that reads as it does"""
    s, k = word["surface"], word["kana"]
    if (s, k) in keys:
        return keys[(s, k)]
    for n in range(len(s) - 1, 0, -1):
        for pron in keys_by_surface.get(s[:n], ()):
            if k.startswith(pron):
                return keys[(s[:n], pron)]
    return 0
