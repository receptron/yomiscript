// Can the LLM write the accent phrase boundaries ( | ) itself, without misreading more? JSUT sentences of the test
// half (the odd ids of eval/jsut_accent/data/items.json, evenly spaced) are written as YomiScript by an LLM in the
// instructions the tools give (YOMISCRIPT_INSTRUCTIONS), in three conditions, the same batches in each:
//   base, base2  the instructions as they are (twice: how much the readings change between two runs anyway)
//   phrase       the same, with one more line asking for ` | ` between accent phrases (PHRASE_LINE)
// usage: node run.mjs [llm] [--parallel 3]   -> results/raw/<llm>/<condition>/b<k>.json (gitignored: JSUT text)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { YOMISCRIPT_INSTRUCTIONS } from "@yomiscript/core";
import { askBatch } from "../koriyama_g2p/ask.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const N = 500,
  BATCH = 25,
  CONDITIONS = ["base", "base2", "phrase"],
  RAW = path.join(HERE, "results/raw");
const ITEMS = path.join(HERE, "../jsut_accent/data/items.json");

// the one line the phrase condition adds, after the line on pauses
export const PHRASE_LINE =
  "- Japanese: write ` | ` between accent phrases, the groups a speaker says each with one rise of the pitch (usually a content word with the particles and endings after it; a speaker often joins words into one phrase). Never inside a word; ` ‖ ` is already a boundary.";
// the two Japanese examples of the instructions, with their accent phrases
const PHRASE_EXAMPLES = [
  "ja /ɕɯːmatsɯ<t:週末> wa<t:は> ‖<t:、> tomodatɕi<t:友達> to<t:と> | kʲoːto<t:京都> e<t:へ> | ikɯ<t:行く> joteː<t:予定> desɯ<t:です。> ↘/",
  "ja /tsɯitatɕi<t:一日> kaɾa<t:から> | mikka<t:三日> made<t:まで> | jasɯmi<t:休み> desɯ<t:です。> ↘/",
];

/** the instructions of a condition */
export function instructions(condition) {
  if (condition !== "phrase") return YOMISCRIPT_INSTRUCTIONS;
  const lines = YOMISCRIPT_INSTRUCTIONS.split("\n"),
    pause = lines.findIndex((l) => l.startsWith("- ` ‖ `")),
    first = lines.findIndex((l) => l.startsWith("ja /"));
  return [...lines.slice(0, pause + 1), PHRASE_LINE, ...lines.slice(pause + 1, first), ...PHRASE_EXAMPLES, ...lines.slice(first + 2)].join("\n");
}

/** the sentences: N of the test half, evenly spaced */
export function sentences() {
  const odd = JSON.parse(fs.readFileSync(ITEMS, "utf8")).filter((x) => Number(x.name.split("_")[1]) % 2 === 1);
  return Array.from({ length: N }, (_, i) => odd[Math.floor((i * odd.length) / N)]);
}

const prompt = (condition, batch) =>
  [
    "Each sentence below is about to be spoken aloud by a speech synthesizer. Write each as YomiScript. Do not use any tools.",
    batch.map((x) => `${x.name}: ${x.text}`).join("\n"),
    instructions(condition),
    'Return only a JSON object: {"<name>": "<the sentence as YomiScript>", ...}, one entry for each sentence.',
  ].join("\n\n");

export const batchFile = (llm, condition, b) => path.join(RAW, llm, condition, `b${String(b).padStart(2, "0")}.json`);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    at = args.indexOf("--parallel"),
    parallel = at >= 0 ? Number(args[at + 1]) : 3,
    llm = args.find((a, i) => !a.startsWith("--") && i !== at + 1) ?? "claude",
    S = sentences(),
    B = Array.from({ length: Math.ceil(S.length / BATCH) }, (_, k) => S.slice(k * BATCH, (k + 1) * BATCH));
  // the conditions interleaved, so that a change of the service during the run falls on all of them alike
  const jobs = B.flatMap((batch, b) => CONDITIONS.map((c) => ({ c, b, batch })));
  const worker = async () => {
    for (let j = jobs.shift(); j; j = jobs.shift())
      await askBatch({ file: batchFile(llm, j.c, j.b), llm, p: prompt(j.c, j.batch), items: j.batch, meta: { llm, format: j.c, batch: j.b } });
  };
  await Promise.all(Array.from({ length: parallel }, worker));
}
