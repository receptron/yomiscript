"""Python copy of the Katarite's F0 rendering (f0Override in web/ys.js), for the ONNX check scripts (qeval.py, drift.py,
ort_check.py). The browser demo uses ys.js; drift.py compares the two."""

import numpy as np


def f0_override(f0, uid, dur, U, smooth=5, dstep=0.6):
    L = len(dur)
    fu = uid[np.repeat(np.arange(L), dur * 2)][: len(f0)]
    voiced = f0 > 60
    lo = np.log2(np.maximum(f0, 1)) * 12
    st = np.full(len(f0), np.nan)
    for k, (_, c, ph) in enumerate(U):
        fr = np.where(fu == k)[0]
        if c is None or len(fr) == 0:
            continue
        st[fr] = np.interp(np.linspace(0, 1, len(fr)), np.linspace(0, 1, len(c)), c) - dstep * ph
    ok = ~np.isnan(st) & voiced
    tgt = np.full(len(f0), np.nan)
    phr = np.array([U[k][2] if k >= 0 else -1 for k in fu])
    for ph in set(phr[ok]):
        sel = ok & (phr == ph)
        tgt[sel] = st[sel] - st[sel].mean() + lo[sel].mean()
    okk = ~np.isnan(tgt)
    if not okk.any():
        return f0
    full = np.interp(np.arange(len(f0)), np.where(okk)[0], tgt[okk])
    full = np.convolve(np.pad(full, smooth // 2, mode="edge"), np.ones(smooth) / smooth, "valid")
    return np.where(okk, 2 ** (full / 12), f0).astype(np.float32)
