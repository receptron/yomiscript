// English Yomite (Kokoro-based): English text -> YomiScript with pitch values.
//   1. g2p.py (misaki, Kokoro's English G2P): IPA, stress, syllables, boundaries
//   2. Kokoro's prosody predictor (demo/ys_web/web/kokoro_prosody.js, ONNX enc + f0n): <f0:…> values per syllable
// usage: node yomite_en.mjs [--gb] "text" ...      prints one JSON object per line: {"text", "marked", "ys"}
// env:   YOMITE_PY  python with misaki installed (default: python3)
// needs: the demo's ONNX models and voices in demo/ys_web/web (see demo/ys_web/README.md)
import fs from 'fs';import path from 'path';import {spawnSync} from 'child_process';import {createRequire} from 'module';
import {fileURLToPath,pathToFileURL} from 'url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),DEMO=path.join(HERE,'../../demo/ys_web'),WEB=path.join(DEMO,'web');
const ort=await import(pathToFileURL(createRequire(path.join(DEMO,'package.json')).resolve('onnxruntime-web')).href);
const K=await import(pathToFileURL(path.join(WEB,'ys.js')).href);
const {KokoroProsody}=await import(pathToFileURL(path.join(WEB,'kokoro_prosody.js')).href);

export function g2p(texts,{gb=false}={}){
  const r=spawnSync(process.env.YOMITE_PY||'python3',[path.join(HERE,'g2p.py'),...(gb?['--gb']:[]),...texts],{encoding:'utf8',maxBuffer:1<<26});
  if(r.status!==0)throw new Error('g2p.py failed: '+r.stderr.split('\n').filter(l=>!/warn/i.test(l)).slice(-5).join('\n'));
  return r.stdout.trim().split('\n').map(l=>JSON.parse(l));
}
let KP=null;
export async function predictor(){
  if(KP)return KP;
  K.setData(JSON.parse(fs.readFileSync(path.join(WEB,'data.json'))));
  ort.env.wasm.numThreads=1;
  const E=new K.Engine(ort,async p=>{const b=fs.readFileSync(path.join(WEB,p));return p.endsWith('.bin')?b.buffer.slice(b.byteOffset,b.byteOffset+b.length):new Uint8Array(b);});
  await E.init({suffix:{enc:'_w16',f0n:'_w16',dec:'_w16'}});
  return KP=new KokoroProsody(E);
}
export async function yomiteEn(texts,opt={}){
  const G=g2p(texts,opt),P=await predictor();
  const out=[];for(const g of G)out.push({text:g.text,marked:g.ys,ys:await P.realize(g.ys)});
  return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const a=process.argv.slice(2),gb=a.includes('--gb');
  for(const r of await yomiteEn(a.filter(x=>x!=='--gb'),{gb}))console.log(JSON.stringify(r));
}
