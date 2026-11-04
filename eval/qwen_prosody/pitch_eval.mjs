// The direct pitch model as the tools run it (@yomiscript/ja-accent's pitchYomite, in TypeScript), on the test half: from
// the LLM's YomiScript to the values it writes, their distance to Qwen (abs.mjs's), beside the start and abs, and
// how far those values are from what pitch.py computed in PyTorch.
// usage: node pitch_eval.mjs   (after pitch.py)   -> results/pitch_eval.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "@yomiscript/core";
import { pitchYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer, nodePitchModel } from "@yomiscript/ja-accent/node";
import { contourDistance } from "./abs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), "utf8"));
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict"),
  A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }),
  step = pitchYomite(A, await nodePitchModel({ dir: path.join(HERE, "work/pitch_model") })),
  phrased = read("work/phrased.json"),
  abs = read("work/abs_phrased.json"),
  python = read("work/pitch_test.json"),
  target = new Map(
    fs
      .readFileSync(path.join(HERE, "data/jsut_qwen_clone.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .map((r) => [r.name, r.f0]),
  );
let n = 0,
  model = 0,
  start = 0,
  after = 0,
  closer = 0,
  farther = 0,
  worst = 0,
  ms = 0;
for (const [name, values] of Object.entries(python)) {
  const t0 = performance.now(),
    ys = step(phrased[name]);
  ms += performance.now() - t0;
  const V = parse(ys)
      .sections[0].toks.filter((t) => t.kind === "unit")
      .map((t) => t.f0),
    d = contourDistance(V, target.get(name));
  V.forEach((v, i) => v.forEach((x, j) => (worst = Math.max(worst, Math.abs(x - values[i][j])))));
  n++;
  model += d;
  start += abs[name].before;
  after += abs[name].after;
  closer += d < abs[name].before - 0.05;
  farther += d > abs[name].before + 0.05;
}
const result = {
  sentences: n,
  mean_rmse_to_qwen: { start: +(start / n).toFixed(4), abs: +(after / n).toFixed(4), model: +(model / n).toFixed(4) },
  gap_closed: +((start - model) / (start - after)).toFixed(3),
  closer_than_start: closer,
  farther_than_start: farther,
  largest_difference_from_pytorch: +worst.toFixed(4),
  ms_per_sentence: +(ms / n).toFixed(1),
};
console.log(result);
fs.writeFileSync(path.join(HERE, "results/pitch_eval.json"), JSON.stringify(result, null, 1) + "\n");
