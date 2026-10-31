"""The prosody score: how closely our pitch follows the references', mora by mora (results/<run>.json).

Our audio comes with the time of every mora (ours.mjs). Each reference that read its text right (refcheck.py) is
aligned to ours by DTW on MFCCs, so each of our morae gets a stretch of the reference. In both, the pitch (Praat,
semitones from the utterance's median) is the median of the voiced frames of the mora; a mora more than an octave
from the median is a tracking error and is left out. Per item and reference:

  rmse  the root mean square distance of the two contours in semitones, each sentence centred on its median
        (lower is closer; the main score)
  corr  Pearson correlation of the two mora contours

The references' mean contour is scored the same way (`mean`). `refs` is the rmse of the references against each
other: about the closest a score can get on that item. Against the blind listening answers (README.md), rmse picked
the variant heard as the worst in 17 of 22 sentences; measures on the moves between neighbouring morae did not
(about chance): the alignment is good for levels, not for single moves.

usage: .venv/bin/python score.py <run> [variant …]   e.g. listen-dict, tool (a directory under audio/ours); with\n       variants, only those are scored again
"""

import json
import sys
from pathlib import Path

import librosa
import numpy as np
import parselmouth

HERE = Path(__file__).parent
HOP = 0.01  # seconds per frame, for both the pitch and the MFCCs
_cache = {}


def features(wav):
    # (semitones per frame, nan where unvoiced; MFCCs per frame without c0, mean-normalized), cached
    if wav not in _cache:
        y, sr = librosa.load(wav, sr=24000)
        p = parselmouth.Sound(y, sr).to_pitch_ac(time_step=HOP, pitch_floor=60, pitch_ceiling=600)
        f0 = p.selected_array["frequency"]
        f0 = np.where(f0 > 0, f0, np.nan)
        st = 12 * np.log2(f0 / np.nanmedian(f0))
        t0 = p.xs()[0]  # Praat's first frame is centred half a window in
        hop = int(HOP * sr)
        m = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=21, n_fft=1024, hop_length=hop)[1:]
        m = m - m.mean(axis=1, keepdims=True)
        m = np.vstack([m, librosa.feature.delta(m, width=5)])
        _cache[wav] = (st, t0, m)
    return _cache[wav]


def pitch_at(st, t0, a, b):
    # the median of the voiced pitch frames in [a, b) seconds
    i, j = int(max(0, (a - t0) / HOP)), int(max(1, np.ceil((b - t0) / HOP)))
    v = st[i:j]
    v = v[~np.isnan(v)]
    return float(np.median(v)) if len(v) else np.nan


def our_contour(wav, morae):
    st, t0, _ = features(wav)
    return np.array([pitch_at(st, t0, m["start"], m["end"]) for m in morae])


def ref_contour(ours_wav, ref_wav, morae):
    # the reference's pitch over the stretch DTW maps each of our morae to
    _, _, mo = features(ours_wav)
    st, t0, mr = features(ref_wav)
    _, wp = librosa.sequence.dtw(X=mo, Y=mr, metric="cosine")
    to_ref = {}
    for i, j in wp:
        to_ref.setdefault(int(i), []).append(int(j))
    out = []
    for m in morae:
        js = [j for i in range(int(m["start"] / HOP), max(int(m["start"] / HOP) + 1, int(m["end"] / HOP))) for j in to_ref.get(i, [])]
        out.append(pitch_at(st, t0, min(js) * HOP, (max(js) + 1) * HOP) if js else np.nan)
    return np.array(out)


OCTAVE = 12.0  # semitones from the median: a mora pitch farther than this is a tracking error (octave jump), dropped


def centred(c):
    c = c - np.nanmedian(c)
    return np.where(np.abs(c) > OCTAVE, np.nan, c)


def corr(a, b):
    ok = ~np.isnan(a) & ~np.isnan(b)
    return float(np.corrcoef(a[ok], b[ok])[0, 1]) if ok.sum() >= 4 else None


def by_sentence(c, morae):
    # each sentence centred on its own median
    c, sent = c.copy(), np.array([m["sent"] for m in morae])
    for k in set(sent):
        m = sent == k
        if np.any(~np.isnan(c[m])):
            c[m] -= np.nanmedian(c[m])
    return c


def rmse(a, b, morae):
    d = by_sentence(a, morae) - by_sentence(b, morae)
    d = d[~np.isnan(d)]
    return float(np.sqrt(np.mean(d**2))) if len(d) >= 4 else None


def refs_for(item, ok):
    return [s for s, items in ok.items() if items.get(item, {}).get("ok")]


def score_item(wav, morae, refs):
    # per reference and for their mean: rmse and corr; refs: how far the references are from each other
    ours = centred(our_contour(wav, morae))
    rc = {s: centred(ref_contour(wav, HERE / "audio/ref" / s / f"{item_of(wav)}.wav", morae)) for s in refs}
    out = {s: {"rmse": rmse(ours, c, morae), "corr": corr(ours, c)} for s, c in rc.items()}
    if rc:
        mean = centred(np.nanmean(np.array(list(rc.values())), axis=0))
        out["mean"] = {"rmse": rmse(ours, mean, morae), "corr": corr(ours, mean)}
    pairs = [x for a in rc for b in rc if a < b if (x := rmse(rc[a], rc[b], morae)) is not None]
    out["refs"] = {"rmse": float(np.mean(pairs)) if pairs else None}
    out["contours"] = {"ours": nan_none(ours), **{s: nan_none(c) for s, c in rc.items()}, "sent": [m["sent"] for m in morae]}
    return out


def nan_none(c):
    return [None if np.isnan(v) else round(float(v), 3) for v in c]


def item_of(wav):
    # <set>.<name>[.<rep>].wav -> <set>.<name>
    return ".".join(Path(wav).stem.split(".")[:2])


def main():
    # score.py <run> [variant …]: only those variants are scored, the others kept from the previous results
    run, only = sys.argv[1], set(sys.argv[2:])
    ok = json.loads((HERE / "results/refcheck.json").read_text())
    dest = HERE / "results" / f"{run.replace('/', '-')}.json"
    out = json.loads(dest.read_text()) if only and dest.exists() else {}
    for d in sorted((HERE / "audio/ours" / run).iterdir()):
        if only and d.name not in only:
            continue
        out[d.name] = {}
        for j in sorted(d.glob("*.json")):
            x = json.loads(j.read_text())
            refs = refs_for(item_of(j), ok)
            if x["morae"] and refs:
                out[d.name][j.stem] = score_item(str(j.with_suffix(".wav")), x["morae"], refs)
        print(d.name, summary(out[d.name]))
    dest.write_text(json.dumps(out, indent=0))


def summary(items):
    # the mean rmse and corr against the references' mean
    m = [v["mean"] for v in items.values() if "mean" in v]
    rs = [x["rmse"] for x in m if x["rmse"] is not None]
    cs = [x["corr"] for x in m if x["corr"] is not None]
    return f"items {len(m)}  rmse {np.mean(rs):.2f} st  corr {np.mean(cs):.3f}"


if __name__ == "__main__":
    main()
