"""Generate local inflection requests, excluding the fixed check stem families."""

import csv
import json
from collections import Counter

from memory import HERE, SRC

STEMS = ["持", "盛", "寝", "着", "出", "見", "呼", "読", "兼ね", "食べ", "やめ"]


def excluded(surface):
    return any(s in surface for s in STEMS)


def forms(row):
    s, k, kind = row[0], row[12], row[8]
    if row[4] == "形容詞":
        return [(s[:-1] + a, k[:-1] + b) for a, b in [("くて", "クテ"), ("かった", "カッタ"), ("くない", "クナイ"), ("くなる", "クナル"), ("ければ", "ケレバ")]]
    if "一段" in kind:
        ren, neg, te, past = "", "", "て", "た"
        root, reading = s[:-1], k[:-1]
    elif "五段" in kind:
        root, reading = s[:-1], k[:-1]
        ren, neg, te, past = {
            "う": ("い", "わ", "って", "った"),
            "く": ("き", "か", "いて", "いた"),
            "ぐ": ("ぎ", "が", "いで", "いだ"),
            "す": ("し", "さ", "して", "した"),
            "つ": ("ち", "た", "って", "った"),
            "ぬ": ("に", "な", "んで", "んだ"),
            "ぶ": ("び", "ば", "んで", "んだ"),
            "む": ("み", "ま", "んで", "んだ"),
            "る": ("り", "ら", "って", "った"),
        }.get(s[-1], ("", "", "", ""))
        if not te:
            return []
        if "行く" in s or "いく" == s:
            te, past = "って", "った"
    elif "サ変" in kind and s.endswith("する"):
        root, reading, ren, neg, te, past = s[:-2], k[:-2], "し", "し", "して", "した"
    elif "カ変" in kind:
        return []
    else:
        return []
    suffixes = [te, te + "る", te + "いる", past, neg + "ない", ren + "ます", ren + "たい", ren + "ました", neg + "なかった"]
    return [(root + a, reading + "".join(chr(ord(c) + 96) if "ぁ" <= c <= "ゖ" else c for c in a)) for a in suffixes]


def main():
    requests, seen = [], set()
    total = removed = basics = 0
    unsupported = Counter()
    with SRC.open(newline="") as source:
        for row in csv.reader(source):
            if len(row) < 15 or row[4] not in ("動詞", "形容詞") or row[9] != "基本形":
                continue
            key = (row[0], row[12])
            if key in seen:
                continue
            seen.add(key)
            basics += 1
            conjugations = forms(row)
            if not conjugations:
                unsupported[row[8]] += 1
            for surface, kana in conjugations:
                total += 3
                if excluded(row[0]):
                    removed += 3
                    continue
                requests.append([surface, kana])
    (HERE / "work/inflection_requests.json").write_text(json.dumps(requests, ensure_ascii=False))
    audit = dict(
        basic_entries=basics,
        generated_forms_with_frames=total,
        removed=removed,
        removed_fraction=removed / total,
        remaining=len(requests) * 3,
        excluded_stems=STEMS,
    )
    (HERE / "work/inflection_audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2))
    classes = dict(
        supported_basic_entries=basics - sum(unsupported.values()), unsupported_basic_entries=sum(unsupported.values()), unsupported_classes=dict(unsupported)
    )
    (HERE / "work/inflection_classes.json").write_text(json.dumps(classes, ensure_ascii=False, indent=2))
    print(audit)


if __name__ == "__main__":
    main()
