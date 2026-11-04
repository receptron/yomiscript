// How close to Qwen's pitch the nuclei predicted by nucleus.py come, against D31's and abs.mjs's own, on the test half:
// each sentence's marks rendered by the pitch model fitted to Qwen, its distance to Qwen's three values per mora
// (abs.mjs's distance, in semitones). abs is the best these phrases can do; the share of the gap from D31 to abs that
// the model closes says how much of abs it reproduces.
// usage: node nucleus_eval.mjs [tag]   (after nucleus.py [tag])   -> results/nucleus_eval<tag>.json; with _phrased,
//        in the LLM's accent phrases (work/phrased.json, work/abs_phrased.json); a second tag names the model whose
//        predictions are scored (nucleus.py _phrased _wiki: _phrased+_wiki) and the output
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import { distance, withNucleiOf } from "./abs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict"),
  A = await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }),
  model = JSON.parse(fs.readFileSync(path.join(HERE, "work/fit.json"), "utf8")),
  tag = process.argv[2] ?? "",
  modelTag = process.argv[3] ?? tag,
  shipped = JSON.parse(fs.readFileSync(path.join(HERE, "work/abs.json"), "utf8")),
  read = JSON.parse(fs.readFileSync(path.join(HERE, `work/abs${tag}.json`), "utf8")),
  phrased = tag ? JSON.parse(fs.readFileSync(path.join(HERE, "work/phrased.json"), "utf8")) : {},
  pred = JSON.parse(fs.readFileSync(path.join(HERE, `work/nucleus_pred${modelTag}.json`), "utf8")),
  corpus = new Map(
    fs
      .readFileSync(path.join(HERE, "data/jsut_qwen_clone.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
      .map((r) => [r.name, r]),
  );
// d31, d31Abs: the tools as shipped and abs.mjs in their phrases; start: abs.mjs's start in these phrases (D31's, or D32's in the LLM's)
const sum = { d31: 0, d31Abs: 0, start: 0, abs: 0, model: 0 };
let n = 0,
  closer = 0,
  farther = 0;
for (const [name, P] of Object.entries(pred)) {
  const r = corpus.get(name),
    m = distance(withNucleiOf(phrased[name] ?? r.ys, P, A), r.f0, model);
  sum.d31 += shipped[name].before;
  sum.d31Abs += shipped[name].after;
  sum.start += read[name].before;
  sum.abs += read[name].after;
  sum.model += m;
  closer += m < read[name].before - 0.05;
  farther += m > read[name].before + 0.05;
  n++;
}
const mean = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Number((v / n).toFixed(4))]));
const result = {
  sentences: n,
  mean_rmse_to_qwen: mean,
  gap_closed: Number(((mean.start - mean.model) / (mean.start - mean.abs)).toFixed(3)),
  closer_than_start: closer,
  farther_than_start: farther,
};
console.log(result);
fs.writeFileSync(path.join(HERE, `results/nucleus_eval${modelTag}.json`), JSON.stringify(result, null, 1) + "\n");
