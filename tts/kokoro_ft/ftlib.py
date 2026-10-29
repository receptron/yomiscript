"""Kokoro-82M accent-token fine-tune helpers (YomiScript). Decoder + acoustic text_encoder frozen;
bert, bert_encoder, predictor trained. Accent marks [ ] = use unused vocab slots and get zero duration."""
import torch,numpy as np,torch.nn.functional as Fn
MARK_IDS={'[':7,']':8,'=':26}   # unused in Kokoro v1.0 vocab (n_token=178)
SR=24000; HOP_DUR=600; HOP_F0=300
def load_model(dev='cpu',ckpt=None):
    from kokoro import KModel
    m=KModel(repo_id='hexgrad/Kokoro-82M').to(dev)
    if ckpt:
        sd=torch.load(ckpt,map_location=dev)
        for k in ('bert','bert_encoder','predictor'): getattr(m,k).load_state_dict(sd[k])
    return m
def voice(name):
    from huggingface_hub import hf_hub_download
    return torch.load(hf_hub_download('hexgrad/Kokoro-82M',f'voices/{name}.pt'),weights_only=True)
def ids_of(m,ph,keep_marks=True):
    out=[0]
    for c in ph:
        if c in MARK_IDS:
            if keep_marks: out.append(MARK_IDS[c])
        elif c in m.vocab: out.append(m.vocab[c])
    return out+[0]
def is_mark(ids): return torch.tensor([i in MARK_IDS.values() for i in ids])
def trainable(m):
    for p in m.parameters(): p.requires_grad=False
    ps=[]
    for k in ('bert','bert_encoder','predictor'):
        for p in getattr(m,k).parameters(): p.requires_grad=True; ps.append(p)
    return ps
def _enc(m,ids,ref_s):
    T=ids.shape[1]; L=torch.tensor([T],device=ids.device); mask=torch.zeros(1,T,dtype=torch.bool,device=ids.device)
    bd=m.bert(ids,attention_mask=(~mask).int()); d_en=m.bert_encoder(bd).transpose(-1,-2)
    s=ref_s[:,128:]; d=m.predictor.text_encoder(d_en,s,L,mask); x,_=m.predictor.lstm(d)
    return d,x,s,L,mask
def aln(dur,dev):
    T=dur.shape[0]; idx=torch.repeat_interleave(torch.arange(T,device=dev),dur)
    a=torch.zeros(T,idx.shape[0],device=dev); a[idx,torch.arange(idx.shape[0],device=dev)]=1; return a.unsqueeze(0)
def forward_train(m,ids,ref_s,dur):
    """ids [1,T] long, ref_s [1,256], dur [T] long (teacher-forced). returns dur_logits [T,50], F0 [2*sum], N [2*sum]"""
    d,x,s,_,_=_enc(m,ids,ref_s); logit=m.predictor.duration_proj(x)[0]
    en=d.transpose(-1,-2)@aln(dur,ids.device); F0,N=m.predictor.F0Ntrain(en,s)
    return logit,F0[0],N[0]
def loss_fn(logit,F0,N,dur,f0t,nt):
    tgt=(torch.arange(logit.shape[-1],device=logit.device)[None]<dur[:,None]).float()
    l_ce=Fn.binary_cross_entropy_with_logits(logit,tgt)
    l_dur=(torch.sigmoid(logit).sum(-1)-dur.float()).abs().mean()
    n=min(F0.shape[0],f0t.shape[0]); l_f0=(F0[:n]-f0t[:n]).abs().mean()/100.; l_n=(N[:n]-nt[:n]).abs().mean()
    return l_dur+5*l_ce+l_f0+l_n,dict(dur=l_dur.item(),ce=l_ce.item(),f0=l_f0.item(),n=l_n.item())
@torch.no_grad()
def teacher(m,ids,ref_s,audio=True):
    """returns dur [T], F0, N (and audio) from model's own predictions; marks forced to 0 frames."""
    d,x,s,_,_=_enc(m,ids,ref_s); dur=torch.sigmoid(m.predictor.duration_proj(x)).sum(-1)[0]
    dur=torch.round(dur).clamp(min=1).long(); dur[is_mark(ids[0].tolist()).to(dur.device)]=0
    a=aln(dur,ids.device); en=d.transpose(-1,-2)@a; F0,N=m.predictor.F0Ntrain(en,s)
    wav=None
    if audio:
        T=ids.shape[1]; t_en=m.text_encoder(ids,torch.tensor([T],device=ids.device),torch.zeros(1,T,dtype=torch.bool,device=ids.device))
        wav=m.decoder(t_en@a,F0,N,ref_s[:,:128]).squeeze()
    return dur,F0[0],N[0],wav
def synth(m,ph,vpack,dev='cpu',keep_marks=True):
    ids=ids_of(m,ph,keep_marks); rs=vpack[min(len(ids)-3,len(vpack)-1)].to(dev)
    return teacher(m,torch.tensor([ids],device=dev),rs)[3].float().cpu().numpy()
# ---- StyleTTS2-style features (24k, n_fft 2048, win 1200, hop 300, 80 mel)
def logmel(w,hop=HOP_F0):
    import librosa
    M=librosa.feature.melspectrogram(y=np.asarray(w,dtype=np.float32),sr=SR,n_fft=2048,win_length=1200,hop_length=hop,n_mels=80,power=2.0,htk=True,norm=None)
    return (torch.log(1e-5+torch.from_numpy(M))+4)/4   # [80,F] StyleTTS2 normalisation
def log_norm(lm): return torch.log(torch.exp(lm*4-4).norm(dim=0))   # StyleTTS2 N target
def f0_of(w):
    import pyworld as pw; x=np.asarray(w,dtype=np.float64)
    f,t=pw.harvest(x,SR,f0_floor=60,f0_ceil=600,frame_period=HOP_F0/SR*1000); return pw.stonemask(x,f,t,SR).astype(np.float32)
