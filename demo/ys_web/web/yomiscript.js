// YomiScript notation — no engine, voice or language rules.
// Utterance: `<lang> /… ↘/` (or ↗ for a question), lang = BCP 47 language (no dialect tags). Inside: ` | ` accent phrase,
// ` ‖ ` breath group / pause, `{<lang> …}` a section in another language.
// parse(): utterance -> language sections -> tokens (units = mora / syllable, plus space / pause / boundary / end).
// Accent, stress and tone marks are kept on the tokens; pitch values <f0:v,…> (semitones relative to the
// speaker's register) attach to the unit right before them. Offsets point into the trimmed utterance string.
const LANG='[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*';
const UTT=new RegExp(`^(${LANG})\\s*/(.*?)\\s*([↘↗])\\s*/$`,'s');
const TAG=new RegExp(`\\{(${LANG}) ([^{}]*)\\}`,'g');
export const isJa=l=>l==='ja'||l.startsWith('ja-');
const SEP=s=>s==='|'?'#':s==='‖'?'_':null; // internal names: '#' accent phrase, '_' pause
const inStr=(ch,s)=>s.includes(ch);
function f0At(s,i){ // '<f0:1.5,-2>' at i -> [values, index after '>'] or null
  if(!s.startsWith('<f0:',i))return null;const j=s.indexOf('>',i);if(j<0)throw new Error(`unclosed <f0: in ${JSON.stringify(s)}`);
  const v=s.slice(i+4,j).split(',').map(Number);if(v.some(isNaN))throw new Error(`bad pitch value ${s.slice(i,j+1)}`);
  return [v,j+1];
}
function whyNot(s){
  if(!s)return 'empty input';
  if(/^\^|[$?]$/.test(s))return 'old notation (^…$ / ^lang|…); write  <lang> /… ↘/';
  if(!new RegExp(`^${LANG}\\s*/`).test(s))return 'missing language tag before the opening "/" (e.g. "ja /")';
  if(!/\/\s*$/.test(s))return 'missing closing "/"';
  if(!/[↘↗]\s*\/\s*$/.test(s))return 'missing sentence-final ↘ or ↗ before the closing "/"';
  return 'not YomiScript';
}
export function parse(ys){
  ys=ys.trim();const m=ys.match(UTT);
  if(!m)throw new Error(`${whyNot(ys)} — got ${JSON.stringify(ys.length>60?ys.slice(0,60)+'…':ys)}. YomiScript looks like  ja /kʲoꜜːwa | aꜜmeɡa ↘/`);
  const top=m[1],b=m[2],end=m[3]==='↗'?'?':'$',b0=ys.indexOf('/')+1;
  const P=[];let pos=0;
  for(const mm of b.matchAll(TAG)){P.push([top,pos,b.slice(pos,mm.index)],[mm[1],mm.index+mm[1].length+2,mm[2]]);pos=mm.index+mm[0].length;}
  P.push([top,pos,b.slice(pos)]);
  const S=[];
  for(const [l,s,x] of P){
    let a=0,z=x.length;while(a<z&&inStr(x[a],' |‖'))a++;while(z>a&&inStr(x[z-1],' |‖'))z--;
    if(a<z)S.push({lang:l,text:x.slice(a,z),base:b0+s+a});
  }
  S.forEach((sec,i)=>{sec.end=i===S.length-1?end:'$';sec.toks=segment(sec.lang,sec.text,sec.base);
    // the final ↘ / ↗ is the engine's '.' / '?', unless the utterance already ends with explicit punctuation (<p:!> …)
    const last=[...sec.toks].reverse().find(t=>t.kind!=='bound');sec.toks.push({kind:'end',sym:last?.kind==='punct'?'':sec.end==='?'?'?':'.',ph:last?last.ph:0});});
  return {ys,top,end,sections:S};
}
function segment(lang,t,base){return isJa(lang)?jaSeg(t,base):lang==='zh'?zhSeg(t,base):euSeg(t,base);}

// ---- Japanese: IPA morae with ꜛ (rise) / ꜜ (accent nucleus); '.' and spaces optional
const JV='aiɯeouɨ',JNAS='mnɲŋɴ',DEVOICE='̥';
const JAFF=['tɕ','dʑ','ts','dz','ʨ','ʥ','ʦ','ʣ'];
const JCONS='kɡsɕztdnɲhçɸbpmjwɾvʔŋɴʑβ';
function jaTokens(c,base){
  const T=[];
  for(let i=0;i<c.length;){
    const ch=c[i],two=c.slice(i,i+2),at=base+i;
    if(ch==='.'||ch===' '){i++;continue;}
    const f=f0At(c,i);if(f){T.push({t:'F',v:f[0]});i=f[1];continue;}
    if(ch==='ꜛ'||ch==='ꜜ'){T.push({t:ch});i++;continue;}
    if(ch==='ː'){T.push({t:'R',s:'ː',end:at+1});i++;continue;}
    if(inStr(ch,JV)){let dev=false;i++;if(c[i]===DEVOICE){dev=true;i++;}T.push({t:'V',s:ch,dev,vend:at+1,end:base+i});continue;}
    let s;if(JAFF.includes(two)){s=two;i+=2;}else if(JAFF.includes(ch)||inStr(ch,JCONS)){s=ch;i++;}else if(ch==='g'){s='ɡ';i++;} // IPA: g = ɡ
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
  for(let k=0;k<=t.length;k++)if(k===t.length||SEP(t[k])){C.push([s,k]);if(k<t.length)C.push([k,k+1]);s=k+1;}
  for(const [a,z] of C){
    const c=t.slice(a,z),sep=SEP(c);
    if(c.trim()===''||sep){if(sep==='_')out.push({kind:'pause',ph});else if(sep==='#')out.push({kind:'bound',sym:'#',ph});ph++;continue;}
    const M=jaMoras(c,base+a),hasRise=M.some(m=>m.rise);
    M.forEach((m,k)=>out.push({...m,mk:m.kind,kind:'unit',lang:'ja',ph,chunk,k,hasRise}));chunk++;
  }
  return out;
}

// ---- English / French: IPA syllables ('.'), words (' '), stress ˈ ˌ, liaison ‿ ; boundaries ' | ' ' ‖ ' as words;
// a sentence end inside the utterance ' ↘ ' / ' ↗ '; punctuation the engine uses as a prosodic cue: <p:…>
function pAt(s,i){if(!s.startsWith('<p:',i))return null;const j=s.indexOf('>',i+3);if(j<0)throw new Error(`unclosed <p: in ${JSON.stringify(s)}`);return [s.slice(i+3,j),j+1];}
function sylls(w,base){ // -> syllables {raw,start,end,f0} and punctuation {punct:sym} in order; '.' splits syllables outside <…>
  const R=[];let raw='',start=base,f0=null,end=base;
  const flush=()=>{if(raw||f0)R.push({raw,start,end,f0});raw='';f0=null;};
  for(let i=0;i<=w.length;){
    if(i===w.length||w[i]==='.'){flush();start=base+i+1;end=start;i++;continue;}
    const f=f0At(w,i);if(f){f0=f[0];i=f[1];continue;}
    const p=pAt(w,i);if(p){flush();R.push({punct:p[0]});i=p[1];start=end=base+i;continue;}
    if(w[i]!=='‿')raw+=w[i];i++;end=base+i;
  }
  return R;
}
function euSeg(t,base){
  const out=[];let ph=0,pos=0;
  const lastU=()=>[...out].reverse().find(x=>x.kind!=='bound');
  for(const w of t.split(' ')){
    const o=base+pos;pos+=w.length+1;if(!w)continue;
    const sep=SEP(w);if(sep){out.push({kind:'bound',sym:sep,ph});if(sep==='_')out.push({kind:'pause',ph});ph++;continue;}
    if(w==='↘'||w==='↗'){out.push({kind:'punct',sym:w==='↗'?'?':'.',ph});ph++;continue;} // sentence end inside the utterance
    const L=lastU();if(L&&L.kind!=='pause')out.push({kind:'space',ph});
    const S=sylls(w,o),N=S.filter(s=>!('punct' in s)).length;let j=0;
    for(const s of S)if('punct' in s)out.push({kind:'punct',sym:s.punct,ph});
      else out.push({kind:'unit',ph,j:j++,nsyl:N,st:inStr(s.raw[0]??'','ˈˌ')?s.raw[0]:'',...s});
  }
  return out;
}

// ---- Chinese (pinyin + tone digits; to be replaced with IPA + tone letters, D17)
function zhSeg(t,base){
  const out=[];let ph=0,pos=0;
  for(const w of t.split(' ')){
    const o=base+pos;pos+=w.length+1;if(!w)continue;
    const sep=SEP(w);if(sep){out.push({kind:'bound',sym:sep,ph});if(sep==='_')out.push({kind:'pause',ph});ph++;continue;}
    const L=[...out].reverse().find(x=>x.kind!=='bound');if(L&&L.kind!=='pause')out.push({kind:'space',ph});
    for(const s of sylls(w,o)){if('punct' in s){out.push({kind:'punct',sym:s.punct,ph});continue;}const m=s.raw.match(/^[a-zü]+(\d)(?:>(\d))?/);if(!m)throw new Error(`bad pinyin syllable ${JSON.stringify(s.raw)}`);
      out.push({kind:'unit',ph,tone:m[2]||m[1],...s});}
  }
  return out;
}
