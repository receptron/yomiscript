// Experimental switchable pitch inference. qwen3 reads only its weights and memory keys.
// Usage: node qwen3.mjs --engine qwen3 'ja /.../'
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyEdits, isJa, parse } from "@yomiscript/core";
import { pitchRows, phraseUnits } from "@yomiscript/ja-accent";

import { loadModel, predictValues } from "./values_runtime.mjs";

let cachedModel;
const here = path.dirname(fileURLToPath(import.meta.url));

export function qwen3(ys) {
  const bare = ys.replaceAll(/[ꜛꜜ]/g, "").replaceAll(/<f0:[^>]*>/g, ""),
    parsed = parse(bare),
    sections = parsed.sections.filter((s) => isJa(s.lang)),
    rows = sections.map((sec) =>
      pitchRows(
        sec,
        parsed.texts,
        phraseUnits(sec).map(() => null),
      ),
    ),
    model = (cachedModel ??= loadModel(path.join(here, "work"))),
    values = rows.map((row) => predictValues(model, row)),
    edits = [];
  sections.forEach((sec, j) => {
    phraseUnits(sec)
      .flat()
      .forEach((t, i) => edits.push({ at: t.end, ins: `<f0:${values[j][i].join(",")}>` }));
  });
  return applyEdits(bare, edits);
}

async function main() {
  const args = process.argv.slice(2),
    at = args.indexOf("--engine"),
    engine = at < 0 ? "qwen3" : args.splice(at, 2)[1],
    ys = args.length ? args.join(" ") : fs.readFileSync(0, "utf8").trim();
  if (engine === "qwen3") return console.log(qwen3(ys));
  const { accentMarks, pitchYomite } = await import("@yomiscript/ja-accent"),
    { nodeAnalyzer, nodePitchModel } = await import("@yomiscript/ja-accent/node"),
    cache = path.join(process.env.HOME, ".cache/yomiscript"),
    dict = path.join(cache, "ja-dict"),
    analyzer = await nodeAnalyzer({ dir: path.join(dict, fs.readdirSync(dict)[0]) });
  if (engine === "dictionary") console.log(accentMarks(ys, analyzer));
  else if (engine === "qwen2") console.log(pitchYomite(analyzer, await nodePitchModel({ dir: path.join(cache, "ja-pitch/qwen-2") }))(ys));
  else throw new Error(`Unknown engine: ${engine}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
