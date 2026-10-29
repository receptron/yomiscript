// Katarite (Kokoro-82M, split ONNX: enc / f0n / dec). Renders YomiScript; pitch comes only from <f0:…> values.
// Accent / stress / tone marks are not interpreted here (the Yomite turns them into values, see yomite.js).
// What stays here is engine-specific: YomiScript IPA -> Kokoro's phoneme symbols, voices, F0 rendering, audio.
import {parse,isJa} from './yomiscript.js';
export const SR=24000, BLEND=0.2;
export const VOICE={'ja':'jf_alpha','en-US':'af_heart','en-GB':'bf_emma','en':'af_heart','fr':'ff_siwis','zh':'zf_xiaoxiao'};
const voiceOf=l=>{const v=VOICE[l]??VOICE[l.split('-')[0]];if(!v)throw new Error(`this Katarite does not support language ${l}`);return v;};
let VOCAB=null;
export function setData(d){VOCAB=d.vocab;}
const VOW='AIOQWYaeiouæɑɒɔəɚɛɜɪʊʌᵊɐøœɔ̃';
function jaKokoro(on,v){
  // canonical Japanese YomiScript IPA -> the phoneme symbols Kokoro was trained on
  on=on.replace('tɕ','ʨ').replace('dʑ','ʥ').replace('ts','ʦ').replace('w','β').replace('ʷ','ᵝ');if(on==='dz'||on==='ʣ')on='ʣ';
  if(v==='i'&&/^[kɡbpmɾvɸtdʦ]$/.test(on))on+='ʲ';
  if(v==='ɯ'&&(/ʲ$/.test(on)||/^[ɕʥʨçsʦɲ]$/.test(on)))v='ɨ';
  if(v==='ɯ'&&on==='ʣ'){on='z';v='ɨ';}
  return on+v;
}
const FOREIGN_JA={'ɨ':'u','ɕ':'ʃ','ʑ':'ʒ','ʨ':'ʧ','ʥ':'ʤ'};
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
const VOWRE=new RegExp('['+VOW+']');
function enSyl(x,gb){
  for(const [a,b] of [['g','ɡ'],['tʃ','ʧ'],['dʒ','ʤ'],['eɪ','A'],['aɪ','I'],['aʊ','W'],['ɔɪ','Y'],['oʊ','O'],['əʊ','Q'],['r','ɹ'],['l̩','ᵊl'],['x','k'],['ɾ','T']])x=x.split(a).join(b); // ɾ: Kokoro's English flap token is T
  x=x.split('ɝ').join(gb?'ɜː':'ɜɹ').split('ɚ').join(gb?'ə':'əɹ');
  let st='';
  if(x[0]==='ˈ'||x[0]==='ˌ'){st=x[0];x=x.slice(1);}
  if(st){const m=x.match(VOWRE);x=m?x.slice(0,m.index)+st+x.slice(m.index):st+x;}
  return x;
}
function kokoroPhonemes(lang,t,foreign){
  if(isJa(lang)){ // as Kokoro's Japanese front end (misaki Cutlet) writes them: 。 and 、 leave only the word space
    if(t.kind==='space'||t.kind==='pause')return ' ';if(t.kind==='end'||t.kind==='punct')return t.sym==='.'&&(t.kind==='end'||t.sent)?'':t.sym;
    const p=t.mk==='mora'?jaKokoro(t.on,t.v):t.mk==='Q'?'ʔ':t.ipa;return foreign?[...p].map(c=>FOREIGN_JA[c]??c).join(''):p;}
  if(t.kind==='space')return ' ';if(t.kind==='pause')return ', ';if(t.kind==='end'||t.kind==='punct')return t.sym;
  if(lang==='zh'||lang.startsWith('zh-'))return zsyl(t.raw);
  if(lang==='fr'||lang.startsWith('fr-'))return t.raw.replace(/g/g,'ɡ'); // IPA: g = ɡ
  return enSyl(t.raw,lang==='en-GB');
}
export function voiceFor(top,l,x){
  if(l===top)return voiceOf(top);
  if(x.split(/\s+/).filter(Boolean).length===1&&(isJa(top)||!isJa(l)))return voiceOf(l);
  return `${voiceOf(top)}+${voiceOf(l)}@${BLEND}`;
}
// plan: sections with Kokoro ids + units [phonemes, f0 values|null, phrase] (no ONNX); used for parity tests and synthesis
export function plan(ys){
  const Y=parse(ys);
  const P=Y.sections.map(sec=>{
    const foreign=isJa(sec.lang)&&!isJa(Y.top);const U=[],toks=[];
    for(const t of sec.toks){if(t.kind==='bound')continue;U.push([kokoroPhonemes(sec.lang,t,foreign),t.kind==='unit'&&t.f0?[...t.f0]:null,t.ph]);toks.push(t);}
    const ids=[0],uid=[-1];
    U.forEach(([p],k)=>{for(const ch of p)if(ch in VOCAB){ids.push(VOCAB[ch]);uid.push(k);}});
    ids.push(0);uid.push(-1);
    const ps=U.map(u=>u[0]).join('');                          // the phoneme string the original Kokoro would get
    return {lang:sec.lang,text:sec.text,voice:voiceFor(Y.top,sec.lang,sec.text),ps,ids,uid,U,toks};
  });
  P.src=Y.ys;return P;
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
  // Kokoro's own prosody prediction (durations, F0, energy) for one planned section; also used by the Yomite (kokoro_prosody.js)
  async predict(sec){
    const o=this.ort,T=o.Tensor;const L=sec.ids.length;const V=await this.voice(sec.voice);
    const k=(sec.ps??'x'.repeat(L-1)).length-1;               // voice-pack entry as in KPipeline: pack[len(ps)-1]
    const ref=new T('float32',V.slice(k*256,(k+1)*256),[1,256]);
    const r1=await this.enc.run({ids:new T('int64',BigInt64Array.from(sec.ids.map(BigInt)),[1,L]),ref});
    const dur=Array.from(r1.dur.data,Number);const Tn=dur.reduce((a,b)=>a+b,0);
    const expand=t=>{const C=t.dims[1],src=t.data,out=new Float32Array(C*Tn);
      for(let c=0;c<C;c++){let q=c*Tn;for(let l=0;l<L;l++){const v=src[c*L+l];for(let r=0;r<dur[l];r++)out[q++]=v;}}return new T('float32',out,[1,C,Tn]);};
    const r2=await this.f0n.run({en:expand(r1.d),ref});
    return {ref,dur,t_en:expand(r1.t_en),f0:r2.F0.data,N:r2.N};
  }
  async synthSection(sec,mode='acc'){
    const T=this.ort.Tensor;const {ref,dur,t_en,f0,N}=await this.predict(sec);
    const F=mode==='orig'?Float32Array.from(f0):f0Override(f0,sec.uid,dur,sec.U);
    const r3=await this.dec.run({asr:t_en,F0:new T('float32',F,[1,F.length]),N,ref});
    return {audio:Float32Array.from(r3.audio.data),f0:Float32Array.from(f0),f0new:F};
  }
  async synth(ys,mode='acc'){
    const P=plan(ys);const outs=[];for(const s of P)outs.push(await this.synthSection(s,mode));
    // one section: the model's audio as is (like the original); several language sections: joined
    return {audio:outs.length===1?outs[0].audio:join(outs.map(o=>o.audio)),plan:P,sections:outs};
  }
}
export function wav(a){
  const b=new ArrayBuffer(44+a.length*2),d=new DataView(b);const w=(o,s)=>[...s].forEach((c,i)=>d.setUint8(o+i,c.charCodeAt(0)));
  w(0,'RIFF');d.setUint32(4,36+a.length*2,true);w(8,'WAVE');w(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);
  d.setUint32(24,SR,true);d.setUint32(28,SR*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);w(36,'data');d.setUint32(40,a.length*2,true);
  a.forEach((v,i)=>d.setInt16(44+i*2,Math.max(-1,Math.min(1,v))*32767,true));return b;
}
