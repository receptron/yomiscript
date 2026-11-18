// Verify the plain JS model using development inputs supplied by verify_values.py.
import fs from "node:fs";
import { parse } from "@yomiscript/core";
import { features, loadModel, predictValues } from "./values_runtime.mjs";
import { qwen3 } from "./qwen3.mjs";
const rows = JSON.parse(fs.readFileSync(0, "utf8")),
  model = loadModel("work");
let maximum = 0,
  encodingMatches = true;
for (const row of rows) {
  encodingMatches &&= JSON.stringify(features(model, row)) === JSON.stringify(row.x);
  predictValues(model, row).forEach((v, i) =>
    v.forEach((n, j) => {
      maximum = Math.max(maximum, Math.abs(n - row.values[i][j]));
    }),
  );
}
const bare = "ja /soː<t:そう> | da<t:だ> ↘/",
  output = qwen3(bare),
  units = parse(output).sections[0].toks.filter((t) => t.kind === "unit"),
  stripped = output.replaceAll(/<f0:[^>]*>/g, "");
if (stripped !== bare || units.length !== 3 || units.some((t) => !t.f0) || /[ꜛꜜ]/.test(output)) throw new Error("YomiScript output contract failed");
console.log(
  JSON.stringify({ maximum_value_difference: maximum, encoding_matches: encodingMatches, output_contract: true, development_sentences: rows.length }),
);
