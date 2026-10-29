import sys,json,numpy as np,onnxruntime as ort,librosa;sys.path.insert(0,'../../tts/kokoro_ys')
import prosody_v4 as pv;
def f0_override(f0,uid,dur,U,smooth=5,dstep=0.6):
    L=len(dur);fu=uid[np.repeat(np.arange(L),dur*2)][:len(f0)];voiced=f0>60
    lo=np.log2(np.maximum(f0,1))*12;st=np.full(len(f0),np.nan)
    for k,(p,c,ph) in enumerate(U):
        fr=np.where(fu==k)[0]
        if c is None or len(fr)==0:continue
        st[fr]=np.interp(np.linspace(0,1,len(fr)),np.linspace(0,1,len(c)),c)-dstep*ph
    ok=~np.isnan(st)&voiced;tgt=np.full(len(f0),np.nan);phr=np.array([U[k][2] if k>=0 else -1 for k in fu])
    for ph in set(phr[ok]):
        sel=ok&(phr==ph);tgt[sel]=st[sel]-st[sel].mean()+lo[sel].mean()
    okk=~np.isnan(tgt)
    if not okk.any():return f0
    full=np.interp(np.arange(len(f0)),np.where(okk)[0],tgt[okk]);full=np.convolve(np.pad(full,smooth//2,mode='edge'),np.ones(smooth)/smooth,'valid')
    return np.where(okk,2**(full/12),f0).astype(np.float32)
def mk(e,f,d):return {'enc':ort.InferenceSession(e),'f0n':ort.InferenceSession(f),'dec':ort.InferenceSession(d)}
def run(S,ids,uid,U,ref):
    dur,d,t=S['enc'].run(None,{'ids':np.array([ids],dtype=np.int64),'ref':ref});rep=lambda x:np.repeat(x,dur,axis=2)
    F0,N=S['f0n'].run(None,{'en':rep(d),'ref':ref});F1=f0_override(F0[0],uid,dur,U)[None]
    return S['dec'].run(None,{'asr':rep(t),'F0':F1,'N':N,'ref':ref})[0],dur
PR={x['name']:x['ys'] for x in json.load(open('presets.json'))};P={'tokyo_n1':(PR['tokyo_n1'],'jf_alpha'),'ja_1':(PR['ja_1'],'jf_alpha'),'en':(PR['en-US_1'],'af_heart')}
def lf0(x):return librosa.pyin(x.astype(float),fmin=70,fmax=600,sr=24000,frame_length=1024)[0]
def mel(x):return np.log(librosa.feature.melspectrogram(y=x.astype(float),sr=24000,n_mels=80)+1e-5)
base=mk('models/enc.onnx','models/f0n.onnx','models/dec.onnx')
cfgs={k:mk(*v.split(',')) for k,v in [a.split('=') for a in sys.argv[1:]]}
for name,(ys,v) in P.items():
    lang,U=pv.units(ys);ids=[0];uid=[-1]
    for k,(p,c,ph) in enumerate(U):
        for ch in p:
            if ch in pv.m.vocab:ids.append(pv.m.vocab[ch]);uid.append(k)
    ids+=[0];uid=np.array(uid+[-1]);ref=pv.voice(v)[len(ids)-2].numpy().astype(np.float32)
    a0,d0=run(base,ids,uid,U,ref);f0=lf0(a0);m0=mel(a0)
    for k,S in cfgs.items():
        a,d=run(S,ids,uid,U,ref);
        if len(a)!=len(a0):print(name,k,'LEN DIFF',len(a),len(a0),'dur diff',int(np.abs(d-d0).sum()));continue
        f=lf0(a);ok=~np.isnan(f)&~np.isnan(f0)
        print(f'{name:5s} {k:10s} F0corr {np.corrcoef(f[ok],f0[ok])[0,1]:.4f} med|st| {np.median(np.abs(12*np.log2(f[ok]/f0[ok]))):.3f} melL1 {np.abs(mel(a)-m0).mean():.3f}',flush=True)
