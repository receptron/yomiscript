"""Does the score rank as the listener did? (the blind listening tests of the accent trial)

For each sentence where the listener named the worst of Kokoro's pitch / the rules / the halved rules
(../browser_tts/trials/accent_marks/listening_*_worst.json), each measure is computed for the three variants
(results/listen-<test>.json, score.py's contours): how often the one heard as the worst gets the lowest score, and how
often it scores below each of the other two.

usage: .venv/bin/python calibrate.py     (after score.py listen-twopass, listen-onepass, listen-dict)
"""

import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
TESTS = {"twopass": "listening_worst", "onepass": "listening_onepass_worst", "dict": "listening_dict_worst"}
VARIANTS = ["kokoro", "rules", "halved"]


def arr(x):
    return np.array([np.nan if v is None else v for v in x])


def by_sentence(c, sent):
    c, s = c.copy(), np.array(sent)
    for k in set(sent):
        m = s == k
        if np.any(~np.isnan(c[m])):
            c[m] -= np.nanmedian(c[m])
    return c


def pearson(a, b):
    ok = ~np.isnan(a) & ~np.isnan(b)
    return np.corrcoef(a[ok], b[ok])[0, 1] if ok.sum() >= 4 else np.nan


def diffs(c, sent):
    d = np.diff(c)
    d[np.array(sent[1:]) != np.array(sent[:-1])] = np.nan
    return d


# higher is closer to the references' mean contour R
MEASURES = {
    "rmse, sentences centred": lambda o, R, s: -np.sqrt(np.nanmean((by_sentence(o, s) - by_sentence(R, s)) ** 2)),
    "corr": lambda o, R, s: pearson(o, R),
    "corr of the moves between morae": lambda o, R, s: pearson(diffs(o, s), diffs(R, s)),
}


def values(r, item, f):
    out = {}
    for v in VARIANTS:
        c = r[v][item]["contours"]
        refs = np.array([arr(c[k]) for k in c if k not in ("ours", "sent")])
        out[v] = f(arr(c["ours"]), np.nanmean(refs, axis=0), c["sent"])
    return out


def main():
    res = {m: [0, 0, 0, 0] for m in MEASURES}
    for test, f in TESTS.items():
        answers = json.loads((HERE.parent / "browser_tts/trials/accent_marks" / f"{f}.json").read_text())["answers"]
        r = json.loads((HERE / "results" / f"listen-{test}.json").read_text())
        for item, a in answers.items():
            worst = a["worst"]
            if not worst or item not in r["kokoro"]:
                continue
            for m, fn in MEASURES.items():
                v = values(r, item, fn)
                if any(np.isnan(x) for x in v.values()):
                    continue
                res[m][0] += min(v, key=v.get) == worst
                res[m][1] += 1
                res[m][2] += sum(v[worst] < v[o] for o in VARIANTS if o != worst)
                res[m][3] += 2
    for m, (a, b, c, d) in res.items():
        print(f"{m}: worst lowest {a} of {b}, below each other variant {c} of {d}")


if __name__ == "__main__":
    main()
