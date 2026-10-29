import glob,json,os,numpy as np,soundfile as sf
def ld(f):
    a,sr=sf.read(f,dtype="float32")
    a=a.mean(1) if a.ndim>1 else a
    n=int(len(a)*16000/sr); return np.interp(np.linspace(0,len(a)-1,n),np.arange(len(a)),a).astype("float32")
from faster_whisper import WhisperModel
m=WhisperModel("small",device="cpu",compute_type="int8")
fs=[f for f in sorted(glob.glob("mix_*v11*.wav"))]
R={}
for f in fs:
    seg,info=m.transcribe(ld(f),beam_size=1)
    t="".join(s.text for s in seg)
    R[f]={"lang":info.language,"p":round(info.language_probability,3),"text":t.strip()}
    print(f,R[f],flush=True)
json.dump(R,open("whisper_v11.json","w"),ensure_ascii=False,indent=1)
