// Compare Yomite (yomite/en_kokoro/g2p.py or yomite/ja_kokoro/g2p.py) + YomiScript + Katarite (demo/ys_web/web/ys.js, ONNX, no pitch values)
// against the original Kokoro (ref_kokoro.py output): phoneme string, ids, voice-pack index, durations, F0, audio.
// usage: node compare.mjs <ref_dir> [--m fp32|w16]     env YOMITE_PY: python with kokoro + misaki
import fs from 'fs';import path from 'path';import {spawnSync} from 'child_process';import {createRequire} from 'module';
import {fileURLToPath,pathToFileURL} from 'url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.join(HERE,'../..'),DEMO=path.join(ROOT,'demo/ys_web'),WEB=path.join(DEMO,'web');
const REF=process.argv[2],M=(process.argv.indexOf('--m')>0?process.argv[process.argv.indexOf('--m')+1]:'fp32');
const ort=await import(pathToFileURL(createRequire(path.join(DEMO,'package.json')).resolve('onnxruntime-web')).href);
const K=await import(pathToFileURL(path.join(WEB,'ys.js')).href);
K.setData(JSON.parse(fs.readFileSync(path.join(WEB,'data.json'))));
const R=JSON.parse(fs.readFileSync(path.join(REF,'ref.json')));
// 1. Yomite: text -> YomiScript (one utterance per original chunk)
const texts=[...new Set(R.items.map(x=>x.text))];
const yomite=R.items[0].voice[0]==='j'?'yomite/ja_kokoro/g2p.py':'yomite/en_kokoro/g2p.py'; // the language follows the voice
const g=spawnSync(process.env.YOMITE_PY||'python3',[path.join(ROOT,yomite),...texts],{encoding:'utf8',maxBuffer:1<<26});
if(g.status!==0)throw new Error(g.stderr);
const Y=g.stdout.trim().split('\n').filter(l=>l.startsWith('{')).map(l=>JSON.parse(l));
// 2. Katarite
ort.env.wasm.numThreads=1;
const E=new K.Engine(ort,async p=>{const b=fs.readFileSync(path.join(WEB,p));return p.endsWith('.bin')?b.buffer.slice(b.byteOffset,b.byteOffset+b.length):new Uint8Array(b);});
const SUF={fp32:{},w16:{enc:'_w16',f0n:'_w16',dec:'_w16'}}[M];await E.init({suffix:SUF});
function wavRead(f){const b=fs.readFileSync(f);let o=12;while(b.toString('ascii',o,o+4)!=='data'){o+=8+b.readUInt32LE(o+4);}const n=b.readUInt32LE(o+4)/4,fmt=b.readUInt16LE(20);
  if(fmt===3){const a=new Float32Array(n);for(let i=0;i<n;i++)a[i]=b.readFloatLE(o+8+i*4);return a;}
  const m=b.readUInt32LE(o+4)/2,a=new Float32Array(m);for(let i=0;i<m;i++)a[i]=b.readInt16LE(o+8+i*2)/32768;return a;}
const st=x=>12*Math.log2(Math.max(x,1));
const rows=[];let all={ps:0,ids:0,ref:0,dur:0,n:0};
for(const it of R.items){
  const ti=texts.indexOf(it.text),mine=Y.filter(y=>y.index===ti);
  const chunks=it.chunks.map((c,k)=>({c,y:mine[k]}));
  for(const {c,y} of chunks){
    all.n++;const r={name:it.name,voice:it.voice,chunk:c.text.slice(0,40)};
    if(!y){r.err='no Yomite chunk';rows.push(r);continue;}
    r.ys=y.ys;
    const P=K.plan(y.ys);P.forEach(s=>s.voice=it.voice);
    r.sections=P.length;const s=P[0];
    r.ps=P.map(s=>s.ps).join('')===c.ps;all.ps+=r.ps;
    if(!r.ps){r.ps_got=P.map(s=>s.ps).join(' | ');r.ps_want=c.ps;}
    r.ids=JSON.stringify(s.ids)===JSON.stringify(c.ids)&&P.length===1;all.ids+=r.ids;
    r.ref=(s.ps.length-1)===c.ref_index;all.ref+=r.ref;
    if(P.length===1&&r.ids){
      const {audio}=await E.synthSection(s,'orig');           // with the reference's voice (one section: audio as is)
      const pr=await E.predict(s);
      r.dur_same=pr.dur.filter((d,i)=>d===c.dur[i]).length/c.dur.length;all.dur+=r.dur_same===1;
      const n=Math.min(pr.f0.length,c.f0.length);let se=0,m=0;for(let i=0;i<n;i++)if(c.f0[i]>60&&pr.f0[i]>60){se+=(st(pr.f0[i])-st(c.f0[i]))**2;m++;}
      r.f0_rmse_st=m?Math.sqrt(se/m):null;r.f0_len=[pr.f0.length,c.f0.length];
      const ref=wavRead(path.join(REF,c.wav)),L=Math.min(ref.length,audio.length);let num=0,den=0,dot=0,ea=0,eb=0;
      for(let i=0;i<L;i++){const d=audio[i]-ref[i];num+=ref[i]**2;den+=d*d;dot+=audio[i]*ref[i];ea+=audio[i]**2;eb+=ref[i]**2;}
      fs.writeFileSync(path.join(REF,`ours.${M}.${c.wav}`),Buffer.from(K.wav(audio)));
      r.audio_len=[audio.length,ref.length];r.snr_db=10*Math.log10(num/Math.max(den,1e-12));r.corr=dot/Math.sqrt(ea*eb);
    }
    rows.push(r);
  }
}
fs.writeFileSync(path.join(REF,`compare.${M}.json`),JSON.stringify(rows,null,1));
for(const r of rows)console.log([r.name.padEnd(13),r.voice,r.ps?'ps=':'ps≠',r.ids?'ids=':'ids≠',r.ref?'ref=':'ref≠',
  r.dur_same===undefined?'':`dur ${(r.dur_same*100).toFixed(0)}%`,r.f0_rmse_st==null?'':`F0 ${r.f0_rmse_st.toFixed(3)}st`,r.snr_db===undefined?'':`SNR ${r.snr_db.toFixed(1)}dB corr ${r.corr.toFixed(4)} len ${r.audio_len.join('/')}`].join(' '));
console.log(`\n${all.n} chunks: ps identical ${all.ps}, ids identical ${all.ids}, voice index identical ${all.ref}, durations identical ${all.dur}`);
for(const r of rows.filter(r=>!r.ps)){console.log(`\n${r.name}\n  want ${r.ps_want}\n  got  ${r.ps_got}\n  ys   ${r.ys}`);}
