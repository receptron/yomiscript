"""v2: ja uses misaki ja (cutlet-derived) table exactly; en uses misaki en conventions."""
import re,sys; sys.path.insert(0,'.')
from ys2kokoro import parse,ends,fr,zh,VOICE,KLANG
from misaki_hepburn import HEPBURN
SUTE=frozenset('ゃゅょぁぃぅぇぉ')
def k2h(s): return ''.join(chr(ord(c)-0x60) if 'ァ'<=c<='ヶ' else c for c in s)
def jmap(pk,kk,nk,T=HEPBURN):
    if pk and pk+kk in T: return T[pk+kk]
    if nk and kk+nk in T: return ''
    if nk and nk in SUTE:
        return '' if kk=='っ' else T[kk][:-1]+T[nk]
    if kk in SUTE: return ''
    if kk=='ー': return 'ː'
    if kk=='っ': return 'ʔ'
    if kk=='ん':
        t=T.get(nk)
        if t:
            if t[0] in 'mpb': return 'm'
            if t[0] in 'kɡ': return 'ŋ'
            if t.startswith(('ɲ','ʨ','ʥ')): return 'ɲ'
            if t[0] in 'ntdɾz': return 'n'
        return 'ɴ'
    return T.get(kk,'')
def ja(body):
    # pitch [ ] dropped (Kokoro ja vocab has no pitch symbols); '#' -> no space (misaki joins words); '_' -> ', '
    out=[]
    for ph in re.split(r'(_)',body.replace('[','').replace(']','').replace('#','')):
        if ph=='_': out.append(', ');continue
        h=k2h(ph); out.append(''.join(jmap(h[i-1] if i else None,c,h[i+1] if i+1<len(h) else None) for i,c in enumerate(h)))
    return re.sub(r' (?=ʔ)|(?<=ʔ) ','',''.join(out))
VOW='AIOQWYaeiouæɑɒɔəɚɛɜɪʊʌᵊɐ'
def en(body,gb):
    s=body
    for a,b in [('tʃ','ʧ'),('dʒ','ʤ'),('eɪ','A'),('aɪ','I'),('aʊ','W'),('ɔɪ','Y'),('oʊ','O'),('əʊ','Q'),('r','ɹ'),('l̩','ᵊl'),('x','k'),('ɡ','ɡ')]: s=s.replace(a,b)
    if gb: s=s.replace('ɝ','ɜː').replace('ɚ','ə')
    else: s=s.replace('ɝ','ɜɹ').replace('ɚ','əɹ')
    words=[]
    for w in s.split(' '):
        if w in('#','_'): words.append(','); continue
        syl=w.split('.'); o=[]
        for j,x in enumerate(syl):
            st=''
            if x and x[0] in 'ˈˌ': st,x=x[0],x[1:]
            if st:  # misaki puts stress right before the vowel nucleus
                m=re.search('['+VOW+']',x); x=x[:m.start()]+st+x[m.start():] if m else st+x
            # US flap: t/d between a vowel and an unstressed vowel-initial syllable
            if not gb and j>0 and x[:1] in 'td' and len(x)>1 and x[1] in VOW and o and o[-1][-1:] in VOW+'ɹ': x='ɾ'+x[1:]
            o.append(x)
        words.append(''.join(o))
    return re.sub(r' ,',',',' '.join(words))
def convert(ys):
    lang,body,e=parse(ys)
    p={'ja':lambda:ja(body),'fr':lambda:fr(body),'zh':lambda:zh(body)}.get(lang,lambda:en(body,lang=='en-GB'))()
    return lang,p+ends(e)
