// Ask Claude and Codex for the 300-sentence subset of eval/koriyama_g2p (its first 300 of the seeded order, batches of
// 50) under the conditions that have a prompt here (conditions.mjs); run 1 of the frozen prompts is eval/koriyama_g2p's.
// usage: node run.mjs [claude|codex ...] [condition ...] [--set subset|targeted] [--parallel 3]
//   -> results/raw/<set>/<condition>/<llm>/b<batch>.json, results/prompts/<condition>.b00.md (gitignored: they hold the text)
import fs from "fs";
import path from "path";
import { askBatch } from "../koriyama_g2p/ask.mjs";
import { CONDITIONS, HERE, LLMS, SETS } from "./conditions.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const PARALLEL = Number(opt("--parallel", 3)),
  SET = opt("--set", "subset");
const toRun = Object.keys(CONDITIONS).filter((c) => CONDITIONS[c].prompt);
const chosen = args.filter((a) => LLMS.includes(a)),
  conds = args.filter((a) => toRun.includes(a));
const B = SETS[SET](),
  RAW = path.join(HERE, "results", "raw", SET);

// the first prompt of each condition, to read what was asked (the subset's)
fs.mkdirSync(path.join(HERE, "results", "prompts"), { recursive: true });
if (SET === "subset") for (const c of toRun) fs.writeFileSync(path.join(HERE, "results", "prompts", `${c}.b00.md`), CONDITIONS[c].prompt(B[0]));

async function runLlm(llm) {
  const jobs = B.flatMap((_, b) => (conds.length ? conds : toRun).map((c) => [c, b]));
  const ask = ([c, b]) => {
    const file = path.join(RAW, c, llm, `b${String(b).padStart(2, "0")}.json`);
    return askBatch({ file, llm, p: CONDITIONS[c].prompt(B[b]), items: B[b], meta: { llm, format: c, batch: b } });
  };
  const worker = async () => {
    for (let j = jobs.shift(); j; j = jobs.shift()) await ask(j);
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
}

const t0 = Date.now();
await Promise.all((chosen.length ? chosen : LLMS).map(runLlm));
console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
