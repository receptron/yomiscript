// Ask each LLM for the benchmark sentences in the frozen formats of eval/representation (its prompt(), unchanged),
// BATCH sentences per call (items.mjs).
// usage: node run.mjs [claude|codex|agy ...] [yomiscript|kana ...] [--n 300] [--parallel 2]
//   -> results/raw/<format>/<llm>/b<batch>.json (raw answer, model, seconds, tokens; gitignored)
// A result already there is kept, so a run that stopped continues where it was (ask.mjs).
import path from "path";
import { LLMS, prompt } from "../representation/formats.mjs";
import { askBatch } from "./ask.mjs";
import { batches, FORMATS, HERE, SUBSET } from "./items.mjs";

const RAW = path.join(HERE, "results", "raw");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const N = opt("--n", SUBSET),
  PARALLEL = opt("--parallel", 2);
const chosen = args.filter((a) => LLMS.includes(a)),
  formats = args.filter((a) => FORMATS.includes(a));
const B = batches(N);

async function ask(llm, format, b) {
  const file = path.join(RAW, format, llm, `b${String(b).padStart(2, "0")}.json`);
  await askBatch({ file, llm, p: prompt(format, B[b]), items: B[b], meta: { llm, format, batch: b } });
}

// per LLM: PARALLEL workers over the (batch, format) jobs, the formats of a batch next to each other
async function runLlm(llm) {
  const jobs = B.flatMap((_, b) => (formats.length ? formats : FORMATS).map((f) => [f, b]));
  const worker = async () => {
    for (let j = jobs.shift(); j; j = jobs.shift()) await ask(llm, ...j);
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
}

const t0 = Date.now();
await Promise.all((chosen.length ? chosen : LLMS).map(runLlm));
console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
