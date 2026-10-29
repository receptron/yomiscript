import sys,json,soundfile as sf,numpy as np
sys.path.insert(0,'.');from ys2kokoro import *
from kokoro_onnx import Kokoro
k=Kokoro('./kokoro-v1.0.onnx','./voices-v1.0.bin')
S=[('ja',1,'^ア[イジョーノタメ]ニ_カ]ノジョノ#ケ[ッテ]ンガ#ミ[エ]ナカッタ$'),('ja',2,'^マ[ネージャーワ_ワ[タシガ#カ]レト#イ[ッショニ#ク[ーコーニ#イ[ッテ]ワ#ド]ーカト#イ[ーダ]シタ$'),
('en-US',1,'^en-US|wi ˈnid tə ˈbaɪ ˈmɪlk _ ˈɛɡz _ ənd ˈbɹɛd$'),('en-GB',1,'^en-GB|ðə ˈmjuː.ziː.əm ˈəʊ.pənz ət ˈnaɪn ə.ˈklɒk$'.replace('ˈmjuː.ziː','mjuː.ˈziː')),
('fr',1,'^fr|sɛ.t‿œ̃ pə.ti.t‿o.tɛl # o bɔʁ də la mɛʁ$'),('fr',2,'^fr|le.z‿wa.zo # ʃɑ̃t lə ma.tɛ̃$'),
('zh',1,'^zh|ni3>2 hao3 _ wo3 shi4 xue2.sheng1$'),('zh',2,'^zh|lao3.shi1 gei3 le5 wo3 yi1>4.ben3 shu1$')]
res=[]
for _,n,ys in S:
    lang,ps=convert(ys)
    a,sr=k.create(ps,voice=VOICE[lang],lang=KLANG[lang],is_phonemes=True)
    p=f'./{lang}_{n}.wav'; sf.write(p,a,sr,subtype='PCM_16')
    res.append(dict(wav=p,yomiscript=ys,lang_from_tag=lang,voice=VOICE[lang],kokoro_ps=ps,sec=round(len(a)/sr,2)));print(json.dumps(res[-1],ensure_ascii=False))
json.dump(res,open('./results.json','w'),ensure_ascii=False,indent=1)
