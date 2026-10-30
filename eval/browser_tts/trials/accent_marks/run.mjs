// The accent-mark trial, repeated: Claude or Codex as the Yomite with each prompt, several runs, written to runs/<llm>/.
//   none      ../../prompt.md (the shipped wording: no marks)
//   every     prompt_every.md (mark every accent phrase you know, in one pass with the reading)
//   addmarks  prompt_addmarks.md (second pass: marks only, added to the `none` run's YomiScript of the same rep)
// usage: node run.mjs <none|every|addmarks> <hard|ja> <rep> [claude|codex]   -> runs/<llm>/<prompt>.<set>.<rep>.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { call, json } from "../../../llm_yomite/llm.mjs";
import { buildPrompt, SETS } from "../../sets.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [kind, set, rep, llm = "claude"] = process.argv.slice(2);
const read = (f) => fs.readFileSync(path.join(HERE, f), "utf8");
const runFile = (k, r) => path.join(HERE, "runs", llm, `${k}.${set}.${r}.json`);

function prompt() {
  if (kind === "none") return buildPrompt(read("../../prompt.md"), SETS[set]);
  if (kind === "every") return buildPrompt(read("prompt_every.md"), SETS[set]);
  const base = JSON.parse(fs.readFileSync(runFile("none", rep), "utf8")).output;
  const items = SETS[set].filter((x) => base[x.name]).map((x) => `- ${x.name}: ${base[x.name]}`);
  return read("prompt_addmarks.md").replace("{{ITEMS}}", items.join("\n"));
}
if (!["none", "every", "addmarks"].includes(kind) || !SETS[set] || !rep || !["claude", "codex"].includes(llm))
  throw new Error("usage: node run.mjs <none|every|addmarks> <hard|ja> <rep> [claude|codex]");
const r = call(llm, prompt()),
  out = json(r.text);
const rec = {
  llm,
  prompt: kind,
  set,
  rep: Number(rep),
  model: r.model,
  seconds: r.seconds,
  outputTokens: r.outputTokens,
  date: new Date().toISOString(),
  output: out,
};
if (!out) rec.raw = r.text;
fs.mkdirSync(path.join(HERE, "runs", llm), { recursive: true });
fs.writeFileSync(runFile(kind, rep), JSON.stringify(rec, null, 1));
console.log(`${kind} ${set} ${rep}: ${out ? Object.keys(out).length + " items" : "no JSON"}, ${r.seconds.toFixed(0)} s`);
