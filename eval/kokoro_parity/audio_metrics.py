"""Audio comparison against the original Kokoro: correlation, SNR and mel-spectrum L1 of each of our wavs
(ours.<m>.<name>.wav, written by compare.mjs) against ref.json's wavs, next to the original's own run-to-run variation
(a second ref_kokoro.py run in another directory). The decoder draws random numbers, so two original runs differ too.
usage: python audio_metrics.py ref_dir ref2_dir [m ...]"""
import json, os, sys
import numpy as np, soundfile as sf, librosa

def cmp(x, y):
    n = min(len(x), len(y)); x, y = x[:n], y[:n]
    snr = 10 * np.log10((y ** 2).sum() / max(((x - y) ** 2).sum(), 1e-20))
    corr = (x * y).sum() / np.sqrt((x * x).sum() * (y * y).sum())
    X = librosa.power_to_db(librosa.feature.melspectrogram(y=x, sr=24000, n_mels=80))
    Y = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=24000, n_mels=80))
    return corr, snr, np.abs(X - Y).mean()

ref, ref2, ms = sys.argv[1], sys.argv[2], sys.argv[3:] or ["fp32", "w16"]
R = json.load(open(os.path.join(ref, "ref.json")))
rows = {k: [] for k in ["original 2nd run"] + ms}
for it in R["items"]:
    for c in it["chunks"]:
        a = sf.read(os.path.join(ref, c["wav"]))[0].astype(np.float32)
        rows["original 2nd run"].append(cmp(sf.read(os.path.join(ref2, c["wav"]))[0].astype(np.float32), a))
        for m in ms:
            f = os.path.join(ref, f"ours.{m}.{c['wav']}")
            if os.path.exists(f): rows[m].append(cmp(sf.read(f)[0].astype(np.float32), a))
voices = ', '.join(sorted({it['voice'] for it in R['items']}))
print(f"{'vs original ('+voices+')':28s} {'n':>3s} {'corr mean / min':>18s} {'SNR dB mean':>12s} {'mel L1 dB mean / max':>22s}")
for k, v in rows.items():
    if not v: continue
    v = np.array(v)
    print(f"{k:28s} {len(v):3d} {v[:,0].mean():8.4f} / {v[:,0].min():.4f} {v[:,1].mean():12.1f} {v[:,2].mean():12.2f} / {v[:,2].max():.2f}")
