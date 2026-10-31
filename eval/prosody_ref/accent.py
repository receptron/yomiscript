"""The accent heard in speech: where each accent phrase falls, read from the pitch, mora by mora.

Mora times come from forced alignment (align.py), pitch from Praat (score.py's features / pitch_at). A classifier
learnt on JSUT (one speaker's 5000 read sentences with hand-corrected accent labels, jsut-label) tells, for each
boundary between two morae of a phrase, how likely the pitch falls there (the accent nucleus), from the pitch of the
morae around it (whole, halves, and just after it, relative to the phrase), their lengths and voicing, and the place in
the phrase and the sentence. A phrase's accent is the most likely of: a fall at one boundary and none elsewhere, or no
fall inside the phrase (flat, or a fall on its last mora, which is not seen inside it: both 0).

usage: .venv/bin/python accent.py train [n]  the classifier from n JSUT sentences (75% to learn, 25% to test)
       .venv/bin/python accent.py refs       the references and our audio (results/accent.json)
       .venv/bin/python accent.py report     how often each agrees with the dictionary and the references
"""

import json
import pickle
import sys
from collections import Counter
from pathlib import Path

import align
import librosa
import numpy as np
import pyopenjtalk
import score
from score import HOP, OCTAVE, features, pitch_at
from sklearn.ensemble import HistGradientBoostingClassifier

HERE = Path(__file__).parent
JSUT = Path.home() / "yomi_tts"
MODEL = HERE / "results/accent_model.pkl"
VOWELS = set("aiueoAIUEO")
REFS = ["gemini", "openai", "elevenlabs"]
OURS = ["kokoro", "d25", "d27"]


def jsut_labels():
    # name -> phrases, each [morae (phoneme lists), nucleus (1-based mora, 0 for none)]
    out = {}
    for line in (JSUT / "jsut-label/e2e_symbol/phoneme.yaml").read_text().splitlines():
        name, s = line.split(": ", 1)
        phrases, cur, morae, nuc = [], [], [], 0
        for p in s.split("-"):
            if p in "#_$":
                if morae:
                    phrases.append([morae, nuc])
                morae, nuc = [], 0
            elif p == "]":
                nuc = len(morae)
            elif p not in "^[?":
                cur.append(p)
                if p in VOWELS or p in ("N", "cl"):
                    morae.append(cur)
                    cur = []
        out[name] = phrases
    return out


def mora_features(wav, morae):
    # per mora: pitch of the whole, first half, second half and the half mora after it; length; voiced share
    y, sr = librosa.load(str(wav), sr=16000)
    times, _ = align.mora_times(y, sr, morae)
    st, t0, _ = features(str(wav))
    score._cache.clear()
    F = []
    for a, b in times:
        d = b - a
        i, j = int(max(0, (a - t0) / HOP)), int(max(1, np.ceil((b - t0) / HOP)))
        v = st[i:j]
        F.append(
            [pitch_at(st, t0, a + s * d, a + e * d) for s, e in ((0, 1), (0, 0.5), (0.5, 1), (1, 1.5))] + [d, float(np.mean(~np.isnan(v))) if len(v) else 0.0]
        )
    F = np.array(F, dtype=float)
    F[:, :4][np.abs(F[:, :4]) > OCTAVE] = np.nan
    return F


def boundaries(F, sizes):
    # one row per boundary inside a phrase: (phrase, boundary i after mora i, 1-based; its features)
    rows, k = [], 0
    for pi, m in enumerate(sizes):
        P = F[k : k + m].copy()
        voiced = np.any(~np.isnan(P[:, 0]))
        P[:, :4] -= np.nanmedian(P[:, 0]) if voiced else 0.0
        for i in range(1, m):
            x = []
            for j in range(i - 3, i + 2):
                x += list(P[j]) if 0 <= j < m else [np.nan] * P.shape[1]
            x += [i, m, m - i, pi, len(sizes) - pi, np.nanmax(P[:, 0]) if voiced else np.nan]
            rows.append((pi, i, x))
        k += m
    return rows


def decide(clf, F, sizes):
    """the accent of each phrase (fall after mora k, 0: none inside), None for a phrase of one mora"""
    rows = boundaries(F, sizes)
    pr = clf.predict_proba(np.array([x for _, _, x in rows]))[:, 1] if rows else []
    by = {}
    for (pi, _, _), p in zip(rows, pr, strict=False):
        by.setdefault(pi, []).append(p)
    out = []
    for pi, m in enumerate(sizes):
        if m < 2:
            out.append(None)
            continue
        p = np.clip(np.array(by[pi]), 1e-4, 1 - 1e-4)
        none = np.sum(np.log(1 - p))
        out.append(int(np.argmax([none] + [none - np.log(1 - q) + np.log(q) for q in p])))
    return out


def train(n):
    labels = jsut_labels()
    data = []
    for name in sorted(labels)[:n]:
        ph = labels[name]
        data.append((ph, mora_features(JSUT / "jsut/basic5000" / f"{name}.wav", [m for p, _ in ph for m in p])))
    X, Y, G = [], [], []
    for si, (ph, F) in enumerate(data):
        for pi, i, x in boundaries(F, [len(m) for m, _ in ph]):
            X.append(x)
            Y.append(int(ph[pi][1] == i))
            G.append(si)
    X, Y, G, cut = np.array(X), np.array(Y), np.array(G), int(len(data) * 0.75)
    clf = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05).fit(X[G < cut], Y[G < cut])
    ok = total = 0
    for ph, F in data[cut:]:
        for (m, nuc), h in zip(ph, decide(clf, F, [len(m) for m, _ in ph]), strict=False):
            if h is not None:
                ok += h == (0 if nuc == len(m) else nuc)
                total += 1
    print(f"JSUT, {len(data) - cut} sentences not learnt from: {ok} of {total} phrases heard as labelled ({ok / total:.0%})")
    MODEL.parent.mkdir(exist_ok=True)
    MODEL.write_bytes(pickle.dumps(clf))


def written(hl):
    # the dictionary's accent of a phrase from its H / L, in decide()'s terms
    for i in range(len(hl) - 1):
        if hl[i] == "H" and hl[i + 1] == "L":
            return i + 1
    return 0


def norm_ph(s):
    return " ".join(p.lower() for p in s.split() if p not in ("pau", "sil"))


def gold_phonemes():
    # item -> the phonemes of each right reading of the hard set (the parity texts are read as OpenJTalk reads them)
    out = {}
    for line in (HERE.parent / "data/hard_set.tsv").read_text().splitlines():
        if line and not line.startswith("#"):
            name, _, _, gold = line.split("\t")[:4]
            out[f"hard.{name}"] = {norm_ph(pyopenjtalk.g2p(g)) for g in gold.split("|")}
    return out


def audio_sets(item, x, refcheck, gold):
    # (name, wav) of every audio of the item that reads it as the dictionary does
    mine = norm_ph(" ".join(p for ph in x["phrases"] for m in ph["morae"] for p in m["ph"]))
    out = []
    if item not in gold or mine in gold[item]:
        out += [(s, HERE / "audio/ref" / s / f"{item}.wav") for s in REFS if refcheck.get(s, {}).get(item, {}).get("ok")]
    for v in OURS:
        out += [(f"{v}.{r}", HERE / "audio/ours/tool" / v / f"{item}.{r}.wav") for r in x["same"]]
    return [(n, w) for n, w in out if w.exists()]


def refs():
    clf = pickle.loads(MODEL.read_bytes())
    P = json.loads((HERE / "results/phrases.json").read_text())
    refcheck = json.loads((HERE / "results/refcheck.json").read_text())
    gold, out = gold_phonemes(), {}
    for item, x in P.items():
        morae = [m["ph"] for ph in x["phrases"] for m in ph["morae"]]
        sizes = [len(ph["morae"]) for ph in x["phrases"]]
        got = {n: decide(clf, mora_features(w, morae), sizes) for n, w in audio_sets(item, x, refcheck, gold)}
        out[item] = [
            {"text": ph["text"], "dict": written([m["hl"] for m in ph["morae"]]), "morae": len(ph["morae"]), **{n: g[i] for n, g in got.items()}}
            for i, ph in enumerate(x["phrases"])
        ]
    (HERE / "results/accent.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))


def heard_by(ph, v):
    return [g for k, g in ph.items() if (k == v or k.startswith(v + ".")) and g is not None]


def consensus(ph):
    # the accent the references heard, when at least two heard one and all agree
    h = [ph[s] for s in REFS if ph.get(s) is not None]
    return h[0] if len(h) >= 2 and len(set(h)) == 1 else None


def report():
    R = json.loads((HERE / "results/accent.json").read_text())
    rows = [ph for item in R.values() for ph in item if ph["morae"] >= 2]
    for i, a in enumerate(REFS):
        for b in REFS[i + 1 :]:
            both = [ph for ph in rows if ph.get(a) is not None and ph.get(b) is not None]
            print(f"{a} = {b}: {sum(ph[a] == ph[b] for ph in both)} of {len(both)}")
    for v in REFS + OURS:
        h = [(g, ph["dict"]) for ph in rows for g in heard_by(ph, v)]
        print(f"{v} = dictionary: {sum(g == d for g, d in h)} of {len(h)} ({sum(g == d for g, d in h) / max(len(h), 1):.0%})")
    C = [(ph, consensus(ph)) for ph in rows]
    C = [(ph, c) for ph, c in C if c is not None]
    print(f"phrases where the references agree: {len(C)}; the dictionary has the same accent in {sum(ph['dict'] == c for ph, c in C)}")
    for v in OURS:
        h = [(g, c) for ph, c in C for g in heard_by(ph, v)]
        print(f"  {v} = the references: {sum(g == c for g, c in h)} of {len(h)} ({sum(g == c for g, c in h) / max(len(h), 1):.0%})")
    miss = Counter(f"{ph['text']} (dictionary {ph['dict']}, references {c})" for ph, c in C if ph["dict"] != c)
    print("the dictionary differs from the references:", "; ".join(k for k, _ in miss.most_common()))


if __name__ == "__main__":
    {"train": lambda: train(int(sys.argv[2]) if len(sys.argv) > 2 else 5000), "refs": refs, "report": report}[sys.argv[1]]()
