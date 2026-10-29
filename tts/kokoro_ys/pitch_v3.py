import sys,re,torch,numpy as np,soundfile as sf
sys.path.insert(0,'.')
from misaki_hepburn import HEPBURN
from ys2kokoro_v2 import jmap,k2h,SUTE
from kokoro import KModel
import matplotlib;matplotlib.use('Agg');import matplotlib.pyplot as plt
SMALL=set('ャュョァィゥェォ')
def ys_moras(ys):
    """-> list of (phoneme_str, 'H'/'L'/None, phrase_idx)"""
    body=ys[1:-1]; end=ys[-1]; out=[]; ph=0
    for chunk in re.split(r'([#_])',body):
        if chunk in('#','_'):
            if chunk=='_': out.append((', ',None,ph))
            ph+=1; continue
        state='L' if '[' in chunk else 'H'
        kana=''.join(c for c in chunk if c not in '[]'); h=k2h(kana)
        # moras with marks
        moras=[];i=0;marks=[]
        for c in chunk:
            if c in '[]': marks.append((len(moras)-1,c)); continue
            if c in SMALL and moras: moras[-1]+=c
            else: moras.append(c)
        lab=[];rise={k for k,c in marks if c=='['};fall={k for k,c in marks if c==']'}
        for k in range(len(moras)):
            lab.append(state)
            if k in rise: state='H'
            if k in fall: state='L'
        # phonemes per char, attributed to mora
        mi=[];[mi.extend([k]*len(m)) for k,m in enumerate(moras)]
        ps=['']*len(moras)
        for i,c in enumerate(h):
            ps[mi[i]]+=jmap(h[i-1] if i else None,c,h[i+1] if i+1<len(h) else None)
        out+= [(p,l,ph) for p,l in zip(ps,lab)]
    out.append(('?' if end=='?' else '.',None,ph)); return out
m=KModel(repo_id='hexgrad/Kokoro-82M').eval()
from huggingface_hub import hf_hub_download
def voice(v): return torch.load(hf_hub_download('hexgrad/Kokoro-82M',f'voices/{v}.pt'),weights_only=True)
def synth(ys,vname,mode,plot=None):
    mo=ys_moras(ys); chars=[];labs=[]
    for p,l,phi in mo:
        for c in p: chars.append(c); labs.append((l,phi))
    ids=[0]+[m.vocab[c] for c in chars if c in m.vocab]+[0]
    labs=[(None,0)]+[lb for c,lb in zip(chars,labs) if c in m.vocab]+[(None,0)]
    ref=voice(vname)[len(ids)-2]; x=torch.LongTensor([ids])
    with torch.no_grad():
        L=x.shape[1]; il=torch.tensor([L]); tm=torch.zeros(1,L,dtype=torch.bool)
        d_en=m.bert_encoder(m.bert(x,attention_mask=(~tm).int())).transpose(-1,-2); s=ref[:,128:]
        d=m.predictor.text_encoder(d_en,s,il,tm); xx,_=m.predictor.lstm(d)
        dur=torch.round(torch.sigmoid(m.predictor.duration_proj(xx)).sum(-1)).clamp(min=1).long().squeeze()
        idx=torch.repeat_interleave(torch.arange(L),dur); aln=torch.zeros(L,idx.shape[0]); aln[idx,torch.arange(idx.shape[0])]=1; aln=aln[None]
        en=d.transpose(-1,-2)@aln; F0,N=m.predictor.F0Ntrain(en,s)
        f0=F0[0].numpy().copy(); new=f0.copy()
        if mode!='orig':
            fr=np.repeat(np.arange(L),dur.numpy()*2)[:len(f0)]  # F0 at 2x frame rate
            voiced=f0>60; base=np.exp(np.mean(np.log(f0[voiced])))
            st=np.full(len(f0),np.nan)
            for t in range(len(f0)):
                l,phi=labs[fr[t]]
                if l is None: continue
                if mode=='inv': l='L' if l=='H' else 'H'
                st[t]=(2.5 if l=='H' else -2.5)-0.8*phi-1.5*t/len(f0)
            ok=~np.isnan(st); st=np.interp(np.arange(len(st)),np.where(ok)[0],st[ok])
            st=np.convolve(np.pad(st,8,mode='edge'),np.ones(17)/17,'valid')   # smooth ~ 85ms
            tgt=base*2**(st/12)
            new=np.where(voiced,tgt,f0)
        a=m.decoder(m.text_encoder(x,il,tm)@aln,torch.tensor(new,dtype=torch.float32)[None],N,ref[:,:128]).squeeze().numpy()
    return a,f0,new,''.join(chars)
J1='^ア[イジョーノタメ]ニ_カ]ノジョノ#ケ[ッテ]ンガ#ミ[エ]ナカッタ$';J2='^マ[ネージャーワ_ワ[タシガ#カ]レト#イ[ッショニ#ク[ーコーニ#イ[ッテ]ワ#ド]ーカト#イ[ーダ]シタ$'
D='./'
for v,suf in[('jf_alpha',''),('jm_kumo','_kumo')]:
    for n,ys in[(1,J1),(2,J2)]:
        for mode,tag in[('acc','v3'),('inv','v3_inverted'),('orig','v3_orig')]:
            a,f0,new,ps=synth(ys,v,mode); sf.write(f'{D}ja_{n}{tag}{suf}.wav',a,24000,subtype='PCM_16')
            if n==1 and v=='jf_alpha' and mode!='orig':
                plt.figure(figsize=(12,4));plt.plot(f0,label='Kokoro original F0');plt.plot(new,label=f'modified ({mode})');plt.legend();plt.title(ys);plt.ylabel('Hz');plt.savefig(f'{D}ja_1_f0_{mode}.png',dpi=110);plt.close()
print('done',ps)
for n,ys in [(1,J1)]: print([ (p,l) for p,l,_ in ys_moras(ys)])
