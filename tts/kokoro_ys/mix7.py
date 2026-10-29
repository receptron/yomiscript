"""v7: c20 blend; no flap-t in English sections inside non-English matrix; no leading trim on first section; learning spelling variants."""
import sys,numpy as np,soundfile as sf;sys.path.insert(0,'.')
import prosody_v4 as pv, mix5, mix6
def trim(a,th=0.01,lead=True):
    i=np.where(np.abs(a)>th)[0]
    if not len(i):return a
    return a[(max(i[0]-240,0) if lead else 0):i[-1]+480]
def render(ys,w=0.2):
    top,S,end=mix5.segs(ys);P=[]
    for l,x in S:
        v=mix5.blend(mix5.VO[top],mix5.VO[l],w) if l!=top else mix5.VO[top]
        mix6.ENCTX['on']=(l=='ja' and top!='ja'); pv.NOFLAP=(l!='ja' and top=='ja')
        P.append(pv.synth(mix5.sec_ys(l,x,'$'),v,'acc'))
    mix6.ENCTX['on']=False;pv.NOFLAP=False
    tgt=np.sqrt(np.mean(P[0]**2));out=trim(P[0],lead=False);sr=24000;n=int(.015*sr);fo=np.linspace(1,0,n)
    for p in P[1:]:
        p=trim(p)*tgt/max(np.sqrt(np.mean(p**2)),1e-6);out[-n:]*=fo;p[:n]*=fo[::-1]
        out=np.concatenate([out,np.zeros(int(.06*sr)),p])
    return out/max(1,np.abs(out).max()/0.95)
J='ノ#ベ[ンキョーヲ#シ[マ]ス$'
S=[('mix_1v7','^キョ]ーワ#{en-US|mə.ˈʃin ˈlɝ.nɪŋ}'+J),
   ('mix_1v7_l2','^キョ]ーワ#{en-US|mə.ˈʃin ˈlɜːn.ɪŋ}'+J),
   ('mix_1v7_l3','^キョ]ーワ#{en-US|mə.ˈʃiːn ˈlɝːn.ɪŋ}'+J),
   ('mix_2v7','^en-US|maɪ ˈfɹɛnd {ja|タ[ナカ} ˈlɪvz ɪn {ja|ト[ーキョー} _ ˈnɪɹ {ja|シ[ブヤ}$'),
   ('mix_3v7','^ア[シタノ#{en-US|ˈmi.tɪŋ}デ#{en-US|ˈdeɪ.tə ˈsaɪ.əns}ノ#ハ[ナシヲ#シ[マ]ス$'),
   ('mix_4v7','^en-US|ˈaɪ ˈɹi.sənt.li ˈvɪz.ɪ.tɪd {ja|キョ]ート} ənd ˈeɪt {ja|ス]シ} ˈðɛɹ$')]
for n,ys in S: sf.write(f'./{n}.wav',render(ys),24000,subtype='PCM_16')
print('done')
