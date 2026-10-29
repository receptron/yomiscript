"""Language-universal YomiScript prosody layer for Kokoro: per-syllable/mora pitch targets (semitones) -> F0 override."""

import re
import sys

import numpy as np
import soundfile as sf
import torch

sys.path.insert(0, ".")
import matplotlib
from huggingface_hub import hf_hub_download
from kokoro import KModel
from ys2kokoro import zsyl
from ys2kokoro_v2 import jmap, k2h, parse

matplotlib.use("Agg")
import matplotlib.pyplot as plt

SMALL = set("ャュョァィゥェォ")
VL = ("k", "s", "ɕ", "t", "ʨ", "ʦ", "h", "ç", "ɸ", "p")


# each unit: (phonemes, contour) contour = list of semitone points spread over the unit, or None (keep Kokoro), plus phrase idx
def ja_units(body, end):
    U = []
    ph = 0
    for chunk in re.split(r"([#_])", body):
        if chunk in "#_":
            if chunk == "_":
                U.append((", ", None, ph))
            ph += 1
            continue
        state = "L" if "[" in chunk else "H"
        moras = []
        marks = []
        for c in chunk:
            if c in "[]":
                marks.append((len(moras) - 1, c))
                continue
            if c in SMALL and moras:
                moras[-1] += c
            else:
                moras.append(c)
        rise = {k for k, c in marks if c == "["}
        fall = {k for k, c in marks if c == "]"}
        h = k2h("".join(moras))
        mi = []
        [mi.extend([k] * len(m)) for k, m in enumerate(moras)]
        ps = [""] * len(moras)
        for i, c in enumerate(h):
            ps[mi[i]] += jmap(h[i - 1] if i else None, c, h[i + 1] if i + 1 < len(h) else None)
        hk = 0
        for k, p in enumerate(ps):
            if state == "H":
                v = 2.5 - 0.45 * hk
                hk += 1  # gradual declination inside a high stretch
            else:
                v = -2.0 if k == 0 else -2.5 - 0.3 * hk
            # devoiced: high vowel i/ɯ between voiceless consonants -> leave Kokoro's F0 (light handling)
            nxt = ps[k + 1] if k + 1 < len(ps) else ""
            dev = p[-1:] in ("i", "ɯ", "ɨ") and p.startswith(VL) and (nxt.startswith(VL) or (k == len(ps) - 1 and end == "$" and p in ("sɯ", "sɨ")))
            U.append((p, None if dev else [v], ph))
            if k in rise:
                state = "H"
            if k in fall:
                state = "L"
    return U


TC = {"1": [3, 3], "2": [-1, 3.5], "3": [-3, -4.5, -3], "4": [4, -3], "5": None}


def zh_units(body, end):
    U = []
    ph = 0
    ws = body.split(" ")
    for w in ws:
        if w in ("#", "_"):
            if w == "_":
                U.append((", ", None, ph))
            ph += 1
            continue
        if U and U[-1][0] != ", ":
            U.append((" ", None, ph))
        for s in w.split("."):
            t = re.match(r"[a-zü]+(\d)(?:>(\d))?", s)
            tt = t.group(2) or t.group(1)
            U.append((zsyl(s), TC[tt], ph))
    return U


VOW = "AIOQWYaeiouæɑɒɔəɚɛɜɪʊʌᵊɐøœɔ̃"


def en_syl(x, gb):
    for a, b in [("tʃ", "ʧ"), ("dʒ", "ʤ"), ("eɪ", "A"), ("aɪ", "I"), ("aʊ", "W"), ("ɔɪ", "Y"), ("oʊ", "O"), ("əʊ", "Q"), ("r", "ɹ"), ("l̩", "ᵊl"), ("x", "k")]:
        x = x.replace(a, b)
    x = x.replace("ɝ", "ɜː" if gb else "ɜɹ").replace("ɚ", "ə" if gb else "əɹ")
    st = ""
    if x[:1] in "ˈˌ":
        st, x = x[0], x[1:]
    if st:
        m = re.search("[" + VOW + "]", x)
        x = x[: m.start()] + st + x[m.start() :] if m else st + x
    return x, st


def eufr_units(lang, body, end):
    U = []
    ph = 0
    gb = lang == "en-GB"
    toks = body.split(" ")
    for _wi, w in enumerate(toks):
        if w in ("#", "_"):
            # continuation rise on syllable before boundary
            for j in range(len(U) - 1, -1, -1):
                if U[j][1] is not None:
                    U[j] = (U[j][0], U[j][1] + [2.5], U[j][2])
                    break
            if w == "_":
                U.append((", ", None, ph))
            ph += 1
            continue
        if U and U[-1][0] != ", ":
            U.append((" ", None, ph))
        syls = w.replace("‿", "").split(".")
        for j, s in enumerate(syls):
            if lang == "fr":
                p, st = s, ""
            else:
                p, st = en_syl(s, gb)
                if not gb and not NOFLAP and j > 0 and p[:1] in "td" and len(p) > 1 and p[1] in VOW and U and U[-1][0][-1:] in VOW + "ɹ":
                    p = "ɾ" + p[1:]
            if lang == "fr":
                c = [0.5] if j == len(syls) - 1 else [-0.5]  # French: mild word-final prominence
            else:
                c = {"ˈ": [3.0, 1.0], "ˌ": [1.0]}.get(st, [-1.5])
            U.append((p, c, ph))
    # final: $ fall, ? rise on last contoured unit
    for j in range(len(U) - 1, -1, -1):
        if U[j][1] is not None:
            U[j] = (U[j][0], (U[j][1][:1] + [-5]) if end == "$" else (U[j][1][:1] + [6]), U[j][2])
            break
    return U


def units(ys):
    lang, body, end = parse(ys)
    U = {"ja": ja_units, "zh": zh_units}.get(lang)
    U = U(body, end) if U else eufr_units(lang, body, end)
    return lang, U + [("?" if end == "?" else ".", None, U[-1][2] if U else 0)]


m = KModel(repo_id="hexgrad/Kokoro-82M").eval()
VC = {}
NOFLAP = False


def voice(v):
    if v not in VC:
        VC[v] = torch.load(hf_hub_download("hexgrad/Kokoro-82M", f"voices/{v}.pt"), weights_only=True)
    return VC[v]


def synth(ys, vname, mode="acc", smooth=5, dstep=0.6, plot=None):
    lang, U = units(ys)
    ids = [0]
    uid = [-1]
    for k, (p, _c, _ph) in enumerate(U):
        for ch in p:
            if ch in m.vocab:
                ids.append(m.vocab[ch])
                uid.append(k)
    ids.append(0)
    uid.append(-1)
    uid = np.array(uid)
    ref = voice(vname)[len(ids) - 2]
    x = torch.LongTensor([ids])
    L = len(ids)
    with torch.no_grad():
        il = torch.tensor([L])
        tm = torch.zeros(1, L, dtype=torch.bool)
        d_en = m.bert_encoder(m.bert(x, attention_mask=(~tm).int())).transpose(-1, -2)
        s = ref[:, 128:]
        d = m.predictor.text_encoder(d_en, s, il, tm)
        xx, _ = m.predictor.lstm(d)
        dur = torch.round(torch.sigmoid(m.predictor.duration_proj(xx)).sum(-1)).clamp(min=1).long().squeeze()
        idx = torch.repeat_interleave(torch.arange(L), dur)
        aln = torch.zeros(L, idx.shape[0])
        aln[idx, torch.arange(idx.shape[0])] = 1
        aln = aln[None]
        F0, N = m.predictor.F0Ntrain(aln.new_tensor(d.transpose(-1, -2) @ aln), s)
        f0 = F0[0].numpy().copy()
        new = f0.copy()
        if mode != "orig":
            fu = uid[np.repeat(np.arange(L), dur.numpy() * 2)][: len(f0)]
            voiced = f0 > 60
            lo = np.log2(np.maximum(f0, 1)) * 12
            st = np.full(len(f0), np.nan)
            for k, (_p, c, ph) in enumerate(U):
                fr = np.where((fu == k))[0]
                if c is None or len(fr) == 0:
                    continue
                cc = [(-v if mode == "inv" else v) for v in c]
                st[fr] = np.interp(np.linspace(0, 1, len(fr)), np.linspace(0, 1, len(cc)), cc) - dstep * ph
            # phrase-wise anchor: keep Kokoro's own register per phrase (mean of voiced Kokoro F0 in semitones)
            ok = ~np.isnan(st) & voiced
            tgt = np.full(len(f0), np.nan)
            phr = np.array([U[k][2] if k >= 0 else -1 for k in fu])
            for ph in set(phr[ok]):
                sel = ok & (phr == ph)
                tgt[sel] = st[sel] - st[sel].mean() + lo[sel].mean()
            okk = ~np.isnan(tgt)
            if okk.any():
                full = np.interp(np.arange(len(f0)), np.where(okk)[0], tgt[okk])
                full = np.convolve(np.pad(full, smooth // 2, mode="edge"), np.ones(smooth) / smooth, "valid")
                new = np.where(okk, 2 ** (full / 12), f0)
        a = m.decoder(m.text_encoder(x, il, tm) @ aln, torch.tensor(new, dtype=torch.float32)[None], N, ref[:, :128]).squeeze().numpy()
    if plot:
        plt.figure(figsize=(12, 4))
        plt.plot(f0, label="Kokoro orig")
        plt.plot(new, label=mode)
        plt.legend()
        plt.ylabel("Hz")
        plt.savefig(plot, dpi=100)
        plt.close()
    return a


if __name__ == "__main__":
    D = "./"
    J1 = "^ア[イジョーノタメ]ニ_カ]ノジョノ#ケ[ッテ]ンガ#ミ[エ]ナカッタ$"
    J2 = "^マ[ネージャーワ_ワ[タシガ#カ]レト#イ[ッショニ#ク[ーコーニ#イ[ッテ]ワ#ド]ーカト#イ[ーダ]シタ$"
    Z = "^zh|ni3>2 hao3 _ wo3 shi4 xue2.sheng1$"
    E = "^en-US|wi ˈnid tə ˈbaɪ ˈmɪlk _ ˈɛɡz _ ənd ˈbɹɛd$"
    F = "^fr|sɛ.t‿œ̃ pə.ti.t‿o.tɛl # o bɔʁ də la mɛʁ$"
    jobs = [("ja_1v4", J1, "jf_alpha"), ("ja_2v4", J2, "jf_alpha"), ("zh_1v4", Z, "zf_xiaoxiao"), ("en-US_1v4", E, "af_heart"), ("fr_1v4", F, "ff_siwis")]
    for n, ys, v in jobs:
        sf.write(D + n + ".wav", synth(ys, v, "acc", plot=D + n + "_f0.png"), 24000, subtype="PCM_16")
        sf.write(D + n + "_orig.wav", synth(ys, v, "orig"), 24000, subtype="PCM_16")
        print(n, units(ys)[1][:6])
