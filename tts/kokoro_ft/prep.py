"""Build training targets. ja: real audio + YomiScript accent marks -> DTW-aligned durations, F0, N
(speaker-normalised to Kokoro voice: total duration rescaled to teacher, log-F0 & N mean-shifted).
distill (en/fr/zh, no marks): Kokoro's own predictions as targets (anti-forgetting)."""

import os
import sys

import librosa
import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ftlib as F


def dtw_durs(tw, rw, tdur):
    a = F.logmel(tw, F.HOP_DUR).numpy()
    b = F.logmel(rw, F.HOP_DUR).numpy()
    _, wp = librosa.sequence.dtw(X=a, Y=b, metric="euclidean")
    wp = wp[::-1]
    nT = int(tdur.sum())
    owner = np.repeat(np.arange(len(tdur)), tdur)  # teacher frame -> token
    rd = np.zeros(len(tdur))
    seen = set()
    for i, j in wp:
        if j in seen or i >= nT:
            continue
        seen.add(j)
        rd[owner[i]] += 1
    return rd  # real frames per token (sum ~= real length)


def resample_seg(x, segs, new):
    out = []
    for (s, e), n in zip(segs, new, strict=False):
        if n == 0:
            continue
        seg = x[s : max(e, s + 1)] if s < len(x) else x[-1:]
        out.append(seg[np.minimum((np.arange(n) * len(seg) / n).astype(int), len(seg) - 1)])
    return np.concatenate(out) if out else np.zeros(0, np.float32)


def make_ja(m, ys_ph, wav, sr, vpack, dev):
    if sr != F.SR:
        wav = librosa.resample(wav.astype(np.float32), orig_sr=sr, target_sr=F.SR)
    wav, _ = librosa.effects.trim(wav, top_db=35)
    ids_m = F.ids_of(m, ys_ph, True)
    ids_p = F.ids_of(m, ys_ph, False)
    rs = vpack[min(len(ids_m) - 3, len(vpack) - 1)].to(dev)
    tdur, tF0, tN, tw = F.teacher(m, torch.tensor([ids_p], device=dev), rs)
    tdur = tdur.cpu().numpy()
    rd = dtw_durs(tw.float().cpu().numpy(), wav, tdur)
    # scale to teacher total, integer, min 1 for phonemes
    nd = rd * tdur.sum() / max(rd.sum(), 1)
    nd = np.maximum(np.round(nd), 1).astype(int)
    # real segments in F0 frames (2 per dur frame)
    cs = np.concatenate([[0], np.cumsum(rd)]) * 2
    segs = [(int(cs[i]), int(cs[i + 1])) for i in range(len(rd))]
    f0 = F.f0_of(wav)
    N = F.log_norm(F.logmel(wav)).numpy()
    f0w = resample_seg(f0, segs, nd * 2)
    Nw = resample_seg(N, segs, nd * 2)
    tF0 = tF0.cpu().numpy()
    tN = tN.cpu().numpy()
    v = f0w > 0
    tv = tF0 > 50
    if v.sum() > 5 and tv.sum() > 5:
        f0w[v] = np.exp(np.log(f0w[v]) - np.log(f0w[v]).mean() + np.log(tF0[tv]).mean())
    Nw = Nw - Nw.mean() + tN.mean()
    # insert zero-duration marks
    dur = []
    k = 0
    for i in ids_m:
        if i in F.MARK_IDS.values():
            dur.append(0)
        else:
            dur.append(int(nd[k]))
            k += 1
    return dict(ids=ids_m, dur=dur, f0=f0w.astype(np.float32), n=Nw.astype(np.float32))


def make_distill(m, ph, vpack, dev):
    ids = F.ids_of(m, ph, False)
    rs = vpack[min(len(ids) - 3, len(vpack) - 1)].to(dev)
    d, f0, n, _ = F.teacher(m, torch.tensor([ids], device=dev), rs, audio=False)
    return dict(ids=ids, dur=d.cpu().tolist(), f0=f0.cpu().numpy(), n=n.cpu().numpy())
