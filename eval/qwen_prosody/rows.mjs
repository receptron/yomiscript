// The fitting data for the Japanese pitch model (fit.py): for each sentence of data/jsut_qwen_clone.jsonl, the
// tools' accent marks (the D31 dictionary accent, as `yomiscript speak` adds them), the model's feature rows
// (jaContourRows), Qwen's three values per mora (the target), and the shipped model's values (D29), for comparison.
// Only the morae of accent phrases the dictionary marks are targets: those are the ones the tools give values to
// (realize markedOnly); the others keep Kokoro's own pitch. Only the sentences Qwen read from the text: from kana its
// accent is much further from JSUT's gold (README.md), so the kana pass is not a pitch target.
// usage: node rows.mjs   -> work/rows.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { jaContour, jaContourRows, parse } from "@yomiscript/core";
import { accentMarks } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict"),
  A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) });

/** one sentence: its rows, which morae are targets, Qwen's values and D29's, or null when the units do not match */
export function sentenceData(r, analyzer = A) {
  const marked = accentMarks(r.ys, analyzer),
    sec = parse(marked).sections[0],
    S = jaContourRows(sec),
    d29 = jaContour(sec),
    morae = S.flatMap((s) => s.morae);
  if (morae.length !== r.f0.length) return null;
  const markedPhrase = new Set(morae.filter((m) => m.rise || m.fall).map((m) => m.ph));
  return {
    name: r.name,
    marked,
    sentences: S.map((s) => s.rows),
    target: morae.map((m, i) => (markedPhrase.has(m.ph) ? r.f0[i] : null)),
    d29: morae.map((m) => d29.get(m)),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lines = fs.readFileSync(path.join(HERE, "data/jsut_qwen_clone.jsonl"), "utf8").trim().split("\n"),
    out = [];
  let skipped = 0;
  for (const l of lines) {
    const r = JSON.parse(l);
    if (r.given !== "text") continue;
    const d = sentenceData(r);
    if (d) out.push(d);
    else skipped++;
  }
  fs.writeFileSync(path.join(HERE, "work/rows.json"), JSON.stringify(out));
  const targets = out.reduce((n, d) => n + d.target.filter(Boolean).length, 0),
    all = out.reduce((n, d) => n + d.target.length, 0);
  console.log(`${out.length} sentences (${skipped} with other units), ${targets} of ${all} morae are targets`);
}
