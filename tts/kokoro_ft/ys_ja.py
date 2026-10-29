"""pyopenjtalk -> YomiScript (ja, Tokyo accent) -> Kokoro phoneme string with accent marks kept."""
import re,sys; sys.path.insert(0,'../kokoro_ys')
SMALL=set('ャュョァィゥェォヮ')
def moras(k):
    out=[]
    for c in k:
        if c in SMALL and out: out[-1]+=c
        else: out.append(c)
    return out
def text2ys(text):
    import pyopenjtalk
    njd=pyopenjtalk.run_frontend(text); phrases=[]; cur=None
    for w in njd:
        pron=w['pron'].replace('’','')
        if w['pos']=='記号' or not re.fullmatch(r'[ァ-ヶー]+',pron or ''):
            if w['pos']=='記号' and w['string'] in '、。，．？！,.?!・「」' and phrases: phrases.append('_')
            cur=None; continue
        if cur is None or w['chain_flag']!=1:
            cur={'m':[],'acc':w['acc']}; phrases.append(cur)
        cur['m']+=moras(pron)
    out=[]
    for p in phrases:
        if p=='_':
            if out and out[-1]!='_': out.append('_')
            continue
        M,a,n=p['m'],p['acc'],len(p['m'])
        if n==0: continue
        if a==0: s=M[0]+('['+''.join(M[1:]) if n>1 else '')
        elif a==1: s=M[0]+']'+''.join(M[1:])
        else: a=min(a,n); s=M[0]+'['+''.join(M[1:a])+']'+''.join(M[a:])
        if out and out[-1]!='_': out.append('#')
        out.append(s)
    while out and out[-1] in '_#': out.pop()
    end='?' if text.strip().endswith(('?','？')) else '$'
    return '^'+''.join(out)+end
MARKS='[]='
def ys2ph(ys):
    """ja YS -> Kokoro IPA string; accent marks [ ] = kept as their own symbols."""
    from ys2kokoro_v2 import jmap,k2h
    m=re.match(r'^\^(?:(ja|ja-x-osaka)\|)?(.*)([$?])$',ys); body,end=m.group(2),m.group(3)
    body=body.replace('#','')
    seq=[c for c in body]; kana=[c for c in seq if c not in MARKS+'_']
    h=k2h(''.join(kana)); out=[]; i=0
    for c in seq:
        if c in MARKS: out.append(c); continue
        if c=='_': out.append(', '); continue
        out.append(jmap(h[i-1] if i else None,h[i],h[i+1] if i+1<len(h) else None)); i+=1
    s=''.join(out); s=re.sub(r' (?=ʔ)|(?<=ʔ) ','',s)
    return s+('?' if end=='?' else '.')
if __name__=='__main__':
    for t in ['愛情のために彼女の欠点が見えなかった。','今日は雨ですか？','橋と箸と端です。']:
        y=text2ys(t); print(t,y,ys2ph(y))
