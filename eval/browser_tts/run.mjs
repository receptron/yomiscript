// Ask Claude Code and Codex to be the Yomite for Kokoro: plain text -> YomiScript without pitch values.
// usage: node run.mjs [claude|codex ...] [--set ja|en|hard ...]   (default: both LLMs, all sets)
import fs from "fs";
import path from "path";
import { call, json } from "../llm_yomite/llm.mjs";
import { buildPrompt, HERE, SETS } from "./sets.mjs";

const OUT = path.join(HERE, "results");
const args = process.argv.slice(2),
  si = args.indexOf("--set");
const NAMES = si >= 0 ? args.slice(si + 1) : Object.keys(SETS),
  LLMS = (si >= 0 ? args.slice(0, si) : args).filter(Boolean);
const TEMPLATE = fs.readFileSync(path.join(HERE, "prompt.md"), "utf8");
const prompt = (items) => buildPrompt(TEMPLATE, items);
fs.mkdirSync(OUT, { recursive: true });
for (const llm of LLMS.length ? LLMS : ["claude", "codex"])
  for (const set of NAMES) {
    process.stdout.write(`${llm} / ${set} … `);
    const r = call(llm, prompt(SETS[set])),
      out = json(r.text);
    const rec = { llm, set, model: r.model, seconds: r.seconds, outputTokens: r.outputTokens, date: new Date().toISOString(), output: out };
    if (!out) rec.raw = r.text;
    if (r.stderr) rec.stderr = r.stderr;
    fs.writeFileSync(path.join(OUT, `${llm}.${set}.json`), JSON.stringify(rec, null, 1));
    console.log(out ? `${Object.keys(out).length} items, ${r.seconds.toFixed(0)} s, model ${r.model}` : "no JSON in the answer (see raw)");
  }
