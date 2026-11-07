"""What the value scripts share about sentence rows: the kana of a mora, and the words of a sentence."""

import sys
import unicodedata

from memory import HERE

sys.path.insert(0, str(HERE.parent.parent / "tools/yomiscript"))
from kana2ipa import MORA as KANA_IPA  # noqa: E402

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
