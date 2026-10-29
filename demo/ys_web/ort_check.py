import sys

import numpy as np
import onnxruntime as ort
import soundfile as sf
import torch

sys.path.insert(0, "../../tts/kokoro_ys")
import prosody_v4 as pv
from f0_override import f0_override

S = {n: ort.InferenceSession(f"models/{n}.onnx", providers=["CPUExecutionProvider"]) for n in ["enc", "f0n", "dec"]}


def synth(ys, v):
    lang, U = pv.units(ys)
    ids = [0]
    uid = [-1]
    for k, (p, _c, _ph) in enumerate(U):
        for ch in p:
            if ch in pv.m.vocab:
                ids.append(pv.m.vocab[ch])
                uid.append(k)
    ids += [0]
    uid = np.array(uid + [-1])
    ref = pv.voice(v)[len(ids) - 2].numpy().astype(np.float32)
    dur, d, t = S["enc"].run(None, {"ids": np.array([ids], dtype=np.int64), "ref": ref})

    def rep(x):
        return np.repeat(x, dur, axis=2)

    F0, N = S["f0n"].run(None, {"en": rep(d), "ref": ref})
    F1 = f0_override(F0[0], uid, dur, U)[None]
    a = S["dec"].run(None, {"asr": rep(t), "F0": F1, "N": N, "ref": ref})[0]
    return a, F0[0], F1[0], dur


J1 = "^ア[イジョーノタメ]ニ_カ]ノジョノ#ケ[ッテ]ンガ#ミ[エ]ナカッタ$"
a, f0, f1, dur = synth(J1, "jf_alpha")
sf.write("ja_1_ort.wav", a, 24000)
ref, _ = sf.read("ja_1v4.wav")
print("len ort", len(a), "torch", len(ref))
# compare F0 via torch path
torch.manual_seed(0)
import librosa


def lf0(x):
    f, _, _ = librosa.pyin(x.astype(float), fmin=80, fmax=600, sr=24000, frame_length=1024)
    return f


fa, fr = lf0(a), lf0(ref)
n = min(len(fa), len(fr))
ok = ~np.isnan(fa[:n]) & ~np.isnan(fr[:n])
print("pyin F0 corr", np.corrcoef(fa[:n][ok], fr[:n][ok])[0, 1], "median abs semitone diff", np.median(np.abs(12 * np.log2(fa[:n][ok] / fr[:n][ok]))))
import json

lang, U = pv.units(J1)
ids = [0]
uid = [-1]
for k, (p, _c, _ph) in enumerate(U):
    for ch in p:
        if ch in pv.m.vocab:
            ids.append(pv.m.vocab[ch])
            uid.append(k)
uid += [-1]
json.dump({"f0": f0.tolist(), "f1": f1.tolist(), "dur": dur.tolist(), "uid": uid, "U": U}, open("f0ref.json", "w"))
