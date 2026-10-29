// Yomite (reference, rule-based prosody): YomiScript with accent / stress / tone marks -> the same YomiScript with
// pitch values <f0:…> (semitones relative to the speaker's register) after each unit. Also writes allophones that are
// a pronunciation choice: Japanese vowel devoicing (◌̥) and the American English t/d flap (ɾ).
// Units that already carry <f0:…> are left as written. The Katarite renders only the values.
import {parse,isJa} from './yomiscript.js';
const inStr=(ch,s)=>s.includes(ch);
const fmt=v=>String(Math.round(v*100)/100);
export const f0Mark=c=>`<f0:${c.map(fmt).join(',')}>`;
export function applyEdits(s,E){
  for(const e of [...E].sort((a,b)=>b.at-a.at))s=s.slice(0,e.at)+e.ins+s.slice(e.at+(e.del||0));
  return s;
}
// Japanese: Tokyo-type pitch from ꜛ / ꜜ per accent phrase; Osaka (ja-x-osaka) flattens the high stretch
const VLJ=['k','s','ɕ','t','ʨ','ʦ','h','ç','ɸ','p'];
function jaRules(sec,E){
  const osaka=sec.lang==='ja-x-osaka',C=[];
  for(const t of sec.toks)if(t.kind==='unit')(C[t.chunk]??=[]).push(t);
  const sw=m=>!!m&&m.mk==='mora'&&VLJ.some(x=>m.ipa.startsWith(x));
  for(const M of C){
    let state=M[0].hasRise?'L':'H',hk=0;
    M.forEach((m,k)=>{
      let v;if(state==='H'){v=2.5-0.45*hk;hk++;}else v=(k===0)?-2.0:-2.5-0.3*hk;
      const auto=!osaka&&m.mk==='mora'&&inStr(m.v,'iɯɨ')&&sw(m)&&(sw(M[k+1])||(k===M.length-1&&sec.end==='$'&&(m.ipa==='sɯ'||m.ipa==='sɨ')));
      if(auto&&!m.dev)E.push({at:m.vend,ins:'̥'});
      let c=(m.dev||auto)?null:[v];
      if(osaka&&c)c=[c[0]<0?c[0]:2.5-(2.5-c[0])/3];
      if(c&&!m.f0)E.push({at:m.end,ins:f0Mark(c)});
      if(m.rise)state='H';if(m.fall)state='L';
    });
  }
}
// English / French: stress-based pitch, phrase-boundary rise, sentence-final fall or rise
const VOW='AIOQWYaeiouæɑɒɔəɚɛɜɪʊʌᵊɐøœɔ̃';
function euRules(sec,E,top){
  const fr=sec.lang==='fr',gb=sec.lang==='en-GB',noflap=sec.lang.startsWith('en')&&!top.startsWith('en');
  const C=[];let prev=null;
  const lastC=()=>{for(let j=C.length-1;j>=0;j--)if(C[j].c)return C[j];};
  for(const t of sec.toks){
    if(t.kind==='bound'){const L=lastC();if(L)L.c=[...L.c,2.5];continue;}
    if(t.kind!=='unit'){prev=t;continue;}
    if(t.f0){C.push({t,c:null});prev=t;continue;}
    let c;
    if(fr)c=t.j===t.nsyl-1?[0.5]:[-0.5];
    else{
      c={'ˈ':[3.0,1.0],'ˌ':[1.0]}[t.st]??[-1.5];
      const r=t.raw;
      if(!gb&&!noflap&&t.j>0&&inStr(r[0]??'#','td')&&r.length>1&&(inStr(r[1],VOW+'ɝɚ')||r.slice(1).startsWith('l̩'))&&prev?.kind==='unit'&&inStr(prev.raw.slice(-1),VOW+'ɹrɝɚ'))
        E.push({at:t.start,del:1,ins:'ɾ'});
    }
    C.push({t,c});prev=t;
  }
  const L=lastC();if(L)L.c=sec.end==='$'?[L.c[0],-5]:[L.c[0],6];
  for(const {t,c} of C)if(c)E.push({at:t.end,ins:f0Mark(c)});
}
// Chinese: tone contours (tone 5 = neutral, no value)
const TC={'1':[3,3],'2':[-1,3.5],'3':[-3,-4.5,-3],'4':[4,-3],'5':null};
function zhRules(sec,E){for(const t of sec.toks)if(t.kind==='unit'&&!t.f0&&TC[t.tone])E.push({at:t.end,ins:f0Mark(TC[t.tone])});}
export function realize(ys){
  const Y=parse(ys),E=[];
  for(const sec of Y.sections){if(isJa(sec.lang))jaRules(sec,E);else if(sec.lang==='zh')zhRules(sec,E);else euRules(sec,E,Y.top);}
  return applyEdits(Y.ys,E);
}
