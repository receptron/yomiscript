// YomiScripts of the JSUT sentences (data/items.json, prepare.py) by an LLM, in the frozen YomiScript prompt of
// eval/representation (its prompt(), unchanged), BATCH sentences per call. A sentence whose text is one of the
// JVS-nonpara sentences of eval/koriyama_g2p already has Codex's answer in that prompt; it is reused, not asked again.
// Codex is asked first; when it gives no answer (its usage limit), the rest is asked of Claude.
// usage: node run.mjs [--parallel 2]   -> results/raw/reused.json and results/raw/<llm>/b<batch>.json (gitignored)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prompt } from "../representation/formats.mjs";
import { askBatch } from "../koriyama_g2p/ask.mjs";
import { ordered } from "../koriyama_g2p/items.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ITEMS = path.join(HERE, "data/items.json"),
  // JSUT_ACCENT_RAW: another copy of the answers (a snapshot taken while a run goes on)
  RAW = process.env.JSUT_ACCENT_RAW ?? path.join(HERE, "results/raw");
const KORIYAMA = path.join(HERE, "../koriyama_g2p/results/raw/yomiscript/codex");
export const BATCH = 50;
const args = process.argv.slice(2),
  at = args.indexOf("--parallel"),
  PARALLEL = at >= 0 ? Number(args[at + 1]) : 2;

export const items = () => JSON.parse(fs.readFileSync(ITEMS, "utf8"));

/** Codex's answers of eval/koriyama_g2p, by the sentence's text */
function koriyamaAnswers() {
  const text = new Map(ordered().map((x) => [x.name, x.text])),
    out = new Map();
  for (const f of fs.existsSync(KORIYAMA) ? fs.readdirSync(KORIYAMA) : []) {
    const r = JSON.parse(fs.readFileSync(path.join(KORIYAMA, f), "utf8"));
    for (const [name, ys] of Object.entries(r.output ?? {}))
      if (typeof ys === "string") out.set(text.get(name), { ys, model: r.model, from: `koriyama_g2p ${name}` });
  }
  return out;
}

/** the reused answers, and the batches of the sentences left to ask */
function plan(all) {
  const K = koriyamaAnswers(),
    reused = {},
    left = [];
  for (const x of all) {
    const k = K.get(x.text);
    if (k) reused[x.name] = k;
    else left.push(x);
  }
  const B = [];
  for (let i = 0; i < left.length; i += BATCH) B.push(left.slice(i, i + BATCH));
  return { reused, B };
}

const llmFile = (llm, b) => path.join(RAW, llm, `b${String(b).padStart(3, "0")}.json`);
/** the batch's answer on disk, from either LLM */
export const answered = (b) => ["codex", "claude"].map((l) => llmFile(l, b)).find((f) => fs.existsSync(f));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { reused, B } = plan(items());
  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(path.join(RAW, "reused.json"), JSON.stringify(reused, null, 1));
  fs.writeFileSync(path.join(RAW, "batches.json"), JSON.stringify(B.map((b) => b.map((x) => x.name))));
  console.log(`${Object.keys(reused).length} reused from eval/koriyama_g2p, ${B.length} batches to ask`);
  let llm = "codex";
  const jobs = B.map((_, b) => b).filter((b) => !answered(b));
  const worker = async () => {
    for (let b = jobs.shift(); b !== undefined; b = jobs.shift()) {
      const ask = (l) =>
        askBatch({ file: llmFile(l, b), llm: l, p: prompt("yomiscript", B[b]), items: B[b], meta: { llm: l, format: "yomiscript", batch: b } });
      await ask(llm);
      if (!answered(b) && llm === "codex") {
        llm = "claude"; // Codex's usage limit: the rest goes to Claude
        console.log("Codex gave no answer: switching to Claude");
        await ask(llm);
      }
    }
  };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
