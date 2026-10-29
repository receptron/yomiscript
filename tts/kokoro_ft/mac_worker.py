# runs inside ~/yomi_tts/venv ; cwd ~/yomi_tts/kokoro_ft
import base64
import glob
import io
import json
import os
import random
import re
import sys
import time
import traceback
import warnings

warnings.filterwarnings("ignore")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
import librosa
import soundfile as sf
import torch

W = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [W, W + "/kokoro_ys"]
import ftlib as F
import prep
import train
import ys_ja

R = os.environ.get("KFT_ROOT", os.path.expanduser("~/yomi_tts"))
O = R + "/kokoro_ft1"
os.makedirs(O, exist_ok=True)
S = {"t0": time.time()}
STEPS = int(os.environ.get("KFT_STEPS", "8000"))
dev = "mps" if torch.backends.mps.is_available() else "cpu"
try:
    m = F.load_model(dev).eval()
    F.synth(m, "koɲɲiʨiβa.", F.voice("jf_alpha"), dev)
except Exception:
    S["mps_err"] = traceback.format_exc()[-600:]
    dev = "cpu"
    m = F.load_model(dev).eval()
S["device"] = dev
print("device", dev, flush=True)
DP = O + "/data.pt"
if not os.path.exists(DP):
    # ---- JSUT text
    txt = {}
    for f in glob.glob(R + "/jsut/**/transcript_utf8.txt", recursive=True):
        for l in open(f, encoding="utf-8"):
            if ":" in l:
                k, v = l.strip().split(":", 1)
                txt[k] = v
    if not txt:
        import yaml

        for f in glob.glob(R + "/jsut-label/text_kana/basic5000.yaml"):
            for k, v in yaml.safe_load(open(f, encoding="utf-8")).items():
                txt[k] = v.get("text_level0") or v.get("text_level1")
    wavs = {os.path.basename(f)[:-4]: f for f in glob.glob(R + "/jsut/**/BASIC5000_*.wav", recursive=True)}
    keys = sorted(set(txt) & set(wavs))
    S["jsut_pairs"] = len(keys)
    print("jsut pairs", len(keys), flush=True)
    vj = F.voice("jf_alpha")
    D = []
    err = 0
    t = time.time()
    for i, k in enumerate(keys):
        try:
            ys = ys_ja.text2ys(txt[k])
            ph = ys_ja.ys2ph(ys)
            if len(F.ids_of(m, ph)) > 500:
                continue
            w, sr = sf.read(wavs[k], dtype="float32")
            x = prep.make_ja(m, ph, w, sr, vj, dev)
            x.update(lang="ja", voice="jf_alpha", ys=ys, key=k)
            D.append(x)
        except Exception:
            err += 1
            if err < 3:
                print("prep err", k, traceback.format_exc()[-300:], flush=True)
        if i % 500 == 0:
            print(f"prep ja {i}/{len(keys)} {time.time()-t:.0f}s", flush=True)
    S["ja_n"] = len(D)
    S["ja_err"] = err
    # ---- distill: fr/zh (box-built misaki phonemes) + en from gen_v1 YomiScript
    from ys2kokoro_v2 import convert

    dl = json.load(open(W + "/distill_ph.json"))
    en = []
    for f in sorted(glob.glob(os.environ.get("KFT_GEN", os.path.expanduser("~/yomiscript_gen_v1/data")) + "/en_*.jsonl")):
        for l in open(f, encoding="utf-8"):
            for s in re.findall(r'"(\^en(?:-US|-GB)?\|[^"]*[$?])"', l):
                en.append(s)
    random.seed(1)
    random.shuffle(en)
    for ys in en[:400]:
        try:
            lg, ph = convert(ys)
            dl.append(dict(lang=lg, voice="bf_emma" if lg == "en-GB" else "af_heart", ph=ph))
        except Exception:
            pass
    VC = {}
    for d in dl:
        try:
            x = prep.make_distill(m, d["ph"], VC.setdefault(d["voice"], F.voice(d["voice"])), dev)
            x.update(lang=d["lang"], voice=d["voice"])
            D.append(x)
        except Exception:
            pass
    from collections import Counter

    S["data"] = dict(Counter(x["lang"] for x in D))
    S["prep_s"] = round(time.time() - S["t0"])
    torch.save(D, DP)
else:
    S["data"] = "cached"
print("data", S.get("data"), flush=True)
del m
t = time.time()
mm, hist = train.main(DP, O, STEPS, dev, every=1000, accum=8, lr=1e-4, ja_frac=0.7, log=lambda s: print(s, flush=True))
S["train_s"] = round(time.time() - t)
S["val"] = [hist[0], hist[-1]]
# ---- samples (all saved 24k wav on Mac; 3 emitted)
mm.eval()
base = F.load_model(dev).eval()
SAM = {
    "tokyo_hashi": ("^ハ[シ]ト#ハ]シト#ハ[シデ]ス$", "jf_alpha"),
    "osaka_hashi": ("^ja-x-osaka|=ハ]シト#ハ[シ]ト#=ハシデ]ス$", "jf_alpha"),
    "ja_aijo": (ys_ja.text2ys("愛情のために彼女の欠点が見えなかった。"), "jf_alpha"),
    "ja_ame": ("^ア]メト#ア[メ_イ[ヌ]ト#カ[ゼデ]ス$", "jf_alpha"),
}
from ys2kokoro_v2 import convert

for n, ys, v in [("en", "^en-US|wi ˈnid tə ˈbaɪ ˈmɪlk _ ˈɛɡz _ ənd ˈbɹɛd$", "af_heart"), ("zh", "^zh|ni3>2 hao3 _ wo3 shi4 xue2.sheng1$", "zf_xiaobei")]:
    SAM[n] = (ys, v)
emit = ["tokyo_hashi", "osaka_hashi"]
res = {}
for n, (ys, v) in SAM.items():
    try:
        ph = ys_ja.ys2ph(ys) if not re.match(r"^\^(en|fr|zh)", ys) else convert(ys)[1]
        for tag, mod in (("ft", mm), ("base", base)):
            w = F.synth(mod, ph, F.voice(v), dev, keep_marks=(tag == "ft"))
            sf.write(f"{O}/s_{n}_{tag}.wav", w, 24000)
            res[f"{n}_{tag}"] = round(len(w) / 24000, 2)
    except Exception:
        res[n] = "ERR " + traceback.format_exc()[-200:]
S["samples"] = res
S["sample_dir"] = O
for n in emit:
    f = f"{O}/s_{n}_ft.wav"
    if not os.path.exists(f):
        continue
    w, _ = sf.read(f, dtype="float32")
    b = io.BytesIO()
    sf.write(b, librosa.resample(w, orig_sr=24000, target_sr=16000)[: 16000 * 3], 16000, format="FLAC")
    print("WAVB64_BEGIN", os.path.basename(f))
    print(base64.b64encode(b.getvalue()).decode())
    print("WAVB64_END", os.path.basename(f))
S["total_s"] = round(time.time() - S.pop("t0"))
print("SUMMARY", json.dumps(S, ensure_ascii=False, default=str))
