"""v5: per-section synthesis (each {lang|} section rendered as its own YomiScript utterance), RMS matching, short pause + crossfade joins."""
import sys,re,numpy as np,soundfile as sf;sys.path.insert(0,'.')
import prosody_v4 as pv
TAG=r'\{(ja|en-US|en-GB|fr|zh)\|([^{}]*)\}'
VO={'ja':'jf_alpha','en-US':'af_heart'}
def segs(ys):
    m=re.match(r'^\^(?:(en-US|en-GB|fr|zh)\|)?(.*)([$?])$',ys);top=m.group(1) or 'ja';b,end=m.group(2),m.group(3)
    S=[];pos=0
    for mm in re.finditer(TAG,b):S+=[(top,b[pos:mm.start()]),(mm.group(1),mm.group(2))];pos=mm.end()
    S.append((top,b[pos:]));out=[]
    for l,x in S:
        x=x.strip(' _#') if l=='ja' else x.strip(' _')
        if x:out.append((l,x))
    return top,out,end
def sec_ys(l,x,end): return ('^' if l=='ja' else '^'+l+'|')+x+end
def trim(a,th=0.01):
    i=np.where(np.abs(a)>th)[0];return a[max(i[0]-240,0):i[-1]+480] if len(i) else a
def join(parts,gap=0.06,xf=0.015,sr=24000):
    tgt=np.sqrt(np.mean(parts[0]**2))
    out=trim(parts[0])
    for p in parts[1:]:
        p=trim(p);p=p*tgt/max(np.sqrt(np.mean(p**2)),1e-6)
        n=int(xf*sr);fo=np.linspace(1,0,n)
        out[-n:]*=fo;p[:n]*=fo[::-1]
        out=np.concatenate([out,np.zeros(int(gap*sr)),p])
    return out/max(1,np.abs(out).max()/0.95)
def blend(a,b,w=0.5):
    k=f'{a}+{b}';pv.VC[k]=pv.voice(a)*(1-w)+pv.voice(b)*w;return k
def render(ys,mode):
    top,S,end=segs(ys);P=[]
    for i,(l,x) in enumerate(S):
        e=end if i==len(S)-1 else ('$' if l!='ja' else '$')
        if mode=='native': v=VO[l]                       # each section its own language voice
        elif mode=='same': v=VO[top]                     # one voice, per-section language mapping
        else: v=blend(VO[top],VO[l],0.35) if l!=top else VO[top]  # top voice nudged toward section language
        P.append(pv.synth(sec_ys(l,x,e),v,'acc'))
    return join(P)
S=[('mix_1','^キョ]ーワ#{en-US|mə.ˈʃin ˈlɝ.nɪŋ}ノ#ベ[ンキョーヲ#シ[マ]ス$'),
   ('mix_2','^en-US|maɪ ˈfɹɛnd {ja|タ[ナカ} ˈlɪvz ɪn {ja|ト[ーキョー} _ ˈnɪɹ {ja|シ[ブヤ}$'),
   ('mix_3','^ア[シタノ#{en-US|ˈmitɪŋ}デ#{en-US|ˈdeɪtə ˈsaɪəns}ノ#ハ[ナシヲ#シ[マ]ス$'),
   ('mix_4','^en-US|aɪ ɹɪˈsɛntli ˈvɪzɪtɪd {ja|キョ]ート} ənd ˈeɪt {ja|ス[シ} ˈðɛɹ$')]
D='./'
for n,ys in S:
    for mode,suf in [('native','a'),('same','b'),('blend','c')]:
        sf.write(D+f'{n}v5{suf}.wav',render(ys,mode),24000,subtype='PCM_16');print(n,suf,flush=True)
