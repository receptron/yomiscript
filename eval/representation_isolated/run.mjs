// Ask Claude and Codex for the hard set in each condition (conditions.mjs), about ten items per call, no two items of
// a call sharing a word (words.tsv). One call per condition, LLM, run and batch; three calls at a time per LLM.
// usage: node run.mjs [claude|codex ...] [--runs 3] [yomiscript|kana|ssml_bunsetsu ...]
//   -> results/r<run>/<condition>/<llm>/b<k>.json (raw answer, model, seconds, tokens), results/batches.json,
//      results/prompt.<condition>.b<k>.md
// A result already there is kept, so a run that stopped continues where it was. An answer without JSON is asked once more.
import fs from "fs";
import path from "path";
import { callAsync, json } from "../llm_yomite/llm.mjs";
import { SETS } from "../browser_tts/sets.mjs";
import { pool } from "../author_reading/run.mjs";
import { batches, CONDITIONS, HERE, LLMS, prompt } from "./conditions.mjs";

const OUT = path.join(HERE, "results");
const args = process.argv.slice(2),
  ri = args.indexOf("--runs");
const RUNS = ri >= 0 ? Number(args[ri + 1]) : 3;
const chosen = args.filter((a) => LLMS.includes(a)),
  conditions = args.filter((a) => a in CONDITIONS);
const B = batches(SETS.hard);

async function ask(llm, condition, run, k) {
  const file = path.join(OUT, `r${run}`, condition, llm, `b${k}.json`);
  if (fs.existsSync(file)) return;
  const tries = [];
  let r, out;
  for (let i = 0; i < 2 && !out; i++) {
    r = await callAsync(llm, prompt(condition, B[k]));
    out = json(r.text);
    tries.push({ seconds: r.seconds, json: !!out });
  }
  const rec = { llm, condition, run, batch: k, items: B[k].map((x) => x.name), model: r.model, seconds: r.seconds, outputTokens: r.outputTokens, tries };
  Object.assign(rec, { date: new Date().toISOString(), output: out, raw: r.text, ...(r.stderr ? { stderr: r.stderr } : {}) });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 1));
  const got = out ? B[k].filter((x) => out[x.name]).length : "no JSON";
  console.log(`${llm} r${run} ${condition} b${k}: ${got}/${B[k].length} items, ${r.seconds.toFixed(0)} s, ${r.outputTokens ?? "?"} tokens`);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "batches.json"), JSON.stringify(B.map((b) => b.map((x) => x.name))));
for (const c of Object.keys(CONDITIONS)) B.forEach((b, k) => fs.writeFileSync(path.join(OUT, `prompt.${c}.b${k}.md`), prompt(c, b)));
// the runs in order, the conditions of a run in turn (so that a change over time touches them all)
const jobs = [];
for (let run = 1; run <= RUNS; run++)
  for (const c of conditions.length ? conditions : Object.keys(CONDITIONS))
    for (const llm of chosen.length ? chosen : LLMS) B.forEach((_, k) => jobs.push([llm, () => ask(llm, c, run, k)]));
await pool(jobs);
