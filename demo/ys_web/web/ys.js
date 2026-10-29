// YomiScript -> Kokoro (split ONNX: enc / f0n / dec) — JS port of prosody_v4.py + mix.py + osaka.py (reference implementation)
export const SR=24000, BLEND=0.2;
export const VOICE={'ja':'jf_alpha','ja-x-osaka':'jf_alpha','en-US':'af_heart','en-GB':'bf_emma','en':'af_heart','fr':'ff_siwis','zh':'zf_xiaoxiao'};
let VOCAB=null,HEP=null;
export function setData(d){VOCAB=d.vocab;HEP=d.hepburn;}
const SMALL=new Set('ャュョァィゥェォ'),SUTE=new Set('ゃゅょぁぃぅぇぉ');
const VL_DEFAULT=['k','s','ɕ','t','ʨ','ʦ','h','ç','ɸ','p'];
const VOW='AIOQWYaeiouæɑɒɔəɚɛɜɪʊʌᵊɐøœɔ̃';
const inStr=(ch,s)=>s.includes(ch); // python `ch in s` (substring semantics)
const k2h=s=>[...s].map(c=>(c>='ァ'&&c<='ヶ')?String.fromCharCode(c.charCodeAt(0)-0x60):c).join('');
function jmap(pk,kk,nk){
  const T=HEP;
  if(pk&&(pk+kk) in T)return T[pk+kk];
  if(nk&&(kk+nk) in T)return '';
  if(nk&&SUTE.has(nk))return kk==='っ'?'':T[kk].slice(0,-1)+T[nk];
  if(SUTE.has(kk))return '';
  if(kk==='ー')return 'ː';
  if(kk==='っ')return 'ʔ';
  if(kk==='ん'){const t=T[nk];
    if(t){if(inStr(t[0],'mpb'))return 'm';if(inStr(t[0],'kɡ'))return 'ŋ';if(/^[ɲʨʥ]/.test(t))return 'ɲ';if(inStr(t[0],'ntdɾz'))return 'n';}
    return 'ɴ';}
  return T[kk]??'';
}
const FOREIGN_JA={'ɨ':'u','ɕ':'ʃ','ʑ':'ʒ','ʨ':'ʧ','ʥ':'ʤ'};
function jaUnits(body,end,opt={}){
  const VL=opt.VL??VL_DEFAULT;const U=[];let ph=0;
  for(const chunk of body.split(/([#_])/)){
    if(chunk===''||chunk==='#'||chunk==='_'){if(chunk==='_')U.push([', ',null,ph]);ph++;continue;}
    let state=chunk.includes('[')?'L':'H';const moras=[],marks=[];
    for(const c of chunk){
      if(c==='['||c===']'){marks.push([moras.length-1,c]);continue;}
      if(SMALL.has(c)&&moras.length)moras[moras.length-1]+=c;else moras.push(c);
    }
    const rise=new Set(marks.filter(m=>m[1]==='[').map(m=>m[0])),fall=new Set(marks.filter(m=>m[1]===']').map(m=>m[0]));
    const h=[...k2h(moras.join(''))];const mi=[];moras.forEach((m,k)=>{for(const _ of m)mi.push(k);});
    const ps=moras.map(()=>'');
    h.forEach((c,i)=>{ps[mi[i]]+=jmap(i?h[i-1]:null,c,i+1<h.length?h[i+1]:null);});
    let hk=0;
    ps.forEach((p0,k)=>{
      let p=p0;let v;
      if(state==='H'){v=2.5-0.45*hk;hk++;}else v=(k===0)?-2.0:-2.5-0.3*hk;
      const nxt=k+1<ps.length?ps[k+1]:'';
      const sw=(s)=>VL.some(x=>s.startsWith(x));
      const last=p.slice(-1);
      const dev=(last!==''&&['i','ɯ','ɨ'].includes(last))&&sw(p)&&(sw(nxt)||(k===ps.length-1&&end==='$'&&(p==='sɯ'||p==='sɨ')));
      if(opt.foreign)p=[...p].map(c=>FOREIGN_JA[c]??c).join('');
      U.push([p,dev?null:[v],ph]);
      if(rise.has(k))state='H';if(fall.has(k))state='L';
    });
  }
  return U;
}
const TC={'1':[3,3],'2':[-1,3.5],'3':[-3,-4.5,-3],'4':[4,-3],'5':null};
const INI=[['zh','ʈʂ'],['ch','ʈʂʰ'],['sh','ʂ'],['b','p'],['p','pʰ'],['m','m'],['f','f'],['d','t'],['t','tʰ'],['n','n'],['l','l'],['g','k'],['k','kʰ'],['h','x'],['j','ʨ'],['q','ʨʰ'],['x','ɕ'],['r','ɻ'],['z','ʦ'],['c','ʦʰ'],['s','s'],['y',''],['w','']];
const FIN={'a':'a','o':'wo','e':'ɤ','ai':'aI','ei':'eI','ao':'aʊ','ou':'oʊ','an':'an','en':'ən','ang':'aŋ','eng':'əŋ','ong':'ʊŋ','er':'ɚ','i':'i','ia':'ja','ie':'je','iao':'jaʊ','iu':'joʊ','ian':'jɛn','in':'in','iang':'jaŋ','ing':'iŋ','iong':'jʊŋ','u':'u','ua':'wa','uo':'wo','uai':'waI','ui':'weI','uan':'wan','un':'wən','uang':'waŋ','v':'y','ue':'ɥe','ve':'ɥe','uan_j':'ɥɛn','un_j':'yn'};
const TONE={'1':'→','2':'↗','3':'↓','4':'↘','5':''};
function zsyl(syl){
  const m=syl.match(/^([a-zü]+)(\d)(?:>(\d))?/);const py=m[1],t=m[3]||m[2];let ini='',ip='';
  for(const [a,b] of INI)if(py.startsWith(a)){ini=a;ip=b;break;}
  let f=py.slice(ini.length);
  if(ini==='y'){const M={'u':'v','ue':'ve','uan':'uan_j','un':'un_j','i':'i','in':'in','ing':'ing'};f=(f in M)?M[f]:(f.startsWith('i')?f:'i'+f);}
  if(ini==='w')f=(f==='u')?'u':'u'+f;
  if(['j','q','x'].includes(ini)&&f.startsWith('u'))f={'u':'v','ue':'ve','uan':'uan_j','un':'un_j'}[f];
  let fi;if(f==='i'&&['z','c','s'].includes(ini))fi='ɹ';else if(f==='i'&&['zh','ch','sh','r'].includes(ini))fi='ɻ';else fi=FIN[f]??f;
  return ip+fi+TONE[t];
}
function zhUnits(body){
  const U=[];let ph=0;
  for(const w of body.split(' ')){
    if(w==='#'||w==='_'){if(w==='_')U.push([', ',null,ph]);ph++;continue;}
    if(U.length&&U[U.length-1][0]!==', ')U.push([' ',null,ph]);
    for(const s of w.split('.')){const t=s.match(/^[a-zü]+(\d)(?:>(\d))?/);const tt=t[2]||t[1];U.push([zsyl(s),TC[tt]?[...TC[tt]]:null,ph]);}
  }
  return U;
}
const VOWRE=new RegExp('['+VOW+']');
function enSyl(x,gb){
  for(const [a,b] of [['tʃ','ʧ'],['dʒ','ʤ'],['eɪ','A'],['aɪ','I'],['aʊ','W'],['ɔɪ','Y'],['oʊ','O'],['əʊ','Q'],['r','ɹ'],['l̩','ᵊl'],['x','k']])x=x.split(a).join(b);
  x=x.split('ɝ').join(gb?'ɜː':'ɜɹ').split('ɚ').join(gb?'ə':'əɹ');
  let st='';
  if(x[0]==='ˈ'||x[0]==='ˌ'){st=x[0];x=x.slice(1);}
  if(st){const m=x.match(VOWRE);x=m?x.slice(0,m.index)+st+x.slice(m.index):st+x;}
  return [x,st];
}
function eufrUnits(lang,body,end,opt={}){
  const U=[];let ph=0;const gb=lang==='en-GB';
  for(const w of body.split(' ')){
    if(w==='#'||w==='_'){
      for(let j=U.length-1;j>=0;j--)if(U[j][1]!==null){U[j]=[U[j][0],[...U[j][1],2.5],U[j][2]];break;}
      if(w==='_')U.push([', ',null,ph]);ph++;continue;
    }
    if(U.length&&U[U.length-1][0]!==', ')U.push([' ',null,ph]);
    const syls=w.split('‿').join('').split('.');
    syls.forEach((s,j)=>{
      let p,st;
      if(lang==='fr'){p=s;st='';}
      else{[p,st]=enSyl(s,gb);
        if(!gb&&!opt.noflap&&j>0&&inStr(p.slice(0,1),'td')&&p.length>1&&inStr(p[1],VOW)&&U.length&&inStr(U[U.length-1][0].slice(-1),VOW+'ɹ'))p='ɾ'+p.slice(1);}
      const c=lang==='fr'?(j===syls.length-1?[0.5]:[-0.5]):({'ˈ':[3.0,1.0],'ˌ':[1.0]}[st]??[-1.5]);
      U.push([p,c,ph]);
    });
  }
  for(let j=U.length-1;j>=0;j--)if(U[j][1]!==null){U[j]=[U[j][0],end==='$'?[U[j][1][0],-5]:[U[j][1][0],6],U[j][2]];break;}
  return U;
}
// one YomiScript utterance (no inline sections) -> units
export function units(ys,opt={}){
  const m=ys.match(/^\^(?:(ja-x-osaka|en-US|en-GB|en|fr|zh)\|)?(.*)([$?])$/s);
  if(!m)throw new Error('YomiScript must look like ^[lang|]...$ or ...?');
  const lang=m[1]||'ja',body=m[2],end=m[3];let U;
  if(lang==='ja')U=jaUnits(body,end,opt);
  else if(lang==='ja-x-osaka'){U=jaUnits(body.split('=').join(''),end,{...opt,VL:[]});U=U.map(([p,c,ph])=>[p,c===null?null:[c[0]<0?c[0]:2.5-(2.5-c[0])/3],ph]);}
  else if(lang==='zh')U=zhUnits(body);
  else U=eufrUnits(lang,body,end,opt);
  return [lang,[...U,[end==='?'?'?':'.',null,U.length?U[U.length-1][2]:0]]];
}
const TAG=/\{(ja|en-US|en-GB|fr|zh)\|([^{}]*)\}/g;
const strip=(s,ch)=>{let a=0,b=s.length;while(a<b&&ch.includes(s[a]))a++;while(b>a&&ch.includes(s[b-1]))b--;return s.slice(a,b);};
export function segs(ys){
  ys=ys.trim();
  const m=ys.match(/^\^(?:(ja-x-osaka|en-US|en-GB|fr|zh)\|)?(.*)([$?])$/s);
  if(!m)throw new Error('YomiScript must look like ^[lang|]...$ or ...?');
  const top=m[1]||'ja',b=m[2],end=m[3];const S=[];let pos=0;
  for(const mm of b.matchAll(TAG)){S.push([top,b.slice(pos,mm.index)],[mm[1],mm[2]]);pos=mm.index+mm[0].length;}
  S.push([top,b.slice(pos)]);
  return [top,S.map(([l,x])=>[l,strip(x,' _#')]).filter(([l,x])=>x),end];
}
const isJa=l=>l==='ja'||l==='ja-x-osaka';
export function voiceFor(top,l,x){
  if(l===top)return VOICE[top];
  if(x.split(/\s+/).filter(Boolean).length===1&&(isJa(top)||!isJa(l)))return VOICE[l];
  return `${VOICE[top]}+${VOICE[l]}@${BLEND}`;
}
// plan: sections with ids + units (no ONNX); used for parity tests and synthesis
export function plan(ys){
  const [top,S,end]=segs(ys);
  return S.map(([l,x],i)=>{
    const e=i===S.length-1?end:'$';const sy=(l==='ja'?'^':'^'+l+'|')+x+e;
    const opt={foreign:isJa(l)&&!isJa(top),noflap:l.startsWith('en')&&!top.startsWith('en')};
    const [lang,U]=units(sy,opt);const ids=[0],uid=[-1];
    U.forEach(([p],k)=>{for(const ch of p)if(ch in VOCAB){ids.push(VOCAB[ch]);uid.push(k);}});
    ids.push(0);uid.push(-1);
    return {ys:sy,voice:voiceFor(top,l,x),ids,uid,U};
  });
}
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
export function f0Override(f0,uid,dur,U,smooth=5,dstep=0.6){
  const n=f0.length;const fu=[];
  dur.forEach((d,l)=>{for(let r=0;r<d*2;r++)fu.push(uid[l]);});fu.length=Math.min(fu.length,n);
  const st=new Float64Array(n).fill(NaN);
  U.forEach(([p,c,ph],k)=>{
    if(c===null)return;const fr=[];for(let i=0;i<fu.length;i++)if(fu[i]===k)fr.push(i);if(!fr.length)return;
    fr.forEach((i,j)=>{const x=fr.length>1?j/(fr.length-1):0;let v;
      if(c.length===1)v=c[0];else{const pos=x*(c.length-1),a=Math.min(Math.floor(pos),c.length-2);v=c[a]+(c[a+1]-c[a])*(pos-a);}
      st[i]=v-dstep*ph;});
  });
  const lo=Array.from(f0,v=>Math.log2(Math.max(v,1))*12);
  const phr=Array.from({length:n},(_,i)=>{const k=i<fu.length?fu[i]:undefined;return (k===undefined||k<0)?-1:U[k][2];});
  const ok=Array.from({length:n},(_,i)=>!isNaN(st[i])&&f0[i]>60);
  const tgt=new Float64Array(n).fill(NaN);
  for(const ph of new Set(phr.filter((_,i)=>ok[i]))){
    const sel=[];for(let i=0;i<n;i++)if(ok[i]&&phr[i]===ph)sel.push(i);
    const ms=mean(sel.map(i=>st[i])),ml=mean(sel.map(i=>lo[i]));sel.forEach(i=>tgt[i]=st[i]-ms+ml);
  }
  const xs=[];for(let i=0;i<n;i++)if(!isNaN(tgt[i]))xs.push(i);
  if(!xs.length)return Float32Array.from(f0);
  const full=new Float64Array(n);let q=0;
  for(let i=0;i<n;i++){
    if(i<=xs[0])full[i]=tgt[xs[0]];else if(i>=xs[xs.length-1])full[i]=tgt[xs[xs.length-1]];
    else{while(xs[q+1]<i)q++;const a=xs[q],b=xs[q+1];full[i]=tgt[a]+(tgt[b]-tgt[a])*(i-a)/(b-a);}
  }
  const h=smooth>>1,sm=new Float64Array(n);
  for(let i=0;i<n;i++){let s=0;for(let j=-h;j<=h;j++)s+=full[Math.min(n-1,Math.max(0,i+j))];sm[i]=s/smooth;}
  return Float32Array.from(f0,(v,i)=>isNaN(tgt[i])?v:2**(sm[i]/12));
}
const rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
function trim(a,lead=true,th=0.01){
  let i0=-1,i1=-1;for(let i=0;i<a.length;i++)if(Math.abs(a[i])>th){if(i0<0)i0=i;i1=i;}
  if(i0<0)return a;return a.slice(lead?Math.max(i0-240,0):0,Math.min(a.length,i1+480));
}
export function join(P){
  const tgt=rms(P[0]);let out=Float32Array.from(trim(P[0],false));const n=Math.round(0.015*SR),gap=Math.round(0.06*SR);
  for(const p0 of P.slice(1)){
    const g=tgt/Math.max(rms(p0),1e-6);const p=Float32Array.from(trim(p0),v=>v*g);
    for(let i=0;i<n&&i<out.length;i++)out[out.length-n+i]*=1-i/(n-1);
    for(let i=0;i<n&&i<p.length;i++)p[i]*=i/(n-1);
    const o=new Float32Array(out.length+gap+p.length);o.set(out);o.set(p,out.length+gap);out=o;
  }
  let mx=0;for(const v of out)mx=Math.max(mx,Math.abs(v));const k=Math.max(1,mx/0.95);
  return out.map(v=>v/k);
}
// ---- ONNX engine
export class Engine{
  constructor(ort,loadBytes){this.ort=ort;this.load=loadBytes;this.V={};}
  // opts: {suffix:{enc:'',f0n:'',dec:''}, ep:'wasm'|'webgpu'}
  async init(opts={}){
    const o=this.ort,sf=opts.suffix||{},ep=opts.ep||'wasm';
    const mk=async n=>o.InferenceSession.create(await this.load(`models/${n}${sf[n]||''}.onnx`),{executionProviders:ep==='webgpu'?['webgpu','wasm']:['wasm']});
    [this.enc,this.f0n,this.dec]=[await mk('enc'),await mk('f0n'),await mk('dec')];
  }
  async voice(name){
    if(this.V[name])return this.V[name];
    const m=name.match(/^(.+)\+(.+)@([\d.]+)$/);let v;
    if(m){const a=await this.voice(m[1]),b=await this.voice(m[2]),w=+m[3];v=a.map((x,i)=>x*(1-w)+b[i]*w);}
    else v=new Float32Array(await this.load(`voices/${name}.bin`));
    return this.V[name]=v;
  }
  async synthSection(sec,mode='acc'){
    const o=this.ort,T=o.Tensor;const L=sec.ids.length;const V=await this.voice(sec.voice);
    const ref=new T('float32',V.slice((L-2)*256,(L-1)*256),[1,256]);
    const r1=await this.enc.run({ids:new T('int64',BigInt64Array.from(sec.ids.map(BigInt)),[1,L]),ref});
    const dur=Array.from(r1.dur.data,Number);const Tn=dur.reduce((a,b)=>a+b,0);
    const expand=t=>{const C=t.dims[1],src=t.data,out=new Float32Array(C*Tn);
      for(let c=0;c<C;c++){let q=c*Tn;for(let l=0;l<L;l++){const v=src[c*L+l];for(let r=0;r<dur[l];r++)out[q++]=v;}}return new T('float32',out,[1,C,Tn]);};
    const r2=await this.f0n.run({en:expand(r1.d),ref});
    const f0=r2.F0.data;const F=mode==='orig'?Float32Array.from(f0):f0Override(f0,sec.uid,dur,sec.U);
    const r3=await this.dec.run({asr:expand(r1.t_en),F0:new T('float32',F,[1,F.length]),N:r2.N,ref});
    return {audio:Float32Array.from(r3.audio.data),f0:Float32Array.from(f0),f0new:F};
  }
  async synth(ys,mode='acc'){
    const P=plan(ys);const outs=[];for(const s of P)outs.push(await this.synthSection(s,mode));
    return {audio:join(outs.map(o=>o.audio)),plan:P,sections:outs};
  }
}
export function wav(a){
  const b=new ArrayBuffer(44+a.length*2),d=new DataView(b);const w=(o,s)=>[...s].forEach((c,i)=>d.setUint8(o+i,c.charCodeAt(0)));
  w(0,'RIFF');d.setUint32(4,36+a.length*2,true);w(8,'WAVE');w(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);
  d.setUint32(24,SR,true);d.setUint32(28,SR*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);w(36,'data');d.setUint32(40,a.length*2,true);
  a.forEach((v,i)=>d.setInt16(44+i*2,Math.max(-1,Math.min(1,v))*32767,true));return b;
}
