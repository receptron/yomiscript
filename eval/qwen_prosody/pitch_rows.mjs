// The rows pitch.py learns from: nucleus_rows.mjs's morae of each sentence, the three values the dictionary's nuclei give
// each mora (work/fit.json, what the model adds to), and Qwen's three values (the target).
// usage: node pitch_rows.mjs   (after abs.mjs --phrased, --wiki)   -> work/pitch_rows.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { jaContour, parse } from "@yomiscript/core";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import { withNucleiOf } from "./abs.mjs";
import { sentenceRows } from "./nucleus_rows.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict"),
  A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }),
  model = JSON.parse(fs.readFileSync(path.join(HERE, "work/fit.json"), "utf8")),
  corpus = new Map();
for (const file of ["data/jsut_qwen_clone.jsonl", "work/wiki/qwen_clone.jsonl"])
  for (const l of fs.readFileSync(path.join(HERE, file), "utf8").trim().split("\n")) {
    const r = JSON.parse(l);
    if (r.given === "text") corpus.set(r.name, r);
  }
const out = [];
for (const tag of ["_phrased", "_wiki"])
  for (const [name, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(HERE, `work/abs${tag}.json`), "utf8")))) {
    const s = sentenceRows(r.ys, r.d31, r.abs),
      sec = parse(
        withNucleiOf(
          r.ys,
          r.d31.filter((k) => k !== null),
          A,
        ),
      ).sections[0],
      contour = jaContour(sec, model);
    out.push({
      name,
      test: name.startsWith("BASIC5000_") && Number(name.split("_")[1]) % 2 === 1, // the Wikipedia sentences all train
      ...s,
      baseline: sec.toks.filter((t) => t.kind === "unit").map((t) => contour.get(t) ?? null),
      target: corpus.get(name).f0,
    });
  }
fs.writeFileSync(path.join(HERE, "work/pitch_rows.json"), JSON.stringify(out));
console.log(`${out.length} sentences, ${out.filter((s) => s.test).length} in the test half`);
