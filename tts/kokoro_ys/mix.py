"""YomiScript section policy (v9). Each {lang|body} section is synthesized as its own YomiScript utterance, then joined.
Policy:
  ja: F0 override from accent marks | en-US/en-GB: Kokoro pitch + stress marks | fr: Kokoro pitch | zh: tone F0 override
  voice: matrix-language voice; one-word section -> pure section-language voice (except ja inside non-ja matrix); longer section -> 20% blend toward it
  embedded en inside non-en matrix: no American flap-t; ja inside non-ja matrix: ɨ->u ɕ->ʃ ʑ->ʒ ʨ->ʧ ʥ->ʤ
  join: loudness matched to first section, 15 ms crossfade + 60 ms pause; leading audio of the utterance is never trimmed."""

import re
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, ".")
import prosody_v4 as pv

POLICY = {"ja": "f0_override", "en-US": "kokoro", "en-GB": "kokoro", "fr": "kokoro", "zh": "f0_override"}
VOICE = {"ja": "jf_alpha", "en-US": "af_heart", "en-GB": "bf_emma", "fr": "ff_siwis", "zh": "zf_xiaoxiao"}
BLEND = 0.2
SR = 24000
PURE1 = True
TAG = r"\{(ja|en-US|en-GB|fr|zh)\|([^{}]*)\}"
_ja = pv.ja_units
JA_FOREIGN = {"on": False}
_TR = str.maketrans({"ɨ": "u", "ɕ": "ʃ", "ʑ": "ʒ", "ʨ": "ʧ", "ʥ": "ʤ"})


def _ja_units(b, e):
    U = _ja(b, e)
    return [(p.translate(_TR), c, ph) for p, c, ph in U] if JA_FOREIGN["on"] else U


pv.ja_units = _ja_units


def segs(ys):
    m = re.match(r"^\^(?:(en-US|en-GB|fr|zh)\|)?(.*)([$?])$", ys)
    top = m.group(1) or "ja"
    b, end = m.group(2), m.group(3)
    S = []
    pos = 0
    for mm in re.finditer(TAG, b):
        S += [(top, b[pos : mm.start()]), (mm.group(1), mm.group(2))]
        pos = mm.end()
    S.append((top, b[pos:]))
    out = []
    for l, x in S:
        x = x.strip(" _#")
        if x:
            out.append((l, x))
    return top, out, end


def voice_for(top, l, x):
    if l == top:
        return VOICE[top]
    if PURE1 and len(x.split()) == 1 and (top == "ja" or l != "ja"):
        return VOICE[l]  # one-word non-ja section in any matrix (and any one-word section in ja); ja words inside other matrices stay on blend
    k = f"{VOICE[top]}+{VOICE[l]}@{BLEND}"
    if k not in pv.VC:
        pv.VC[k] = pv.voice(VOICE[top]) * (1 - BLEND) + pv.voice(VOICE[l]) * BLEND
    return k


def trim(a, lead=True, th=0.01):
    i = np.where(np.abs(a) > th)[0]
    return a if not len(i) else a[(max(i[0] - 240, 0) if lead else 0) : i[-1] + 480]


def synth(ys):
    top, S, end = segs(ys)
    P = []
    for i, (l, x) in enumerate(S):
        JA_FOREIGN["on"] = l == "ja" and top != "ja"
        pv.NOFLAP = l.startswith("en") and not top.startswith("en")
        e = end if i == len(S) - 1 else "$"
        P.append(pv.synth(("^" if l == "ja" else "^" + l + "|") + x + e, voice_for(top, l, x), "acc"))
    JA_FOREIGN["on"] = False
    pv.NOFLAP = False
    tgt = np.sqrt(np.mean(P[0] ** 2))
    out = trim(P[0], lead=False)
    n = int(0.015 * SR)
    fo = np.linspace(1, 0, n)
    for p in P[1:]:
        p = trim(p) * tgt / max(np.sqrt(np.mean(p**2)), 1e-6)
        out[-n:] *= fo
        p[:n] *= fo[::-1]
        out = np.concatenate([out, np.zeros(int(0.06 * SR)), p])
    return out / max(1, np.abs(out).max() / 0.95)


S = [
    ("mix_1v12", "^キョ]ーワ#{en-US|mə.ˈʃiːn ˈlɝːn.ɪŋ}ノ#ベ[ンキョーヲ#シ[マ]ス$"),
    ("mix_2v12", "^en-US|maɪ ˈfɹɛnd {ja|タ[ナカ} ˈlɪvz ɪn {ja|ト[ーキョー} _ ˈnɪɹ {ja|シ[ブヤ}$"),
    ("mix_3v12", "^ア[シタノ#{en-US|ˈmi.tɪŋ}デ#{en-US|ˈdeɪ.tɑː ˈsaɪ.əns}ノ#ハ[ナシヲ#シ[マ]ス$"),
    ("mix_4v12", "^en-US|ˈaɪ ˈɹi.sənt.li ˈvɪz.ɪ.tɪd {ja|キョ]ート} ənd ˈeɪt {ja|ス]シ} ˈðɛɹ$"),
    ("mix_5v12", "^ア[タラシ]イ#{en-US|ˈsmɑɹt.foʊn}ヲ#カ[イマ]シタ$"),
    ("mix_6v12", "^en-US|wi ˈhæd ˈɹɑ.mən fəɹ ˈlʌnʧ ˈɪn {ja|オ[ーサカ}$"),
    ("mix_6v12_pause", "^en-US|wi ˈhæd ˈɹɑ.mən fəɹ ˈlʌnʧ _ ɪn {ja|オ[ーサカ}$"),
    ("mix_6v12_q", "^en-US|wi ˈhæd ˈɹɑ.mən fəɹ ˈlʌnʧ ʔɪn {ja|オ[ーサカ}$"),
    ("mix_9v12", "^en-US|aɪ ˈmɛt {zh|wang2 fang1} ɪn {zh|bei3.jing1} ˈlæst ˈjɪɹ$"),
    ("mix_10v12", "^fr|ʒɛm bjɛ̃ lə {ja|カ[ラオケ} _ avɛk mez‿a.mi$"),
    ("mix_11v12", "^zh|wo3 zui4 xi3.huan1 {en-US|ˈpaɪ.θɑn}$"),
    ("mix_12v12", "^ケ[サワ#ク[ロワ]ッサンヲ#タ[ベマ]シタ$"),
    ("mix_7v12", "^チュ[ーゴクゴデワ#{zh|ni3>2 hao3}ト#イ[イマ]ス$"),
    ("mix_8v12", "^フ[ランスゴデワ#{fr|bɔ̃.ʒuʁ}ト#イ[イマ]ス$"),
]
ALT = [("mix_12v12_fr", "^ケ[サワ#{fr|kʁwa.sɑ̃}ヲ#タ[ベマ]シタ$")]  # French pronunciation alternative, 20% blend (PURE1 off)
if __name__ == "__main__":
    for n, ys in S:
        sf.write(f"./{n}.wav", synth(ys), SR, subtype="PCM_16")
    PURE1 = False
    for n, ys in ALT:
        sf.write(f"./{n}.wav", synth(ys), SR, subtype="PCM_16")
    PURE1 = True
    print("done")
