import sys

import soundfile as sf

sys.path.insert(0, ".")
import prosody_v4 as pv

S = [
    ("^キョ]ーワ#ア]メガ#フ[リソ]ーナノデ_カ]サヲ#モ]ッテ#デ[カケマ]ス$", "^ja-x-osaka|=キョ]ーワ#ア[メ]ガ#フリ[ソ]ーナノデ_カ[サ]ヲ#モッ[テ#デカケ[マ]ス$"),
    ("^エ[キマエノ#ア[タラシ]イ#オ[ミセデ_バ[ンゴ]ハンヲ#タ[ベマセ]ンカ?", "^ja-x-osaka|=エキマエノ#=アタラ]シイ#=オミセデ_バン[ゴ]ハンヲ#タベマ[セ]ンカ?"),
    ("^ア[リガト]ーゴザイマス_マ]タ#ア[シタ#ヨ[ロシク#オ[ネガイシマ]ス$", "^ja-x-osaka|=アリガ]トーゴザイマス_=マ]タ#アシ[タ#=ヨロシク#=オネガイシマ]ス$"),
]
D = "./"
for i, (t, o) in enumerate(S, 1):
    sf.write(f"{D}tokyo_n{i}.wav", pv.synth(t, "jf_alpha", "acc"), 24000, subtype="PCM_16")
    sf.write(f"{D}osaka_n{i}.wav", pv.synth(o, "jf_alpha", "acc"), 24000, subtype="PCM_16")
