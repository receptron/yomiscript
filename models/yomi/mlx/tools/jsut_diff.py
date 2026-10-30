"""Compare two evaluate.py --preds jsonl files and classify the errors in sentences that only B gets wrong.
Usage: python tools/jsut_diff.py none.jsonl gs.jsonl  (the last line is the summary)"""

import difflib
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "eval/scripts"))
from metrics import loose_kana

A, B = ([json.loads(l) for l in open(p, encoding="utf-8")] for p in sys.argv[1:3])
cat, ex, nb, na = Counter(), [], 0, 0
for a, b in zip(A, B, strict=False):
    ea, eb = a["pred"] != a["gold"], b["pred"] != b["gold"]
    na += ea and not eb
    if eb and not ea:
        nb += 1
        g, q = b["gold"], b["pred"]
        if loose_kana(g) == loose_kana(q):
            cat["prosody_only"] += 1
            continue
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, g, q).get_opcodes():
            if op == "equal":
                continue
            s = g[i1:i2] + q[j1:j2]
            cat["long_vowel" if set(s) <= set("ーウイオエア") else "prosody_mark" if not any("ァ" <= c <= "ヶ" for c in s) else "reading"] += 1
        if len(ex) < 6:
            ex.append(f"  {b['text'][:30]} | {g[:40]} -> {q[:40]}")
print("\n".join(ex))
print(f"jsut_diff: only B wrong {nb} sentences / only A wrong {na} sentences | kinds {dict(cat)}")
