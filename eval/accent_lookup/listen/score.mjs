// The answers of the listening page (listening.<name>.json, downloaded from it) against the key in set.json: per
// item, which method each listener preferred, and the totals.
// usage: node score.mjs <answers.json> [...]   -> results/listen.json and a summary
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SET } from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const set = JSON.parse(fs.readFileSync(SET, "utf8")),
  files = process.argv.slice(2);
if (!files.length) throw new Error("usage: node score.mjs <answers.json> [...]");

/** an answer as a verdict on the methods: the preferred one, same, or both unnatural */
function verdict(it, choice) {
  if (choice === "x") return it.x.method;
  if (choice === "y") return it.y.method;
  return choice; // "same", "bad"
}
const KINDS = ["lookup", "analysis", "same", "bad"],
  total = Object.fromEntries(KINDS.map((k) => [k, 0])),
  rows = [];
for (const f of files) {
  const a = JSON.parse(fs.readFileSync(f, "utf8"));
  if (a.set !== set.seed) throw new Error(`${f}: answers to set ${a.set}, not ${set.seed}`);
  for (const it of set.items) {
    const ans = a.answers[it.item];
    if (!ans?.choice) continue;
    const v = verdict(it, ans.choice);
    total[v]++;
    rows.push({
      listener: a.listener,
      item: it.item,
      changed: it.words.filter((w) => w.changed).map((w) => `${w.t} ${w.analysis} -> ${w.lookup}`),
      verdict: v,
      note: ans.note ?? "",
    });
  }
}
fs.mkdirSync(path.join(HERE, "../results"), { recursive: true });
fs.writeFileSync(path.join(HERE, "../results/listen.json"), JSON.stringify({ seed: set.seed, total, rows }, null, 1));
for (const r of rows) {
  const note = r.note ? `  (${r.note})` : "";
  console.log(`${r.listener} ${r.item} ${r.verdict.padEnd(8)} ${r.changed.join(", ")}${note}`);
}
console.log("preferred: prototype", total.lookup, "| ja-accent", total.analysis, "| same", total.same, "| both unnatural", total.bad);
