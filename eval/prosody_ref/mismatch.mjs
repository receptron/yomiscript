// Where the LLM's reading and the dictionary's differ (ja-accent's own comparison, writeMarks' stats.misses), over
// the LLM's readings (runs/claude/none.*.<rep>.json). Phrases with the same number of morae are counted by their
// differing mora pairs (a spelling the comparison could accept, or a real other reading); the others are listed by
// their two readings. usage: node mismatch.mjs   -> results/mismatch.json and a summary
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "@yomiscript/core";
import { dictPhrases, writeMarks } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = path.join(HERE, "../browser_tts/trials/accent_marks/runs/claude");
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
const A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });

const count = (M, k) => M.set(k, (M.get(k) ?? 0) + 1);
const pairs = new Map(),
  other = new Map(),
  total = { phrases: 0, marked: 0, reading: 0, words: 0 };
for (const f of fs.readdirSync(RUNS).filter((x) => x.startsWith("none."))) {
  for (const ys of Object.values(JSON.parse(fs.readFileSync(path.join(RUNS, f), "utf8")).output)) {
    let text;
    try {
      text = parse(ys).texts.join("");
    } catch {
      continue; // an invalid YomiScript
    }
    const { njd, labels } = A.analyze(text),
      P = dictPhrases(text, njd, labels);
    if (!P) continue;
    const { stats } = writeMarks(ys, P);
    for (const k of Object.keys(total)) total[k] += stats[k];
    for (const m of stats.misses) {
      if (m.dict.length !== m.ys.length) count(other, `${m.text}: ${m.dict.join(".")} / ${m.ys.join(".")}`);
      else m.dict.forEach((d, i) => d !== m.ys[i] && count(pairs, `${d} / ${m.ys[i]}`));
    }
  }
}
const top = (M) => [...M].sort((a, b) => b[1] - a[1]);
fs.mkdirSync(path.join(HERE, "results"), { recursive: true });
fs.writeFileSync(path.join(HERE, "results/mismatch.json"), JSON.stringify({ total, pairs: top(pairs), other: top(other) }, null, 1));
console.log(total);
console.log(
  "differing morae, same length (dictionary / YomiScript):",
  top(pairs)
    .map(([k, n]) => `${k} ${n}`)
    .join(", "),
);
console.log(
  "other lengths:",
  top(other).length,
  "kinds; most frequent:",
  top(other)
    .slice(0, 20)
    .map(([k, n]) => `${k} (${n})`)
    .join("; "),
);
