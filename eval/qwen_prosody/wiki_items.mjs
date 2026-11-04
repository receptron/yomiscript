// The Wikipedia sentences (wiki_sentences.mjs) as items for generate.py and extract.py: an LLM writes each as
// YomiScript in the instructions the tools give with the line asking for accent phrases (eval/llm_phrasing's
// "phrase" condition, D32), 25 sentences a call. A sentence is kept when its YomiScript parses as one Japanese
// section and its <t:…> give back the sentence; its units are planned as items.mjs does, and its kana (what
// extract.py checks Whisper's transcript against, as there is no hand-checked reading) is the YomiScript's own.
// usage: node wiki_items.mjs [llm] [--parallel 3]   -> work/wiki/raw/<llm>/b<k>.json, work/wiki/items.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as K from "@yomiscript/kokoro";
import { originalText } from "yomiscript";
import { askBatch } from "../koriyama_g2p/ask.mjs";
import { ysKana } from "../koriyama_g2p/kana.mjs";
import { instructions } from "../llm_phrasing/run.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BATCH = 25;
const args = process.argv.slice(2),
  at = args.indexOf("--parallel"),
  parallel = at >= 0 ? Number(args[at + 1]) : 3,
  llm = args.find((a, i) => !a.startsWith("--") && i !== at + 1) ?? "claude";

const prompt = (batch) =>
  [
    "Each sentence below is about to be spoken aloud by a speech synthesizer. Write each as YomiScript. Do not use any tools.",
    batch.map((x) => `${x.name}: ${x.text}`).join("\n"),
    instructions("phrase"),
    'Return only a JSON object: {"<name>": "<the sentence as YomiScript>", ...}, one entry for each sentence.',
  ].join("\n\n");

/** the item of one sentence, or why it is not kept */
function item(x, ys) {
  if (typeof ys !== "string") return "no answer";
  let P;
  try {
    P = K.plan(ys);
  } catch {
    return "does not parse";
  }
  if (P.length !== 1) return "not one Japanese section";
  if (originalText(ys) !== x.text) return "other text";
  const { kana, parsed } = ysKana(ys);
  if (!parsed) return "does not parse";
  return { name: x.name, text: x.text, ys, kana, toks: P[0].toks.map(({ kind, mk, on, v, ipa, dev }) => ({ kind, mk, on, v, ipa, dev })) };
}

const S = JSON.parse(fs.readFileSync(path.join(HERE, "work/wiki/sentences.json"), "utf8")),
  B = Array.from({ length: Math.ceil(S.length / BATCH) }, (_, k) => S.slice(k * BATCH, (k + 1) * BATCH)),
  file = (b) => path.join(HERE, "work/wiki/raw", llm, `b${String(b).padStart(3, "0")}.json`),
  jobs = B.map((batch, b) => ({ batch, b }));
await Promise.all(
  Array.from({ length: parallel }, async () => {
    for (let j = jobs.shift(); j; j = jobs.shift())
      await askBatch({ file: file(j.b), llm, p: prompt(j.batch), items: j.batch, meta: { llm, format: "wiki", batch: j.b } });
  }),
);
const out = [],
  why = {};
B.forEach((batch, b) => {
  const r = fs.existsSync(file(b)) ? JSON.parse(fs.readFileSync(file(b), "utf8")).output : null;
  for (const x of batch) {
    const it = item(x, r?.[x.name]);
    if (typeof it === "string") why[it] = (why[it] ?? 0) + 1;
    else out.push(it);
  }
});
fs.writeFileSync(path.join(HERE, "work/wiki/items.json"), JSON.stringify(out));
console.log(`${out.length} of ${S.length} sentences (not kept: ${JSON.stringify(why)})`);
