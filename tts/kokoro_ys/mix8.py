"""v8: per-section blend weight; LONGV rule: English sections inside a Japanese matrix get tense vowels lengthened (i->iː, u->uː, ɝ->ɝː)."""

import re
import sys

import soundfile as sf

sys.path.insert(0, ".")
import mix5
import mix6
import mix7
import prosody_v4 as pv


def longv(x):
    return re.sub(r"([iuɝ])(?!ː)", r"\1ː", x)


def render(ys, w=0.2, wshort=None, lv=False):
    top, S, end = mix5.segs(ys)
    P = []
    for l, x in S:
        if l != top and top == "ja" and lv:
            x = longv(x)
        ww = wshort if (wshort is not None and l != top and len(x.split()) == 1) else w
        v = (mix5.VO[l] if ww >= 1 else mix5.blend(mix5.VO[top], mix5.VO[l], ww)) if l != top else mix5.VO[top]
        mix6.ENCTX["on"] = l == "ja" and top != "ja"
        pv.NOFLAP = l != "ja" and top == "ja"
        P.append(pv.synth(mix5.sec_ys(l, x, "$"), v, "acc"))
    mix6.ENCTX["on"] = False
    pv.NOFLAP = False
    import numpy as np

    tgt = np.sqrt(np.mean(P[0] ** 2))
    out = mix7.trim(P[0], lead=False)
    sr = 24000
    n = int(0.015 * sr)
    fo = np.linspace(1, 0, n)
    for p in P[1:]:
        p = mix7.trim(p) * tgt / max(np.sqrt(np.mean(p**2)), 1e-6)
        out[-n:] *= fo
        p[:n] *= fo[::-1]
        out = np.concatenate([out, np.zeros(int(0.06 * sr)), p])
    return out / max(1, np.abs(out).max() / 0.95)


M3 = "^ア[シタノ#{en-US|ˈmi.tɪŋ}デ#{en-US|ˈdeɪ.tə ˈsaɪ.əns}ノ#ハ[ナシヲ#シ[マ]ス$"
M3L = M3.replace("ˈmi.tɪŋ", "ˈmiː.tɪŋ")
M1 = "^キョ]ーワ#{en-US|mə.ˈʃin ˈlɝ.nɪŋ}ノ#ベ[ンキョーヲ#シ[マ]ス$"
J = [
    ("mix_3v8_long", M3L, {}),
    ("mix_3v8_long_w50", M3L, {"wshort": 0.5}),
    ("mix_3v8_long_pure", M3L, {"wshort": 1}),
    ("mix_3v8_w50", M3, {"wshort": 0.5}),
    ("mix_3v8_pure", M3, {"wshort": 1}),
    ("mix_3v8_rule", M3, {"lv": True}),
    ("mix_3v8_rule_w50", M3, {"lv": True, "wshort": 0.5}),
    ("mix_1v8_rule", M1, {"lv": True}),
]
for n, ys, k in J:
    sf.write(f"./{n}.wav", render(ys, **k), 24000, subtype="PCM_16")
print("done")
