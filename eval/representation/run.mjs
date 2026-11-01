// Ask each LLM for the hard set in each format (formats.mjs): one call per format, LLM and run, the LLMs in parallel.
// usage: node run.mjs [claude|codex|agy ...] [--runs 3] [yomiscript|kana|ssml|sparse ...]   -> results/r<run>/<format>.<llm>.json, results/prompt.<format>.md
// A result already there is kept, so a run that stopped continues where it was. An answer without JSON is asked once more.
import fs from "fs";
import path from "path";
import { callAsync, json } from "../llm_yomite/llm.mjs";
import { SETS } from "../browser_tts/sets.mjs";
import { FORMATS, HERE, LLMS, prompt } from "./formats.mjs";

const OUT = path.join(HERE, "results");
const args = process.argv.slice(2),
  ri = args.indexOf("--runs");
const RUNS = ri >= 0 ? Number(args[ri + 1]) : 3;
const chosen = args.filter((a) => LLMS.includes(a)),
  formats = args.filter((a) => FORMATS.includes(a));
const PROMPTS = Object.fromEntries(FORMATS.map((f) => [f, prompt(f, SETS.hard)]));

async function ask(llm, format, run) {
  const file = path.join(OUT, `r${run}`, `${format}.${llm}.json`);
  if (fs.existsSync(file)) return;
  const tries = [];
  let r, out;
  for (let i = 0; i < 2 && !out; i++) {
    r = await callAsync(llm, PROMPTS[format]);
    out = json(r.text);
    tries.push({ seconds: r.seconds, json: !!out });
  }
  const rec = { llm, format, run, model: r.model, seconds: r.seconds, outputTokens: r.outputTokens, tries, date: new Date().toISOString() };
  Object.assign(rec, { output: out, raw: r.text, ...(r.stderr ? { stderr: r.stderr } : {}) });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 1));
  console.log(`${llm} r${run} ${format}: ${out ? Object.keys(out).length : "no JSON"} items, ${r.seconds.toFixed(0)} s, ${r.outputTokens ?? "?"} tokens`);
}

// per LLM: the runs one after another, the formats of a run in turn (so that a change over time touches them all)
async function runLlm(llm) {
  for (let run = 1; run <= RUNS; run++) for (const format of formats.length ? formats : FORMATS) await ask(llm, format, run);
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of FORMATS) fs.writeFileSync(path.join(OUT, `prompt.${f}.md`), PROMPTS[f]);
await Promise.all((chosen.length ? chosen : LLMS).map(runLlm));
