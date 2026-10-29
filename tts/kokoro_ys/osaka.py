"""Tokyo vs Keihan (ja-x-osaka): same words, only accent differs. Keihan: '=' phrase-initial 高起 (explicit high start),
'[' may appear at any mora (低起: low until '['), ']' nucleus as usual; high-start stretches are flat (平進)."""
import sys,re,soundfile as sf;sys.path.insert(0,'.')
import prosody_v4 as pv
def units(ys):
    m=re.match(r'^\^(?:(ja-x-osaka)\|)?(.*)([$?])$',ys);lang=m.group(1) or 'ja';body,end=m.group(2),m.group(3)
    U=pv.ja_units(body.replace('=',''),end)
    if lang=='ja-x-osaka':  # flatter high stretch (平進式): undo most of Tokyo-style in-stretch declination
        U=[(p,(None if c is None else [c[0] if c[0]<0 else 2.5-(2.5-c[0])/3]),ph) for (p,c,ph) in U]
    return lang,U+[('?' if end=='?' else '.',None,U[-1][2])]
pv.VL=()  # devoicing skip off: ハシ pitch must carry the contrast
pv.units=units
S={'1':('^ハ[シ]ト#ハ]シト#ハ[シデ]ス$','^ja-x-osaka|=ハ]シト#ハ[シ]ト#=ハシデ]ス$'),     # 橋と箸と端です
   '2':('^ア]メト#ア[メ_イ[ヌ]ト#カ[ゼデ]ス$','^ja-x-osaka|ア[メ]ト#=アメ_=イ]ヌト#=カゼデ]ス$')}  # 雨と飴、犬と風です
D='./'
for n,(t,o) in S.items():
    for v,suf in [('jf_alpha',''),('jm_kumo','_kumo')]:
        sf.write(f'{D}tokyo_{n}{suf}.wav',pv.synth(t,v,'acc',plot=f'{D}tokyo_{n}_f0.png' if not suf else None),24000,subtype='PCM_16')
        sf.write(f'{D}osaka_{n}{suf}.wav',pv.synth(o,v,'acc',plot=f'{D}osaka_{n}_f0.png' if not suf else None),24000,subtype='PCM_16')
    print(n,[(p,c) for p,c,_ in units(t)[1]],'\n ',[(p,c) for p,c,_ in units(o)[1]])
