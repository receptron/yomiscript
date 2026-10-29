"""YomiScript language-tag policy + inline section tags {lang|body} -> single Kokoro forward pass."""

import re
import sys

import soundfile as sf

sys.path.insert(0, ".")
import prosody_v4 as pv

POLICY = {"ja": "f0_override", "en-US": "kokoro", "en-GB": "kokoro", "fr": "kokoro", "zh": "f0_override"}  # zh: A/B pending (zh_1v4 vs zh_1v4_orig)
VOICE = {"ja": "jf_alpha", "en-US": "af_heart", "en-GB": "bf_emma", "fr": "ff_siwis", "zh": "zf_xiaoxiao"}
TAG = r"\{(ja|en-US|en-GB|fr|zh)\|([^{}]*)\}"


def sec_units(lang, body, end, ph0):
    if lang == "ja":
        U = pv.ja_units(body, end)
    elif lang == "zh":
        U = pv.zh_units(body, end)
    else:
        U = pv.eufr_units(lang, body, end)
    keep = POLICY[lang] == "f0_override"
    return [(p, (c if keep else None), ph + ph0) for p, c, ph in U]


def units(ys):
    m = re.match(r"^\^(?:(en-US|en-GB|en|fr|zh)\|)?(.*)([$?])$", ys)
    top = m.group(1) or "ja"
    body, end = m.group(2), m.group(3)
    U = []
    ph = 0
    pos = 0
    segs = []
    for mm in re.finditer(TAG, body):
        segs.append((top, body[pos : mm.start()]))
        segs.append((mm.group(1), mm.group(2)))
        pos = mm.end()
    segs.append((top, body[pos:]))
    for lang, b in segs:
        b = b.strip(" ")
        if lang == "ja":
            b = b.strip("#")
        if not b:
            continue
        if U and U[-1][0] not in (" ", ", "):
            U.append((" ", None, ph))
        su = sec_units(lang, b, end, ph)
        U += su
        ph = (su[-1][2] + 1) if su else ph
    return top, U + [("?" if end == "?" else ".", None, ph)]


pv.units = units
S = [
    ("mix_1", "^キョ]ーワ#{en-US|mə.ˈʃin ˈlɝ.nɪŋ}ノ#ベ[ンキョーヲ#シ[マ]ス$", "jf_alpha"),
    ("mix_2", "^en-US|maɪ ˈfɹɛnd {ja|タ[ナカ} ˈlɪvz ɪn {ja|ト[ーキョー} _ ˈnɪɹ {ja|シ[ブヤ}$", "af_heart"),
]
D = "./"
for n, ys, v in S:
    print(n, ys, "".join(p for p, _, _ in units(ys)[1]))
    sf.write(D + n + ".wav", pv.synth(ys, v, "acc", plot=D + n + "_f0.png"), 24000, subtype="PCM_16")
    sf.write(D + n + "_alt.wav", pv.synth(ys, "jm_kumo" if v == "jf_alpha" else "jf_alpha", "acc"), 24000, subtype="PCM_16")
