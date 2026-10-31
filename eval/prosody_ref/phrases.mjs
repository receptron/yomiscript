// The dictionary's accent phrases of every text (for accent.py): their morae (OpenJTalk phonemes, H / L), and which
// of the LLM's readings (runs/claude/none.<set>.<rep>.json) read every phrase as the dictionary does, so that the
// same morae can be aligned in our audio of them. usage: node phrases.mjs   -> results/phrases.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dictPhrases, writeMarks } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import { items } from "./items.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.join(HERE, "../browser_tts/trials/accent_marks/runs/claude");
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
const A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });

const out = {};
for (const it of items()) {
  const { njd, labels } = A.analyze(it.text),
    P = dictPhrases(it.text, njd, labels);
  if (!P) continue;
  const same = [];
  for (let rep = 1; rep <= 5; rep++) {
    const f = path.join(RUNS, `none.${it.set}.${rep}.json`),
      ys = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).output[it.name] : null;
    if (!ys) continue;
    try {
      const { stats } = writeMarks(ys, P);
      if (stats.marked === stats.phrases) same.push(rep);
    } catch {
      // an invalid YomiScript
    }
  }
  out[`${it.set}.${it.name}`] = {
    text: it.text,
    phrases: P.map((p) => ({ text: it.text.slice(p.start, p.end), morae: p.morae.map((m) => ({ ph: m.ph, hl: m.hl })) })),
    same,
  };
}
fs.mkdirSync(path.join(HERE, "results"), { recursive: true });
fs.writeFileSync(path.join(HERE, "results/phrases.json"), JSON.stringify(out, null, 1));
const n = Object.values(out);
console.log(`${n.length} texts; readings that match the dictionary in every phrase: ${n.reduce((a, x) => a + x.same.length, 0)}`);
