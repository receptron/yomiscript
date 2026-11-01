// Ask the LLMs (no tools, eval/llm_yomite/llm.mjs): the accent task 3 times, the two code-switching tasks once; the
// LLMs in parallel. A result already there is kept. An answer without JSON is asked once more.
// usage: node run.mjs [--prompts]    -> results/llm/<task>.<llm>.r<run>.json, results/prompt.<task>.md
import fs from "fs";
import path from "path";
import { callAsync, json } from "../llm_yomite/llm.mjs";
import { HERE, LLMS, llmFile, writeJson } from "./common.mjs";
import { TASKS, prompts } from "./prompts.mjs";

const RUNS = { accent: 3, mixed_ys: 1, mixed_kana: 1 };
const P = await prompts();
for (const t of TASKS) fs.writeFileSync(path.join(HERE, "results", `prompt.${t}.md`), P[t]);

async function ask(llm, task, run) {
  const file = llmFile(task, llm, run);
  if (fs.existsSync(path.join(HERE, file))) return;
  let r, out;
  for (let i = 0; i < 2 && !out; i++) {
    r = await callAsync(llm, P[task]);
    out = json(r.text);
  }
  writeJson(file, {
    llm,
    task,
    run,
    model: r.model,
    seconds: r.seconds,
    date: new Date().toISOString(),
    output: out,
    raw: r.text,
    stderr: r.stderr || undefined,
  });
  console.log(`${llm} ${task} r${run}: ${out ? Object.keys(out).length : "no JSON"} items, ${r.seconds.toFixed(0)} s`);
}
async function runLlm(llm) {
  for (const task of TASKS) for (let run = 1; run <= RUNS[task]; run++) await ask(llm, task, run);
}
if (!process.argv.includes("--prompts")) await Promise.all(LLMS.map(runLlm));
