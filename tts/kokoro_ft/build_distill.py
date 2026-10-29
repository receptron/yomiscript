import json,glob,re,warnings;warnings.filterwarnings('ignore')
from kokoro import KPipeline
P={'f':KPipeline(lang_code='f',repo_id='hexgrad/Kokoro-82M',model=False),'z':KPipeline(lang_code='z',repo_id='hexgrad/Kokoro-82M',model=False)}
out=[]
for f in sorted(glob.glob('opus_*.json')):
    for r in json.load(open(f)).get('rows',[]):
        t=r['row']['translation']
        for lg,key,v in [('fr','fr','ff_siwis'),('zh','zh','zf_xiaobei')]:
            if key not in t: continue
            s=t[key].strip()
            if not (8<=len(s)<=(60 if lg=='zh' else 160)): continue
            try: ph=''.join(x.phonemes or '' for x in P[lg[0] if lg=='fr' else 'z'](s))
            except Exception: continue
            if 5<len(ph)<400: out.append(dict(lang=lg,voice=v,ph=ph))
json.dump(out,open('distill_ph.json','w'),ensure_ascii=False)
from collections import Counter;print(Counter(o['lang'] for o in out))
