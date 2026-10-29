// YomiScript notation — no engine, voice or language rules.
// parse(): utterance -> language sections -> tokens (units = mora / syllable, plus space / pause / boundary / end).
// Accent, stress and tone marks are kept on the tokens; pitch values <f0:v,…> (semitones relative to the
// speaker's register) attach to the unit right before them. Offsets point into the trimmed utterance string.
const UTT=/^\^(?:(ja-x-osaka|en-US|en-GB|en|fr|zh)\|)?(.*)([$?])$/s;
const TAG=/\{(ja|en-US|en-GB|fr|zh)\|([^{}]*)\}/g;
export const isJa=l=>l==='ja'||l==='ja-x-osaka';
const inStr=(ch,s)=>s.includes(ch);
function f0At(s,i){ // '<f0:1.5,-2>' at i -> [values, index after '>'] or null
  if(!s.startsWith('<f0:',i))return null;const j=s.indexOf('>',i);if(j<0)throw new Error(`unclosed <f0: in ${JSON.stringify(s)}`);
  const v=s.slice(i+4,j).split(',').map(Number);if(v.some(isNaN))throw new Error(`bad pitch value ${s.slice(i,j+1)}`);
  return [v,j+1];
}
export function parse(ys){
  ys=ys.trim();const m=ys.match(UTT);
  if(!m)throw new Error('YomiScript must look like ^[lang|]...$ or ...?');
  const top=m[1]||'ja',b=m[2],end=m[3],b0=1+(m[1]?m[1].length+1:0);
  const P=[];let pos=0;
  for(const mm of b.matchAll(TAG)){P.push([top,pos,b.slice(pos,mm.index)],[mm[1],mm.index+mm[1].length+2,mm[2]]);pos=mm.index+mm[0].length;}
  P.push([top,pos,b.slice(pos)]);
  const S=[];
  for(const [l,s,x] of P){
    let a=0,z=x.length;while(a<z&&inStr(x[a],' _#'))a++;while(z>a&&inStr(x[z-1],' _#'))z--;
    if(a<z)S.push({lang:l,text:x.slice(a,z),base:b0+s+a});
  }
  S.forEach((sec,i)=>{sec.end=i===S.length-1?end:'$';sec.toks=segment(sec.lang,sec.text,sec.base);
    const last=[...sec.toks].reverse().find(t=>t.kind!=='bound');sec.toks.push({kind:'end',sym:sec.end==='?'?'?':'.',ph:last?last.ph:0});});
  return {ys,top,end,sections:S};
}
function segment(lang,t,base){return isJa(lang)?jaSeg(t,base):lang==='zh'?zhSeg(t,base):euSeg(t,base);}

// ---- Japanese: IPA morae with ꜛ (rise) / ꜜ (accent nucleus); '.' and spaces optional; '=' (Osaka high onset) is ignored here
const JV='aiɯeouɨ',JNAS='mnɲŋɴ',DEVOICE='̥';
const JAFF=['tɕ','dʑ','ts','dz','ʨ','ʥ','ʦ','ʣ'];
const JCONS='kɡsɕztdnɲhçɸbpmjwɾvʔŋɴʑβ';
function jaTokens(c,base){
  const T=[];
  for(let i=0;i<c.length;){
    const ch=c[i],two=c.slice(i,i+2),at=base+i;
    if(ch==='.'||ch===' '||ch==='='){i++;continue;}
    const f=f0At(c,i);if(f){T.push({t:'F',v:f[0]});i=f[1];continue;}
    if(ch==='ꜛ'||ch==='ꜜ'){T.push({t:ch});i++;continue;}
    if(ch==='ː'){T.push({t:'R',s:'ː',end:at+1});i++;continue;}
    if(inStr(ch,JV)){let dev=false;i++;if(c[i]===DEVOICE){dev=true;i++;}T.push({t:'V',s:ch,dev,vend:at+1,end:base+i});continue;}
    let s;if(JAFF.includes(two)){s=two;i+=2;}else if(JAFF.includes(ch)||inStr(ch,JCONS)){s=ch;i++;}
    else throw new Error(`not Japanese YomiScript IPA: ${JSON.stringify(ch)} in ${JSON.stringify(c)}`+(/[぀-ヿ]/.test(ch)?' (kana is not YomiScript; write IPA with ꜛ ꜜ)':''));
    if(c[i]==='ʲ'){s+='ʲ';i++;}
    T.push({t:'C',s,end:base+i});
  }
  return T;
}
function jaMoras(c,base){
  // -> morae [{kind:'mora'|'N'|'Q'|'R', on, v, ipa, dev, vend, end, f0, rise, fall}] (as units: kind 'unit', mora kind in mk)
  const T=jaTokens(c,base),M=[];let on='';
  const next=i=>{for(let j=i+1;j<T.length;j++)if(T[j].t==='C'||T[j].t==='V'||T[j].t==='R')return T[j];return null;};
  const add=o=>M.push({rise:false,fall:false,f0:null,dev:false,...o});
  T.forEach((x,i)=>{
    if(x.t==='ꜛ'||x.t==='ꜜ'){if(on)throw new Error(`accent mark inside a mora in ${JSON.stringify(c)}`);if(M.length)M[M.length-1][x.t==='ꜛ'?'rise':'fall']=true;return;}
    if(x.t==='F'){if(on||!M.length)throw new Error(`<f0:…> must follow a mora in ${JSON.stringify(c)}`);M[M.length-1].f0=x.v;return;}
    if(x.t==='R'){add({kind:'R',ipa:'ː',end:x.end});return;}
    if(x.t==='V'){add({kind:'mora',on,v:x.s,ipa:on+x.s,dev:x.dev,vend:x.vend,end:x.end});on='';return;}
    const n=next(i);
    if(x.s==='ɴ'||x.s==='ʔ'){add({kind:x.s==='ɴ'?'N':'Q',ipa:x.s,end:x.end});return;}               // moraic nasal / glottal stop
    if(inStr(x.s,JNAS)&&!on&&(!n||n.t!=='V')){add({kind:'N',ipa:x.s,end:x.end});return;}            // moraic nasal before a consonant or the end
    if(!on&&n&&n.t==='C'&&!inStr(x.s,'jw')&&!inStr(n.s,'jw')){add({kind:'Q',ipa:x.s,end:x.end});return;} // geminate
    if(on&&!inStr(x.s,'jw'))throw new Error(`unexpected consonant cluster ${on}${x.s} in ${JSON.stringify(c)}`);
    on+=x.s;
  });
  if(on)throw new Error(`consonant ${on} without a vowel in ${JSON.stringify(c)}`);
  return M;
}
function jaSeg(t,base){
  const out=[];let ph=0,s=0,chunk=0;const C=[];
  for(let k=0;k<=t.length;k++)if(k===t.length||t[k]==='#'||t[k]==='_'){C.push([s,k]);if(k<t.length)C.push([k,k+1]);s=k+1;}
  for(const [a,z] of C){
    const c=t.slice(a,z);
    if(c.trim()===''||c==='#'||c==='_'){if(c==='_')out.push({kind:'pause',ph});else if(c==='#')out.push({kind:'bound',sym:'#',ph});ph++;continue;}
    const M=jaMoras(c,base+a),hasRise=M.some(m=>m.rise);
    M.forEach((m,k)=>out.push({...m,mk:m.kind,kind:'unit',lang:'ja',ph,chunk,k,hasRise}));chunk++;
  }
  return out;
}

// ---- English / French: IPA syllables ('.'), words (' '), stress ˈ ˌ, liaison ‿ ; boundaries '#' '_' as words
function sylls(w,base){ // split at '.' outside <…>, drop '‿' and <f0:…> from the raw text
  const R=[];let raw='',start=base,f0=null,end=base;
  for(let i=0;i<=w.length;){
    if(i===w.length||w[i]==='.'){R.push({raw,start,end,f0});raw='';f0=null;start=base+i+1;end=start;i++;continue;}
    const f=f0At(w,i);if(f){f0=f[0];i=f[1];continue;}
    if(w[i]!=='‿')raw+=w[i];i++;end=base+i;
  }
  return R;
}
function euSeg(t,base){
  const out=[];let ph=0,pos=0;
  const lastU=()=>[...out].reverse().find(x=>x.kind!=='bound');
  for(const w of t.split(' ')){
    const o=base+pos;pos+=w.length+1;
    if(w==='#'||w==='_'){out.push({kind:'bound',sym:w,ph});if(w==='_')out.push({kind:'pause',ph});ph++;continue;}
    const L=lastU();if(L&&L.kind!=='pause')out.push({kind:'space',ph});
    const S=sylls(w,o);S.forEach((s,j)=>out.push({kind:'unit',ph,j,nsyl:S.length,st:inStr(s.raw[0]??'','ˈˌ')?s.raw[0]:'',...s}));
  }
  return out;
}

// ---- Chinese (pinyin + tone digits; to be replaced with IPA + tone letters, D17)
function zhSeg(t,base){
  const out=[];let ph=0,pos=0;
  for(const w of t.split(' ')){
    const o=base+pos;pos+=w.length+1;
    if(w==='#'||w==='_'){out.push({kind:'bound',sym:w,ph});if(w==='_')out.push({kind:'pause',ph});ph++;continue;}
    const L=[...out].reverse().find(x=>x.kind!=='bound');if(L&&L.kind!=='pause')out.push({kind:'space',ph});
    for(const s of sylls(w,o)){const m=s.raw.match(/^[a-zü]+(\d)(?:>(\d))?/);if(!m)throw new Error(`bad pinyin syllable ${JSON.stringify(s.raw)}`);
      out.push({kind:'unit',ph,tone:m[2]||m[1],...s});}
  }
  return out;
}
