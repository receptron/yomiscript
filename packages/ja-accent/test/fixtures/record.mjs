// Records what the dictionary lookup (D31) asks the front end for the YomiScripts of analysis.json, into lookup.json,
// so the tests replay it without the dictionary: each sentence's candidates, every connection cost asked for, and
// the rules on each path asked for. Run after `yarn build`, with the dictionary in ~/.cache/yomiscript/ja-dict.
// usage: node record.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { accentMarks } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
const real = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });
const rec = { candidates: {}, conn: {}, label: {} };
const recording = {
  analyze: (text) => real.analyze(text),
  candidates: (words) => (rec.candidates[JSON.stringify(words)] = real.candidates(words)),
  conn: (r, l) => (rec.conn[`${r},${l}`] = real.conn(r, l)),
  label: (words, p) => (rec.label[JSON.stringify([words, p])] = real.label(words, p)),
};
const REC = JSON.parse(fs.readFileSync(path.join(HERE, "analysis.json"), "utf8"));
for (const { ys } of REC) {
  accentMarks(ys, recording);
  accentMarks(ys.replace("kʲoː", "kjoː"), recording); // the spelling the tests also try
}
fs.writeFileSync(path.join(HERE, "lookup.json"), JSON.stringify(rec));
console.log(Object.keys(rec.candidates).length, "sentences,", Object.keys(rec.conn).length, "costs,", Object.keys(rec.label).length, "paths");
