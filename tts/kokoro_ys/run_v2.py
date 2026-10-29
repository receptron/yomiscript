import json
import sys

import soundfile as sf

sys.path.insert(0, ".")
from kokoro_onnx import Kokoro
from ys2kokoro_v2 import convert

k = Kokoro("./kokoro-v1.0.onnx", "./voices-v1.0.bin")
J1 = "^ア[イジョーノタメ]ニ_カ]ノジョノ#ケ[ッテ]ンガ#ミ[エ]ナカッタ$"
J2 = "^マ[ネージャーワ_ワ[タシガ#カ]レト#イ[ッショニ#ク[ーコーニ#イ[ッテ]ワ#ド]ーカト#イ[ーダ]シタ$"
U = "^en-US|wi ˈnid tə ˈbaɪ ˈmɪlk _ ˈɛɡz _ ənd ˈbɹɛd$"
G = "^en-GB|ðə mjuː.ˈziː.əm ˈəʊ.pənz ət ˈnaɪn ə.ˈklɒk$"
U2 = "^en-US|hə.ˈwaɪ.i ɪz ˈbju.tə.fəl ɪn ðə ˈwɪn.tɚ$"
S = [
    ("ja_1v2", J1, "jf_alpha"),
    ("ja_2v2", J2, "jf_alpha"),
    ("ja_1v2_alt", J1, "jf_nezumi"),
    ("ja_1v2_alt2", J1, "jm_kumo"),
    ("en-US_1v2", U, "af_heart"),
    ("en-US_1v2_alt", U, "am_michael"),
    ("en-US_2v2", U2, "af_heart"),
    ("en-GB_1v2", G, "bf_emma"),
    ("en-GB_1v2_alt", G, "bm_george"),
]
L = {"ja": "ja", "en-US": "en-us", "en-GB": "en-gb"}
R = []
for n, ys, v in S:
    lang, ps = convert(ys)
    a, sr = k.create(ps, voice=v, lang=L[lang], is_phonemes=True)
    p = f"./{n}.wav"
    sf.write(p, a, sr, subtype="PCM_16")
    R.append(dict(wav=p, yomiscript=ys, voice=v, kokoro_ps=ps))
    print(n, v, ps)
json.dump(R, open("./results_v2.json", "w"), ensure_ascii=False, indent=1)
