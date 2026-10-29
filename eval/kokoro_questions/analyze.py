"""Summarize run.py output: does the original Kokoro raise the pitch at the end of questions?

rise      = pitch at the end of the utterance minus the lowest pitch in the last word (semitones; ≥ 0 by construction)
end       = pitch at the end minus the utterance median (semitones)
'rising'  = rise ≥ 2 and end > 0   (ends clearly up, above the speaker's middle)
Pairs compare the same voice on the '?' and '.' (or statement) versions.
usage: python analyze.py results.json
"""

import json
import sys
from collections import defaultdict

import numpy as np

R = json.load(open(sys.argv[1]))
rows = [r for r in R["rows"] if r["pred"]]


def rising(m):
    return m["end_vs_lastword_min"] >= 2 and m["end_vs_median"] > 0


def summary(sel, key="pred"):
    m = [r[key] for r in sel if r.get(key)]
    if not m:
        return "–"
    rise = np.array([x["end_vs_lastword_min" if key == "pred" else "end_vs_last300ms_min"] for x in m])
    end = np.array([x["end_vs_median"] for x in m])
    up = np.mean([(a >= 2 and b > 0) for a, b in zip(rise, end, strict=False)])
    sl = [x["slope2"] for x in m if x.get("slope2") is not None]
    return (
        f"n={len(m):4d}  rising {100*up:5.1f}%   rise {rise.mean():+5.2f}   end {end.mean():+5.2f}   "
        f"paper-style rising (slope>0) {100*np.mean(np.array(sl)>0):5.1f}%"
    )


kinds = ["punct_pair", "yn_question", "yn_statement", "wh_question", "tag_question", "alt_question"]
print(f"Model F0 prediction, {len(R['voices'])} voices\n")
for k in kinds:
    if k == "punct_pair":
        print(f"{'same words, ending .':24s}", summary([r for r in rows if r["kind"] == k and r["text"][-1] in ".。"]))
        print(f"{'same words, ending ?':24s}", summary([r for r in rows if r["kind"] == k and r["text"][-1] in "?？"]))
    else:
        print(f"{k:24s}", summary([r for r in rows if r["kind"] == k]))

print("\nPaired differences, same voice ('?' version minus '.' version), semitones")
for name, qk, sk in [("same words  ? vs .", "punct_pair", "punct_pair"), ("yes/no q vs statement", "yn_question", "yn_statement")]:
    by = defaultdict(dict)
    for r in rows:
        if r["kind"] in (qk, sk) and "pair" in r:
            by[(r["voice"], r["pair"])]["q" if r["text"][-1] in "?？" else "s"] = r["pred"]
    d_end = np.array([v["q"]["end_vs_median"] - v["s"]["end_vs_median"] for v in by.values() if len(v) == 2])
    d_rise = np.array([v["q"]["end_vs_lastword_min"] - v["s"]["end_vs_lastword_min"] for v in by.values() if len(v) == 2])
    print(
        f"  {name:24s} n={len(d_end):4d}  Δend {d_end.mean():+5.2f} (± {d_end.std():.2f})   Δrise {d_rise.mean():+5.2f}   "
        f"'?' higher at the end in {100*np.mean(d_end > 1):.0f}% of pairs (by > 1 st)"
    )

print("\nPer voice: yes/no questions rising vs statements rising (model prediction)")
for v in R["voices"]:
    q = [r for r in rows if r["voice"] == v and r["kind"] in ("yn_question",) or (r["voice"] == v and r["kind"] == "punct_pair" and r["text"][-1] in "?？")]
    s = [r for r in rows if r["voice"] == v and (r["kind"] == "yn_statement" or (r["kind"] == "punct_pair" and r["text"][-1] in ".。"))]
    print(f"  {v:12s} questions {100*np.mean([rising(r['pred']) for r in q]):5.1f}%   statements {100*np.mean([rising(r['pred']) for r in s]):5.1f}%")

av = [r for r in R["rows"] if r.get("audio") and r["pred"]]
if av:
    p = np.array([r["pred"]["end_vs_median"] for r in av])
    a = np.array([r["audio"]["end_vs_median"] for r in av])
    print(f"\nAudio check ({', '.join(R['audio_voices'])}; librosa.pyin on the synthesized sound)")
    print(f"  end vs median: prediction vs audio  correlation {np.corrcoef(p, a)[0,1]:.2f}, mean {p.mean():+.2f} vs {a.mean():+.2f}")
    for k in kinds:
        sel = [r for r in av if r["kind"] == k]
        if k == "punct_pair":
            for e in ".?":
                ss = [r for r in sel if r["text"][-1] in {".": ".。", "?": "?？"}[e]]
                print(f"  {'same words, ending '+e:24s} audio: {summary(ss,'audio')}")
        else:
            print(f"  {k:24s} audio: {summary(sel,'audio')}")
