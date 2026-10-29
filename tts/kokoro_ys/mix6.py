"""v6: mix5 + (1) corrected English YomiScript spellings, (2) ja section in English-voice context uses English-friendly realisation (ɨ->u, ɕ->ʃ, ʑ->ʒ, ʨ->ʧ), (3) blend sweep."""
import sys,re,numpy as np,soundfile as sf;sys.path.insert(0,'.')
import prosody_v4 as pv, mix5
_ja=pv.ja_units
ENCTX={'on':False}
def ja_units(b,e):
    U=_ja(b,e)
    if ENCTX['on']:
        tr=str.maketrans({'ɨ':'u','ɕ':'ʃ','ʑ':'ʒ','ʨ':'ʧ','ʥ':'ʤ'})
        U=[(p.translate(tr),c,ph) for p,c,ph in U]
    return U
pv.ja_units=ja_units
def render(ys,w):
    top,S,end=mix5.segs(ys);P=[]
    for l,x in S:
        v=mix5.blend(mix5.VO[top],mix5.VO[l],w) if (l!=top and w>0) else mix5.VO[top]
        ENCTX['on']=(l=='ja' and top!='ja')
        P.append(pv.synth(mix5.sec_ys(l,x,'$'),v,'acc'))
    ENCTX['on']=False
    return mix5.join(P)
S=[('mix_1','^キョ]ーワ#{en-US|mə.ˈʃin ˈlɝn.ɪŋ}ノ#ベ[ンキョーヲ#シ[マ]ス$'),
   ('mix_2','^en-US|maɪ ˈfɹɛnd {ja|タ[ナカ} ˈlɪvz ɪn {ja|ト[ーキョー} _ ˈnɪɹ {ja|シ[ブヤ}$'),
   ('mix_3','^ア[シタノ#{en-US|ˈmi.tɪŋ}デ#{en-US|ˈdeɪ.tə ˈsaɪ.əns}ノ#ハ[ナシヲ#シ[マ]ス$'),
   ('mix_4','^en-US|aɪ ˈɹi.sənt.li ˈvɪz.ɪ.tɪd {ja|キョ]ート} ənd ˈeɪt {ja|ス]シ} ˈðɛɹ$')]
D='./'
for n,ys in S:
    for w,suf in [(0,'b'),(0.2,'c20'),(0.35,'c35'),(0.5,'c50')]:
        sf.write(D+f'{n}v6{suf}.wav',render(ys,w),24000,subtype='PCM_16')
print('done')
