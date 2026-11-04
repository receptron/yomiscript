// The LLM's accent phrases on the corpus (D32): for each sentence Qwen read from the text, the LLM puts ` | ` between
// the accent phrases of its YomiScript and changes nothing else, so Qwen's pitch, measured mora by mora on that
// YomiScript, still lines up. The line asking for them is eval/llm_phrasing's PHRASE_LINE. An answer that changes
// anything but the ` | ` is not kept (the sentence then has no phrases of its own).
// usage: node phrase_corpus.mjs [llm] [--parallel 3]   -> work/phrased/<llm>/b<k>.json, work/phrased.json ({ name: ys })
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { askBatch } from "../koriyama_g2p/ask.mjs";
import { PHRASE_LINE } from "../llm_phrasing/run.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BATCH = 50;
const args = process.argv.slice(2),
  at = args.indexOf("--parallel"),
  parallel = at >= 0 ? Number(args[at + 1]) : 3,
  llm = args.find((a, i) => !a.startsWith("--") && i !== at + 1) ?? "claude";

const prompt = (batch) =>
  [
    "Each line below is a Japanese sentence written in YomiScript, a pronunciation notation: IPA mora by mora, each word followed by the text it reads in <t:…>, ` ‖ ` a pause. Do not use any tools.",
    batch.map((x) => `${x.name}: ${x.ys}`).join("\n"),
    "Add the accent phrase boundaries to each, and change nothing else (not the IPA, the <t:…>, the spaces or the marks):",
    PHRASE_LINE,
    "Example: ja /tsɯitatɕi<t:一日> kaɾa<t:から> | mikka<t:三日> made<t:まで> | jasɯmi<t:休み> desɯ<t:です。> ↘/",
    'Return only a JSON object: {"<name>": "<the YomiScript with ` | `>", ...}, one entry for each sentence.',
  ].join("\n\n");

/** the YomiScript without its ` | ` and with single spaces, to check that nothing else changed */
const bare = (ys) => ys.replace(/ \| /g, " ").replace(/\s+/g, " ").trim();

const rows = fs
    .readFileSync(path.join(HERE, "data/jsut_qwen_clone.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .filter((r) => r.given === "text"),
  B = Array.from({ length: Math.ceil(rows.length / BATCH) }, (_, k) => rows.slice(k * BATCH, (k + 1) * BATCH)),
  file = (b) => path.join(HERE, "work/phrased", llm, `b${String(b).padStart(2, "0")}.json`),
  jobs = B.map((batch, b) => ({ batch, b }));
await Promise.all(
  Array.from({ length: parallel }, async () => {
    for (let j = jobs.shift(); j; j = jobs.shift())
      await askBatch({ file: file(j.b), llm, p: prompt(j.batch), items: j.batch, meta: { llm, format: "phrase", batch: j.b } });
  }),
);
const out = {};
let kept = 0;
B.forEach((batch, b) => {
  const r = fs.existsSync(file(b)) ? JSON.parse(fs.readFileSync(file(b), "utf8")).output : null;
  for (const x of batch) {
    const ys = r?.[x.name];
    if (typeof ys === "string" && bare(ys) === bare(x.ys) && ys.includes(" | ")) {
      out[x.name] = ys;
      kept++;
    }
  }
});
fs.writeFileSync(path.join(HERE, "work/phrased.json"), JSON.stringify(out));
console.log(`${kept} of ${rows.length} sentences with the LLM's phrases`);
