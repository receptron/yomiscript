// LLM-as-Yomite experiment: ask Claude Code and Codex to write YomiScript with pitch values, then score and export.
// usage: node run.mjs [claude|codex ...] [--set en] [--task text|marked ...]   (default: both LLMs, both tasks)
//   --set en: English items (items_en.json; reference and prompt examples from the Kokoro-based English Yomite)
//   task "text":   plain text -> YomiScript with IPA, marks and <f0:…> values (the LLM is the whole Yomite)
//   task "marked": marked YomiScript -> the same with <f0:…> values (the LLM is only the prosody stage)
import fs from 'fs';import path from 'path';import os from 'os';import {spawnSync} from 'child_process';
import {fileURLToPath} from 'url';
import {realize} from '../../demo/ys_web/web/yomite.js';
const HERE=path.dirname(fileURLToPath(import.meta.url)),OUT=path.join(HERE,'results');
let args=process.argv.slice(2);const si=args.indexOf('--set'),SET=si>=0?args[si+1]:'';if(si>=0)args.splice(si,2);
const ti=args.indexOf('--task');
const TASKS=ti>=0?args.slice(ti+1):SET?['text']:['text','marked'],LLMS=(ti>=0?args.slice(0,ti):args).filter(Boolean);
const D=JSON.parse(fs.readFileSync(path.join(HERE,SET?`items_${SET}.json`:'items.json')));
const ref=x=>x.ys??realize(x.marked,{dialect:x.dialect});
const TEMPLATE=fs.readFileSync(path.join(HERE,'prompt.md'),'utf8');
const dialectNote=x=>x.dialect?.ja==='osaka'?' (Japanese accent: Osaka / Keihan-type dialect)':'';
const TASK_TEXT={
  text:'For each item, write the YomiScript for the given text in the given language, with pitch values for every mora or syllable.',
  marked:'For each item you are given YomiScript with accent marks but no pitch values. Add `<f0:…>` values for every mora or syllable. Keep the IPA, the marks, the boundaries and the language tags exactly as given; you may only add `<f0:…>` values and `◌̥` for devoiced vowels.',
};
function prompt(task){
  const ex=D.examples.map(x=>task==='text'
    ?`Input (${x.lang}${dialectNote(x)}): ${x.text}\nOutput: ${ref(x)}`
    :`Input${dialectNote(x)}: ${x.marked}\nOutput: ${ref(x)}`).join('\n\n');
  const it=D.items.map(x=>task==='text'?`- ${x.name} (${x.lang}${dialectNote(x)}): ${x.text}`:`- ${x.name}${dialectNote(x)}: ${x.marked}`).join('\n');
  return TEMPLATE.replace('{{EXAMPLES}}',ex).replace('{{TASK}}',TASK_TEXT[task]).replace('{{ITEMS}}',it);
}
function call(llm,p){
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'llm_yomite_'));const t0=Date.now();let text,model,err='';
  if(llm==='claude'){
    const r=spawnSync('claude',['-p','--output-format','json','--disallowedTools','Bash','Edit','Write','Read','Glob','Grep','WebFetch','WebSearch'],{input:p,cwd,encoding:'utf8',maxBuffer:1<<26});
    err=r.stderr;try{const j=JSON.parse(r.stdout);text=j.result;model=Object.keys(j.modelUsage??{}).join(',');}catch{text=r.stdout;}
  }else{
    const o=path.join(cwd,'out.txt');
    const r=spawnSync('codex',['exec','--skip-git-repo-check','--ephemeral','-s','read-only','-C',cwd,'-o',o],{input:p,cwd,encoding:'utf8',maxBuffer:1<<26});
    err=r.stderr;text=fs.existsSync(o)?fs.readFileSync(o,'utf8'):r.stdout;model=(r.stderr.match(/model:\S*\s+(\S+)/)||[])[1];
  }
  fs.rmSync(cwd,{recursive:true,force:true});
  return {text,model,seconds:(Date.now()-t0)/1000,stderr:text?'':err};
}
function json(text){const a=text?.indexOf('{'),b=text?.lastIndexOf('}');if(a<0||b<a)return null;try{return JSON.parse(text.slice(a,b+1));}catch{return null;}}
fs.mkdirSync(OUT,{recursive:true});
for(const llm of LLMS.length?LLMS:['claude','codex'])for(const task of TASKS){
  const tag=(SET?SET+'.':'')+task,p=prompt(task);fs.writeFileSync(path.join(OUT,`prompt.${tag}.md`),p);
  process.stdout.write(`${llm} / ${tag} … `);
  const r=call(llm,p),out=json(r.text);
  fs.writeFileSync(path.join(OUT,`${llm}.${tag}.json`),JSON.stringify({llm,task,set:SET||'ja',model:r.model,seconds:r.seconds,date:new Date().toISOString(),output:out,raw:out?undefined:r.text,stderr:r.stderr||undefined},null,1));
  console.log(out?`${Object.keys(out).length} items, ${r.seconds.toFixed(0)} s, model ${r.model}`:'no JSON in the answer (see raw)');
}
