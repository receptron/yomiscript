import sys,json,re,numpy as np,onnxruntime as ort,librosa,soundfile as sf;sys.path.insert(0,'../../tts/kokoro_ys')
import mix,prosody_v4 as pv
src=open('qeval.py').read();exec(src[src.index('def f0_override'):src.index('def mk')])
S={n:ort.InferenceSession(f'models/{n}.onnx') for n in['enc','f0n','dec']}
def run(ids,uid,U,ref):
    dur,d,t=S['enc'].run(None,{'ids':np.array([ids],dtype=np.int64),'ref':ref});rep=lambda x:np.repeat(x,dur,axis=2)
    F0,N=S['f0n'].run(None,{'en':rep(d),'ref':ref});F1=f0_override(F0[0],uid,dur,U)[None]
    return S['dec'].run(None,{'asr':rep(t),'F0':F1,'N':N,'ref':ref})[0]
def lf0(x):return librosa.pyin(x.astype(float),fmin=70,fmax=600,sr=24000,frame_length=1024)[0]
def mel(x):return np.log(librosa.feature.melspectrogram(y=x.astype(float),sr=24000,n_mels=80)+1e-5)
def cmp(tag,a,b):
    m=min(len(a),len(b));a,b=a[:m],b[:m];fa,fb=lf0(a),lf0(b);ok=~np.isnan(fa)&~np.isnan(fb)
    print(f'  {tag:14s} len {len(a)}/{len(b)} wavecorr {np.corrcoef(a,b)[0,1]:.3f} F0corr {np.corrcoef(fa[ok],fb[ok])[0,1]:.4f} melL1 {np.abs(mel(a)-mel(b)).mean():.3f}',flush=True)
R=json.load(open('pyref.json'))
for n in ['mix_3','mix_12']:
    top,SG,end=mix.segs(json.load(open('presets.json'))and{x['name']:x['ys'] for x in json.load(open('presets.json'))}[n])
    for i,sec in enumerate(R[n]):
        print(n,'sec',i,sec['ys'],sec['voice'])
        l,x=SG[i];mix.JA_FOREIGN['on']=(l=='ja' and top!='ja');pv.NOFLAP=(l.startswith('en') and not top.startswith('en'))
        tA=pv.synth(sec['ys'],mix.voice_for(top,l,x),'acc');tB=pv.synth(sec['ys'],mix.voice_for(top,l,x),'acc')
        mix.JA_FOREIGN['on']=False;pv.NOFLAP=False
        V=pv.VC[sec['voice']] if sec['voice'] in pv.VC else pv.voice(sec['voice'])
        ids=sec['ids'];uid=[-1]
        for k,(p,c,ph) in enumerate(sec['U']):
            for ch in p:
                if ch in pv.m.vocab:uid.append(k)
        uid=np.array(uid+[-1]);ref=V[len(ids)-2].numpy().astype(np.float32).reshape(1,256)
        o=run(ids,uid,sec['U'],ref);j=np.fromfile(f'out/{n}_sec{i}.f32',dtype=np.float32)
        cmp('torch vs torch',tA,tB);cmp('torch vs pyORT',tA,o);cmp('pyORT vs JS',o,j);cmp('torch vs JS',tA,j)
