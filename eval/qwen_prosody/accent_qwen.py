"""The accent Qwen speaks: for each sentence of data/jsut_qwen_clone.jsonl, where each of JSUT's hand-annotated accent
phrases falls in Qwen's audio, read from its pitch by eval/prosody_ref/accent.py's classifier (learnt on the JSUT
speaker's own recordings and labels).

The phrases are the gold's (jsut-label), so what is read is only the nucleus of each: n (the pitch falls after the
phrase's n-th mora) or 0 (no fall inside it: flat, or a fall on its last mora). The mora times are the data's spans,
each running on to the next unit as accent.py's alignment has them. Compared with the gold nucleus, as accent.py's
own test on JSUT's recordings.

usage: ../prosody_ref/.venv/bin/python accent_qwen.py [--all]   -> work/qwen_accent.json ({name: [nucleus per gold phrase]};
       the sentences read from the text, or with --all also the kana pass)
"""

import json
import pickle
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "prosody_ref"))
from accent import MODEL, decide, features_at, jsut_labels  # noqa: E402


def times(r):
    # the data's spans, each to the next unit's start (as align.mora_times), the last as it is
    s = r["spans"]
    return [(a, s[i + 1][0] if i + 1 < len(s) else b) for i, (a, b) in enumerate(s)]


ALL = "--all" in sys.argv  # the kana pass too


def main():
    clf = pickle.loads(MODEL.read_bytes())
    gold = jsut_labels()
    out, ok, total = {}, 0, 0
    for line in (HERE / "data/jsut_qwen_clone.jsonl").read_text().splitlines():
        r = json.loads(line)
        if r["given"] != "text" and not ALL:
            continue  # from kana Qwen's accent is much further from the gold (README.md)
        ph = gold.get(r["name"])
        sizes = [len(m) for m, _ in ph or []]
        if not ph or sum(sizes) != len(r["units"]):
            continue
        heard = decide(clf, features_at(HERE / "work" / ("audio" if r["given"] == "text" else "audio_kana") / f"{r['name']}.wav", times(r)), sizes)
        out[r["name"]] = heard
        for (m, nuc), h in zip(ph, heard, strict=True):
            if h is not None:
                ok += h == (0 if nuc == len(m) else nuc)
                total += 1
    (HERE / "work/qwen_accent.json").write_text(json.dumps(out))
    print(f"{len(out)} sentences: {ok} of {total} gold phrases heard with the gold's nucleus in Qwen ({ok / total:.1%})")


if __name__ == "__main__":
    main()
